import type { PoolClient } from '../db/pool';
import type { EntryTemplate, EntryTemplateInput } from '../../shared/types';
import type { TemplateRow } from './row-types';
import { recurrenceToColumns, rowToTemplate } from '../mappers';
import { buildSetClause } from './sql';

export interface TemplateRepository {
  getAll(): Promise<EntryTemplate[]>;
  add(input: EntryTemplateInput): Promise<EntryTemplate>;
  update(id: number, input: Partial<EntryTemplateInput>): Promise<void>;
  toggle(id: number, enabled: boolean): Promise<void>;
  remove(id: number): Promise<void>;
}

// `recurrence` is deliberately absent: it is ONE domain field spread across five
// columns, and buildSetClause maps one field to one column. It is expanded
// separately in update() below -- see the note there for why all five are always
// written together.
const COLUMNS: Partial<Record<keyof EntryTemplateInput, string>> = {
  name: 'name',
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
      // Ordered by the day the entry falls on, which for a one-off lives in
      // on_date rather than in day_of_month. COALESCE keeps the ordering defined
      // for every shape; without it PostgreSQL sorts NULLs last and every
      // one-off would be pushed to the bottom of its group regardless of date.
      //
      // The client re-sorts within a month anyway (it knows the clamped day, which
      // SQL here does not), so this only has to be stable and sensible.
      const { rows } = await client.query<TemplateRow>(
        `SELECT * FROM entry_templates
          ORDER BY sort_order ASC,
                   COALESCE(day_of_month, EXTRACT(DAY FROM on_date)::INTEGER) ASC`,
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
      const r = recurrenceToColumns(input.recurrence);
      const { rows } = await client.query<TemplateRow>(
        `INSERT INTO entry_templates
           (ledger_id, name, type, sort_order, category_id, default_amount,
            recurrence_kind, day_of_month, month_of_year, interval_months,
            anchor_month, on_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [
          ledgerId,
          input.name,
          input.type,
          maxRows[0].max_order + 1,
          input.categoryId ?? null,
          input.defaultAmount ?? 0,
          r.recurrence_kind,
          r.day_of_month,
          r.month_of_year,
          r.interval_months,
          r.anchor_month,
          r.on_date,
        ],
      );
      return rowToTemplate(rows[0]);
    },

    async update(id, input) {
      const { recurrence, ...rest } = input;
      const { sets, params } = buildSetClause(rest, COLUMNS);

      // ALL FIVE recurrence columns are written together, NULLs included.
      //
      // Writing only the ones the new shape uses would leave the previous
      // shape's values behind: a template changed from yearly to monthly would
      // keep its month_of_year, and entry_templates_recurrence_shape_chk would
      // reject the UPDATE with a CONFLICT naming a column the user never
      // touched. recurrenceToColumns returns the complete set for that reason.
      if (recurrence !== undefined) {
        for (const [column, value] of Object.entries(recurrenceToColumns(recurrence))) {
          params.push(value);
          sets.push(`${column} = $${params.length}`);
        }
      }

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
