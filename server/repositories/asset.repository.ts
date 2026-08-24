import type { PoolClient } from '../db/pool';
import type { Asset, AssetInput } from '../../shared/types';
import type { AssetFieldDef, AssetFieldValues } from '../../shared/asset-fields';
import { coerceFieldDefs, hasNoErrors, validateFieldValues } from '../../shared/asset-fields';
import type { AssetCategoryRow, AssetRow } from './row-types';
import { rowToAsset } from '../mappers';
import { buildSetClause } from './sql';
import { ValidationError } from '../http/errors';

export interface AssetRepository {
  getAll(): Promise<Asset[]>;
  add(input: AssetInput): Promise<Asset>;
  update(id: number, input: Partial<AssetInput>): Promise<void>;
  remove(id: number): Promise<void>;
}

const COLUMNS: Partial<Record<keyof AssetInput, string>> = {
  categoryId: 'category_id',
  name: 'name',
  value: 'value',
};

export function createAssetRepository(client: PoolClient, ledgerId: number): AssetRepository {
  /**
   * The parameter definitions a holding must satisfy.
   *
   * The lookup is also an authorization check by construction: the SELECT runs
   * inside the ledger-scoped transaction, so a category id from another ledger
   * comes back empty and is reported as bad input rather than being confirmed
   * to exist.
   *
   * `lock` is taken whenever the caller is putting a holding INTO this category
   * -- adding one, or moving one here. See the note on update() for the one
   * case that safely needs no lock, and for why the lock order matters.
   */
  async function loadDefs(categoryId: number, lock: boolean): Promise<AssetFieldDef[]> {
    const { rows } = await client.query<Pick<AssetCategoryRow, 'fields'>>(
      `SELECT fields FROM asset_categories WHERE id = $1${lock ? ' FOR SHARE' : ''}`,
      [categoryId],
    );
    if (rows.length === 0) {
      throw new ValidationError('指定された資産カテゴリが存在しません');
    }
    return coerceFieldDefs(rows[0].fields);
  }

  /**
   * Checks a holding's parameters against the shape its category defines.
   *
   * This is the validation a static schema cannot do: which parameters are
   * required, and of what type, is a row in another table rather than a
   * constant. It runs on the server even though the form checks the same rules,
   * because the form is not what the server receives -- a body is.
   *
   * `requireFilled` is passed down rather than applied as a filter on the
   * result: only validateFieldValues knows what counts as blank, and a filter
   * here would also swallow the type errors it reports, which always matter.
   */
  function validateValues(
    defs: AssetFieldDef[],
    raw: Readonly<Record<string, unknown>> | null | undefined,
    requireFilled: boolean,
  ): AssetFieldValues {
    const { values, errors } = validateFieldValues(defs, raw, { requireFilled });
    if (!hasNoErrors(errors)) {
      throw new ValidationError('資産のパラメータが不正です', errors);
    }
    return values;
  }

  return {
    async getAll() {
      const { rows } = await client.query<AssetRow>(
        'SELECT * FROM assets ORDER BY category_id ASC, id ASC',
      );
      return rows.map(rowToAsset);
    },

    async add(input) {
      // FOR SHARE, and it is load-bearing.
      //
      // reshapeHoldings brings a category's holdings in line with its new
      // definitions by locking the rows it can see -- and it cannot see a row
      // that does not exist yet. Without this lock, an INSERT running alongside
      // a definition change slips between the two: the reshape misses it, and
      // the new holding keeps a value for a parameter the category no longer
      // defines. That is exactly the state the reshape exists to prevent, and
      // it comes back as soon as the freed key is handed out again.
      //
      // Holding it here makes the definition change wait for this insert. Two
      // concurrent inserts do not block each other -- FOR SHARE is shared.
      const defs = await loadDefs(input.categoryId, true);
      const values = validateValues(defs, input.fields, true);

      const { rows } = await client.query<AssetRow>(
        `INSERT INTO assets (ledger_id, category_id, name, value, fields)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        // JSON.stringify for the same reason as in the category repository: the
        // driver would otherwise hand a jsonb column something it rejects.
        [ledgerId, input.categoryId, input.name, input.value, JSON.stringify(values)],
      );
      return rowToAsset(rows[0]);
    },

    async update(id, input) {
      // ---------------------------------------------------------------------
      // LOCK ORDER, AND WHY THE UNLOCKED READ IS SAFE
      //
      // Two transactions can touch the same holding: this one, and a change to
      // its category's definitions (asset-category.repository.ts), which locks
      // `asset_categories` first and then every holding of that category FOR
      // UPDATE. Taking those two locks in the opposite order here would produce
      // a deadlock, so:
      //
      //  - Moving a holding to ANOTHER category reads that category FOR SHARE
      //    FIRST, keeping the order category -> asset. Without the lock the
      //    destination's definitions could change between the read and the
      //    write, storing values shaped by definitions that no longer exist.
      //
      //  - Staying in the same category takes NO category lock, and does not
      //    need one: a definition change for that category cannot commit while
      //    we hold FOR UPDATE on this row, because reshaping the holdings is
      //    part of that change and would block on this very lock.
      //
      // The FOR UPDATE itself is what stops a lost update: this method rewrites
      // `fields` wholesale, so a concurrent write read without it would be
      // silently reverted by whichever transaction committed last.
      // ---------------------------------------------------------------------
      const lockedDefs =
        input.categoryId === undefined ? undefined : await loadDefs(input.categoryId, true);

      const { rows: existing } = await client.query<Pick<AssetRow, 'category_id' | 'fields'>>(
        'SELECT category_id, fields FROM assets WHERE id = $1 FOR UPDATE',
        [id],
      );
      // No row means it does not exist in THIS ledger -- row-level security has
      // already hidden anything belonging to another. A silent no-op is what
      // every other repository does for an unknown id, and saying more would
      // confirm that the id exists somewhere.
      if (existing.length === 0) return;

      // Validation runs against the state the row would END UP in, not the patch
      // alone. Moving a holding to another category re-checks its parameters
      // against the new shape, which is the only way a required parameter of the
      // destination cannot be skipped by simply not mentioning it.
      const defs = lockedDefs ?? (await loadDefs(existing[0].category_id, false));
      const rawFields =
        input.fields !== undefined
          ? input.fields
          : (existing[0].fields as Record<string, unknown> | null);
      const values = validateValues(
        defs,
        rawFields,
        // The caller decided this holding's shape if it supplied values, or if
        // it moved the holding somewhere with a different shape.
        input.fields !== undefined || input.categoryId !== undefined,
      );

      const { sets, params } = buildSetClause(input, COLUMNS);

      // Always rewritten, even when the patch did not mention `fields`: a change
      // of category can drop parameters the new shape does not define, and
      // leaving the old JSON behind would keep values the UI cannot show and the
      // next reader cannot interpret.
      params.push(JSON.stringify(values));
      sets.push(`fields = $${params.length}`);
      sets.push('updated_at = now()');

      await client.query(
        `UPDATE assets SET ${sets.join(', ')} WHERE id = $${params.length + 1}`,
        [...params, id],
      );
    },

    async remove(id) {
      await client.query('DELETE FROM assets WHERE id = $1', [id]);
    },
  };
}
