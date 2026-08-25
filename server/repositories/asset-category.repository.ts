import type { PoolClient } from '../db/pool';
import type { AssetCategory, AssetCategoryInput } from '../../shared/types';
import type { AssetFieldDef } from '../../shared/asset-fields';
import {
  coerceFieldValues,
  hasNoErrors,
  normalizeFieldDefs,
  validateFieldDefs,
  validateFieldValues,
} from '../../shared/asset-fields';
import { CASH_CATEGORY_DEFAULTS } from '../../shared/asset-templates';
import type { AssetCategoryRow, AssetRow } from './row-types';
import { rowToAssetCategory } from '../mappers';
import { buildSetClause } from './sql';
// The error taxonomy lives under http/ for historical reasons but is
// application-wide: AppError and its subclasses describe what went wrong, and
// only toEnvelope/statusFor turn that into HTTP. Importing it here does not make
// the repository aware of a transport.
import { ValidationError } from '../http/errors';

export interface AssetCategoryRepository {
  getAll(): Promise<AssetCategory[]>;
  add(input: AssetCategoryInput): Promise<AssetCategory>;
  update(id: number, input: Partial<AssetCategoryInput>): Promise<void>;
  remove(id: number): Promise<void>;
}

/** Domain field -> column, for the columns a plain patch can set. */
const COLUMNS: Partial<Record<keyof AssetCategoryInput, string>> = {
  name: 'name',
  color: 'color',
  sortOrder: 'sort_order',
};

/**
 * `fields` is JSONB and must be handed to the driver as a JSON STRING.
 *
 * This is not defensive stringification. node-postgres serialises a JS object to
 * JSON, but it serialises a JS ARRAY to PostgreSQL's array literal syntax
 * ({a,b}), which a jsonb column rejects -- and AssetFieldDef[] is exactly an
 * array. Passing it raw fails at runtime only, and only once someone defines a
 * field, so it is the sort of bug that ships.
 */
function encodeFields(defs: readonly AssetFieldDef[]): string {
  return JSON.stringify(defs);
}

/**
 * Rejects a definition list the UI could not render, and returns its stored form.
 *
 * Normalisation (trimming labels, turning an empty unit into null) happens on
 * the way in rather than only in the dialog, because the dialog is not what the
 * server receives.
 */
function toStoredDefs(defs: readonly AssetFieldDef[]): AssetFieldDef[] {
  const normalized = normalizeFieldDefs(defs);
  const { errors } = validateFieldDefs(normalized);
  if (!hasNoErrors(errors)) {
    throw new ValidationError('資産カテゴリのパラメータ定義が不正です', errors);
  }
  return normalized;
}

