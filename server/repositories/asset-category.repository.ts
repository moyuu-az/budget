import type { PoolClient } from '../db/pool';
import type { AssetCategory, AssetCategoryInput } from '../../shared/types';
import type { AssetFieldDef } from '../../shared/asset-fields';
import { hasNoErrors, validateFieldDefs } from '../../shared/asset-fields';
import type { AssetCategoryRow } from './row-types';
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

/** Rejects a definition list the UI could not render, before it reaches JSONB. */
function assertValidDefs(defs: readonly AssetFieldDef[]): void {
  const { errors } = validateFieldDefs(defs);
  if (!hasNoErrors(errors)) {
    throw new ValidationError('資産カテゴリのパラメータ定義が不正です', errors);
  }
}

export function createAssetCategoryRepository(
  client: PoolClient,
  ledgerId: number,
): AssetCategoryRepository {
  return {
    async getAll() {
      const { rows } = await client.query<AssetCategoryRow>(
        'SELECT * FROM asset_categories ORDER BY sort_order ASC, id ASC',
      );
      return rows.map(rowToAssetCategory);
    },

    async add(input) {
      const fields = input.fields ?? [];
      assertValidDefs(fields);

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
      if (input.fields !== undefined) assertValidDefs(input.fields);

      const { sets, params } = buildSetClause(input, COLUMNS);

      // Handled outside buildSetClause because the stored form is a JSON string,
      // not the domain value -- see encodeFields.
      if (input.fields !== undefined) {
        params.push(encodeFields(input.fields));
        sets.push(`fields = $${params.length}`);
      }

      if (sets.length === 0) return;
      sets.push('updated_at = now()');

      // NOTE: removing a field definition does NOT rewrite the holdings that
      // already carry a value for it. The value simply stops being rendered
      // (the UI iterates definitions, not stored keys) and is dropped the next
      // time that holding is saved. Deleting the values here would make an
      // accidental removal unrecoverable.
      await client.query(
        `UPDATE asset_categories SET ${sets.join(', ')} WHERE id = $${params.length + 1}`,
        [...params, id],
      );
    },

    async remove(id) {
      // Holdings cascade from the composite foreign key on assets: an orphaned
      // holding would carry parameter values with no definitions to read them
      // by. The UI says how many will go before asking to confirm.
      await client.query('DELETE FROM asset_categories WHERE id = $1', [id]);
    },
  };
}
