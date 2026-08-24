import type { PoolClient } from '../db/pool';
import type { Category, CategoryInput } from '../../shared/types';
import type { CategoryRow } from './row-types';
import { rowToCategory } from '../mappers';
import { buildSetClause } from './sql';

export interface CategoryRepository {
  getAll(): Promise<Category[]>;
  add(input: CategoryInput): Promise<Category>;
  update(id: number, input: Partial<CategoryInput>): Promise<void>;
  remove(id: number): Promise<void>;
}

/** Domain field -> column. The only place the correspondence is written down. */
const COLUMNS: Partial<Record<keyof CategoryInput, string>> = {
  name: 'name',
  type: 'type',
  color: 'color',
  sortOrder: 'sort_order',
  costType: 'cost_type',
};

export function createCategoryRepository(
  client: PoolClient,
  ledgerId: number,
): CategoryRepository {
  return {
    async getAll() {
      const { rows } = await client.query<CategoryRow>(
        'SELECT * FROM categories ORDER BY type ASC, sort_order ASC',
      );
      return rows.map(rowToCategory);
    },

    async add(input) {
      // MAX(sort_order) is per ledger, and row-level security already confines
      // the scan to this ledger -- so the next number continues this household's
      // ordering rather than a global one.
      const { rows: maxRows } = await client.query<{ max_order: number }>(
        'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM categories WHERE type = $1',
        [input.type],
      );
      const sortOrder = input.sortOrder ?? maxRows[0].max_order + 1;

      // cost_type on an income category is refused by the CHECK constraint in
      // migration 003 rather than silently stored -- 固定費/変動費 has no meaning
      // for income, and a value nothing reads is worse than an error.
      const { rows } = await client.query<CategoryRow>(
        `INSERT INTO categories (ledger_id, name, type, color, sort_order, cost_type)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [ledgerId, input.name, input.type, input.color ?? null, sortOrder, input.costType ?? null],
      );
      return rowToCategory(rows[0]);
    },

    async update(id, input) {
      // Turning a category into an income one clears its 固定費/変動費 rather
      // than failing.
      //
      // The CHECK constraint would otherwise reject the row, and the caller
      // would get PostgreSQL's own text about a named constraint -- which
      // reaches the user as the generic CONFLICT message and explains nothing.
      // Clearing is also the honest reading of the request: the classification
      // does not exist for income, so there is nothing to preserve. An explicit
      // costType in the same patch still wins, and is still refused by the
      // constraint, because that combination is a contradiction rather than a
      // consequence.
      const patch =
        input.type === 'income' && input.costType === undefined
          ? { ...input, costType: null }
          : input;

      const { sets, params } = buildSetClause(patch, COLUMNS);
      if (sets.length === 0) return;

      await client.query(
        `UPDATE categories SET ${sets.join(', ')} WHERE id = $${params.length + 1}`,
        [...params, id],
      );
    },

    async remove(id) {
      // The composite FK on entry_templates carries ON DELETE SET NULL
      // (category_id), so templates survive and merely become uncategorised.
      await client.query('DELETE FROM categories WHERE id = $1', [id]);
    },
  };
}
