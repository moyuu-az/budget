import type { PoolClient } from '../db/pool';
import type { Asset, AssetInput } from '../../shared/types';
import type { AssetFieldValues } from '../../shared/asset-fields';
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
   * Checks a holding's parameters against the shape its category defines.
   *
   * This is the validation a static schema cannot do: which parameters are
   * required, and of what type, is a row in another table rather than a
   * constant. It runs on the server even though the form checks the same rules,
   * because the form is not what the server receives -- a body is.
   *
   * The category lookup is also an authorization check by construction: the
   * SELECT is inside the ledger-scoped transaction, so a category id from
   * another ledger comes back empty and is reported as bad input rather than
   * being confirmed to exist.
   */
  async function validateAgainstCategory(
    categoryId: number,
    raw: Readonly<Record<string, unknown>> | null | undefined,
  ): Promise<AssetFieldValues> {
    const { rows } = await client.query<Pick<AssetCategoryRow, 'fields'>>(
      'SELECT fields FROM asset_categories WHERE id = $1',
      [categoryId],
    );
    if (rows.length === 0) {
      throw new ValidationError('指定された資産カテゴリが存在しません');
    }

    const defs = coerceFieldDefs(rows[0].fields);
    const { values, errors } = validateFieldValues(defs, raw);
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
      const values = await validateAgainstCategory(input.categoryId, input.fields);

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
      const { rows: existing } = await client.query<Pick<AssetRow, 'category_id' | 'fields'>>(
        'SELECT category_id, fields FROM assets WHERE id = $1',
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
      const categoryId = input.categoryId ?? existing[0].category_id;
      const rawFields =
        input.fields !== undefined
          ? input.fields
          : (existing[0].fields as Record<string, unknown> | null);
      const values = await validateAgainstCategory(categoryId, rawFields);

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
