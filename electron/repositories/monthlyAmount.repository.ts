import type Database from 'better-sqlite3';
import type { MonthlyAmount } from '../../shared/types';
import type { MonthlyAmountRow } from './row-types';
import { rowToMonthlyAmount } from '../mappers';

export interface MonthlyAmountRepository {
  getForMonth(yearMonth: string): MonthlyAmount[];
  getForRange(startMonth: string, endMonth: string): MonthlyAmount[];
  set(templateId: number, yearMonth: string, amount: number): void;
  remove(templateId: number, yearMonth: string): void;
  copyMonth(fromMonth: string, toMonth: string): void;
}

export function createMonthlyAmountRepository(db: Database.Database): MonthlyAmountRepository {
  return {
    getForMonth(yearMonth) {
      const rows = db
        .prepare('SELECT * FROM monthly_amounts WHERE year_month = ?')
        .all(yearMonth) as MonthlyAmountRow[];
      return rows.map(rowToMonthlyAmount);
    },

    getForRange(startMonth, endMonth) {
      const rows = db
        .prepare('SELECT * FROM monthly_amounts WHERE year_month >= ? AND year_month <= ?')
        .all(startMonth, endMonth) as MonthlyAmountRow[];
      return rows.map(rowToMonthlyAmount);
    },

    // Upsert. Returns void: the renderer discards the row (no wasteful re-SELECT).
    set(templateId, yearMonth, amount) {
      db.prepare(
        'INSERT INTO monthly_amounts (template_id, year_month, amount) VALUES (?, ?, ?) ON CONFLICT(template_id, year_month) DO UPDATE SET amount = excluded.amount',
      ).run(templateId, yearMonth, amount);
    },

    remove(templateId, yearMonth) {
      db.prepare('DELETE FROM monthly_amounts WHERE template_id = ? AND year_month = ?').run(
        templateId,
        yearMonth,
      );
    },

    // Copies all amounts from one month into another (INSERT OR IGNORE preserves existing).
    // Returns void: the renderer re-fetches the target month itself.
    copyMonth(fromMonth, toMonth) {
      const sourceAmounts = db
        .prepare('SELECT * FROM monthly_amounts WHERE year_month = ?')
        .all(fromMonth) as MonthlyAmountRow[];

      const insert = db.prepare(
        'INSERT OR IGNORE INTO monthly_amounts (template_id, year_month, amount) VALUES (?, ?, ?)',
      );

      const copy = db.transaction(() => {
        for (const row of sourceAmounts) {
          insert.run(row.template_id, toMonth, row.amount);
        }
      });
      copy();
    },
  };
}
