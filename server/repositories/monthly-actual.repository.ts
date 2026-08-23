import type { PoolClient } from '../db/pool';
import type { MonthlyActual } from '../../shared/types';
import type { MonthlyActualRow } from './row-types';
import { rowToMonthlyActual } from '../mappers';

export interface MonthlyActualRepository {
  getForMonth(yearMonth: string): Promise<MonthlyActual[]>;
  getForRange(startMonth: string, endMonth: string): Promise<MonthlyActual[]>;
  set(templateId: number, yearMonth: string, amount: number): Promise<void>;
  remove(templateId: number, yearMonth: string): Promise<void>;
}

export function createMonthlyActualRepository(
  client: PoolClient,
  ledgerId: number,
): MonthlyActualRepository {
  return {
    async getForMonth(yearMonth) {
      const { rows } = await client.query<MonthlyActualRow>(
        'SELECT * FROM monthly_actuals WHERE year_month = $1',
        [yearMonth],
      );
      return rows.map(rowToMonthlyActual);
    },

    // Raw actuals across a month range. The renderer overlays these onto planned
    // amounts (actual ?? planned) and derives category/type from templates, so no
    // JOIN is needed here.
    async getForRange(startMonth, endMonth) {
      const { rows } = await client.query<MonthlyActualRow>(
        `SELECT * FROM monthly_actuals
           WHERE year_month >= $1 AND year_month <= $2 ORDER BY year_month ASC`,
        [startMonth, endMonth],
      );
      return rows.map(rowToMonthlyActual);
    },

    async set(templateId, yearMonth, amount) {
      await client.query(
        `INSERT INTO monthly_actuals (ledger_id, template_id, year_month, actual_amount)
           VALUES ($1, $2, $3, $4)
         ON CONFLICT (template_id, year_month) DO UPDATE SET actual_amount = excluded.actual_amount`,
        [ledgerId, templateId, yearMonth, amount],
      );
    },

    async remove(templateId, yearMonth) {
      await client.query(
        'DELETE FROM monthly_actuals WHERE template_id = $1 AND year_month = $2',
        [templateId, yearMonth],
      );
    },
  };
}