export function createAssetCategoryRepository(
  client: PoolClient,
  ledgerId: number,
): AssetCategoryRepository {
  /**
   * Brings every holding of a category back in line with its NEW definitions.
   *
   * WHY THIS EXISTS -- and why it is not optional
   *   The invariant the rest of the code assumes is: a holding's `fields` only
   *   ever contains keys the category currently defines. Without this function
   *   that invariant is false the moment someone removes a parameter, and the
   *   consequences are not cosmetic:
   *
   *     - Keys are recycled. nextFieldKey() hands out the lowest free number, so
   *       deleting 「証券会社」(f2) and adding 「満期日」(f2) makes the orphaned
   *       'SBI証券' reappear as the new field's value -- displayed in the wrong
   *       column, and rejected by validation when that holding is next saved.
   *       The holding becomes unsavable until the user clears a box they never
   *       filled in.
   *     - Changing a parameter's type strands a value the new type cannot read.
   *
   *   Recycling keys is not the bug: it is what keeps keys short and stable. The
   *   bug is orphaned values outliving their definition, so that is what is
   *   fixed here -- once, at the single point where definitions change, rather
   *   than by a guard at each of the places that read them.
   *
   * WHAT IT COSTS
   *   Removing a parameter now discards its values irreversibly. That is a real
   *   loss, chosen deliberately over the alternative: values that are invisible,
   *   unqueryable, and capable of resurfacing under someone else's label. The
   *   dialog says so before saving.
   *
   * Runs in the caller's transaction (the same ledger-scoped client), so a
   * failure leaves neither the definitions nor the holdings changed.
   */
  async function reshapeHoldings(categoryId: number, defs: AssetFieldDef[]): Promise<void> {
    const { rows } = await client.query<Pick<AssetRow, 'id' | 'fields'>>(
      'SELECT id, fields FROM assets WHERE category_id = $1 FOR UPDATE',
      [categoryId],
    );

    for (const row of rows) {
      // Errors are ignored on purpose: a newly-required parameter must not make
      // an existing holding impossible to store. It becomes null and the form
      // asks for it the next time that holding is edited.
      const { values } = validateFieldValues(defs, coerceFieldValues(row.fields));
      await client.query('UPDATE assets SET fields = $1, updated_at = now() WHERE id = $2', [
        JSON.stringify(values),
        row.id,
      ]);
    }
  }

  async function selectAll(): Promise<AssetCategoryRow[]> {
    const { rows } = await client.query<AssetCategoryRow>(
      'SELECT * FROM asset_categories ORDER BY sort_order ASC, id ASC',
    );
    return rows;
  }

  /**
   * Makes sure this ledger has its cash category, and returns the list again.
   *
   * WHY A READ PROVISIONS
   *   `kind: 'cash'` is a guarantee the whole application leans on -- it is where
   *   「現在の残高」 comes from, and a ledger without it would show a balance of
   *   zero and forecast from zero. Guarantees that matter that much should not
   *   depend on every creation path remembering to seed.
   *
   *   And there are several such paths: the auth layer provisions a shared
   *   ledger and a personal one, scripts/import-sqlite.ts creates one per
   *   imported database, the tests create their own. Seeding at creation means
   *   four places to keep correct, and the failure mode of missing one is a
   *   household whose money has vanished from the dashboard.
   *
   *   Ensuring it HERE means there is one place, it cannot be skipped, and it
   *   repairs a ledger that predates the guarantee rather than only preventing
   *   new ones. This mirrors what the auth layer already does with users and
   *   ledgers: provision just in time, on first sight.
   *
   *   The cost is that a GET writes -- but only on the first call for a ledger
   *   that lacks the row, and never after. The normal path is one SELECT and
   *   nothing else, because the check reads the rows already fetched.
   *
   * CONCURRENCY
   *   Two requests for the same fresh ledger can both find no cash category. The
   *   partial unique index (migration 004) turns the loser's insert into a
   *   no-op instead of an error, and the re-read afterwards gives both callers
   *   the same single row.
   */
  async function provisionCashCategory(): Promise<AssetCategoryRow[]> {
    await client.query(
      `INSERT INTO asset_categories (ledger_id, name, color, sort_order, fields, kind)
         VALUES ($1, $2, $3, $4, $5, 'cash')
       ON CONFLICT (ledger_id) WHERE kind = 'cash' DO NOTHING`,
      [
        ledgerId,
        CASH_CATEGORY_DEFAULTS.name,
        CASH_CATEGORY_DEFAULTS.color,
        CASH_CATEGORY_DEFAULTS.sortOrder,
        encodeFields(CASH_CATEGORY_DEFAULTS.fields),
      ],
    );
    return selectAll();
  }

  return {
    async getAll() {
      const rows = await selectAll();
      const complete = rows.some((row) => row.kind === 'cash')
        ? rows
        : await provisionCashCategory();
      return complete.map(rowToAssetCategory);
    },

    async add(input) {
      const fields = toStoredDefs(input.fields ?? []);

      // Per ledger, because row-level security already confines the scan.
      const { rows: maxRows } = await client.query<{ max_order: number }>(
        'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM asset_categories',
      );
      const sortOrder = input.sortOrder ?? maxRows[0].max_order + 1;

      const { rows } = await client.query<AssetCategoryRow>(
        `INSERT INTO asset_categories (ledger_id, name, color, sort_order, fields)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [ledgerId, input.name, input.color ?? null, sortOrder, encodeFields(fields)],
      );
      return rowToAssetCategory(rows[0]);
    },

    async update(id, input) {
      const defs = input.fields === undefined ? undefined : toStoredDefs(input.fields);

      const { sets, params } = buildSetClause(input, COLUMNS);

      // Handled outside buildSetClause because the stored form is a JSON string,
      // not the domain value -- see encodeFields.
      if (defs !== undefined) {
        params.push(encodeFields(defs));
        sets.push(`fields = $${params.length}`);
      }

      if (sets.length === 0) return;
      sets.push('updated_at = now()');

      await client.query(
        `UPDATE asset_categories SET ${sets.join(', ')} WHERE id = $${params.length + 1}`,
        [...params, id],
      );

      if (defs !== undefined) await reshapeHoldings(id, defs);
    },

    async remove(id) {
      // The cash category is the account balance. Deleting it would take every
      // cash holding with it (the cascade below), leaving the household with a
      // balance of zero and a forecast to match -- and getAll() would provision
      // a fresh empty one on the next page load, so the loss would look like the
      // app simply forgot.
      //
      // Refused here rather than only in the UI: the UI hides the button, but
      // the method is reachable, and this is the invariant every reader of
      // `kind: 'cash'` depends on.
      const { rows } = await client.query<Pick<AssetCategoryRow, 'kind'>>(
        'SELECT kind FROM asset_categories WHERE id = $1',
        [id],
      );
      if (rows[0]?.kind === 'cash') {
        throw new ValidationError('現金は残高そのものなので削除できません');
      }

      // Holdings cascade from the composite foreign key on assets: an orphaned
      // holding would carry parameter values with no definitions to read them
      // by. The UI says how many will go before asking to confirm.
      //
      // No row means another ledger's id (row-level security hides it) or one
      // already gone; both leave this a silent no-op, as DELETE always was.
      await client.query('DELETE FROM asset_categories WHERE id = $1', [id]);
    },
  };
}
