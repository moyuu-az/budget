import type Database from 'better-sqlite3';
import type { MonthlyActual, ActualWithCategory } from '../../shared/types';
import type { MonthlyActualRow, ActualWithCategoryRow } from './row-types';
import { rowToMonthlyActual, rowToActualWithCategory } from '../mappers';

export interface MonthlyActualRepository {
  getForMonth(yearMonth: string): MonthlyActual[];
  getForRange(startMonth: string, endMonth: string): ActualWithCategory[];
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

    // JOIN with template + category for analytics.
    getForRange(startMonth, endMonth) {
      const rows = db
        .prepare(
          `
          SELECT
            ma.template_id,
            ma.year_month,
            ma.actual_amount,
            et.name AS template_name,
            et.type AS template_type,
            et.category_id,
            c.name AS category_name,
            c.color AS category_color
          FROM monthly_actuals ma
          JOIN entry_templates et ON et.id = ma.template_id
          LEFT JOIN categories c ON c.id = et.category_id
          WHERE ma.year_month >= ? AND ma.year_month <= ?
          ORDER BY ma.year_month ASC
        `,
        )
        .all(startMonth, endMonth) as ActualWithCategoryRow[];
      return rows.map(rowToActualWithCategory);
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
