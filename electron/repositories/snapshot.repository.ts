import type Database from 'better-sqlite3';
import type { BalanceSnapshot } from '../../shared/types';
import type { SnapshotRow } from './row-types';
import { rowToSnapshot } from '../mappers';

export interface SnapshotRepository {
  getAll(): BalanceSnapshot[];
  add(date: string, balance: number): BalanceSnapshot;
  remove(id: number): void;
  getForRange(startDate: string, endDate: string): BalanceSnapshot[];
}

export function createSnapshotRepository(db: Database.Database): SnapshotRepository {
  return {
    getAll() {
      const rows = db
        .prepare('SELECT * FROM balance_snapshots ORDER BY date DESC')
        .all() as SnapshotRow[];
      return rows.map(rowToSnapshot);
    },

    // Upsert by date. Returns the snapshot: the renderer appends it to its list.
    add(date, balance) {
      db.prepare(
        'INSERT INTO balance_snapshots (date, balance) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET balance = excluded.balance',
      ).run(date, balance);
      const row = db
        .prepare('SELECT * FROM balance_snapshots WHERE date = ?')
        .get(date) as SnapshotRow;
      return rowToSnapshot(row);
    },

    remove(id) {
      db.prepare('DELETE FROM balance_snapshots WHERE id = ?').run(id);
    },

    getForRange(startDate, endDate) {
      const rows = db
        .prepare('SELECT * FROM balance_snapshots WHERE date >= ? AND date <= ? ORDER BY date ASC')
        .all(startDate, endDate) as SnapshotRow[];
      return rows.map(rowToSnapshot);
    },
  };
}
