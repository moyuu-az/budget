import type Database from 'better-sqlite3';
import type { MonthlyActual } from '../../shared/types';
import type { MonthlyActualRow } from './row-types';
import { rowToMonthlyActual } from '../mappers';

export interface MonthlyActualRepository {
  getForMonth(yearMonth: string): MonthlyActual[];
  getForRange(startMonth: string, endMonth: string): MonthlyActual[];
  set(templateId: number, yearMonth: string, amount: number): void;
  remove(templateId: number, yearMonth: string): void;
}

export function createMonthlyActualRepository(db: Database.Database): MonthlyActualRepository {
  return {
    getForMonth(yearMonth) {
      const rows = db
        .prepare('SELECT * FROM monthly_actuals WHERE year_month = ?')
        .all(yearMonth) as MonthlyActualRow[];
      return rows.map(rowToMonthlyActual);
    },

    // Raw actuals across a month range. The renderer overlays these onto planned
    // amounts (actual ?? planned) and derives category/type from templates, so no
    // JOIN is needed here.
    getForRange(startMonth, endMonth) {
      const rows = db
        .prepare(
          'SELECT * FROM monthly_actuals WHERE year_month >= ? AND year_month <= ? ORDER BY year_month ASC',
        )
        .all(startMonth, endMonth) as MonthlyActualRow[];
      return rows.map(rowToMonthlyActual);
    },

    // Upsert. Returns void: the renderer discards the row.
    set(templateId, yearMonth, amount) {
      db.prepare(
        'INSERT INTO monthly_actuals (template_id, year_month, actual_amount) VALUES (?, ?, ?) ON CONFLICT(template_id, year_month) DO UPDATE SET actual_amount = excluded.actual_amount',
      ).run(templateId, yearMonth, amount);
    },

    remove(templateId, yearMonth) {
      db.prepare('DELETE FROM monthly_actuals WHERE template_id = ? AND year_month = ?').run(
        templateId,
        yearMonth,
      );
    },
  };
}
