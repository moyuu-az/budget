import type { PoolClient } from '../db/pool';
import type { EntryTemplate, EntryTemplateInput } from '../../shared/types';
import type { TemplateRow } from './row-types';
import { rowToTemplate } from '../mappers';
import { buildSetClause } from './sql';

export interface TemplateRepository {
  getAll(): Promise<EntryTemplate[]>;
  add(input: EntryTemplateInput): Promise<EntryTemplate>;
  update(id: number, input: Partial<EntryTemplateInput>): Promise<void>;
  toggle(id: number, enabled: boolean): Promise<void>;
  remove(id: number): Promise<void>;
}

const COLUMNS: Partial<Record<keyof EntryTemplateInput, string>> = {
  name: 'name',
  dayOfMonth: 'day_of_month',
  type: 'type',
  categoryId: 'category_id',
  defaultAmount: 'default_amount',
};

export function createTemplateRepository(
  client: PoolClient,
  ledgerId: number,
): TemplateRepository {
  return {
    async getAll() {
      const { rows } = await client.query<TemplateRow>(
        'SELECT * FROM entry_templates ORDER BY sort_order ASC, day_of_month ASC',
      );
      return rows.map(rowToTemplate);
    },

    async add(input) {
      const { rows: maxRows } = await client.query<{ max_order: number }>(
        'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM entry_templates',
      );

      // A category id from another ledger is rejected by the composite foreign
      // key, not silently accepted -- the caller gets an error rather than a
      // template pointing somewhere it cannot see.
      const { rows } = await client.query<TemplateRow>(
        `INSERT INTO entry_templates
           (ledger_id, name, day_of_month, type, sort_order, category_id, default_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          ledgerId,
          input.name,
          input.dayOfMonth,
          input.type,
          maxRows[0].max_order + 1,
          input.categoryId ?? null,
          input.defaultAmount ?? 0,
        ],
      );
      return rowToTemplate(rows[0]);
    },

    async update(id, input) {
      const { sets, params } = buildSetClause(input, COLUMNS);
      if (sets.length === 0) return;

      sets.push('updated_at = now()');
      await client.query(
        `UPDATE entry_templates SET ${sets.join(', ')} WHERE id = $${params.length + 1}`,
        [...params, id],
      );
    },

    async toggle(id, enabled) {
      await client.query(
        'UPDATE entry_templates SET enabled = $1, updated_at = now() WHERE id = $2',
        [enabled, id],
      );
    },

    async remove(id) {
      // monthly_amounts and monthly_actuals cascade from the composite FK.
      await client.query('DELETE FROM entry_templates WHERE id = $1', [id]);
    },
  };
}
