import type { PoolClient } from '../db/pool';
import type { BalanceSnapshot } from '../../shared/types';
import type { SnapshotRow } from './row-types';
import { rowToSnapshot } from '../mappers';

export interface SnapshotRepository {
  getAll(): Promise<BalanceSnapshot[]>;
  add(date: string, balance: number): Promise<BalanceSnapshot>;
  remove(id: number): Promise<void>;
  getForRange(startDate: string, endDate: string): Promise<BalanceSnapshot[]>;
}

export function createSnapshotRepository(
  client: PoolClient,
  ledgerId: number,
): SnapshotRepository {
  return {
    async getAll() {
      const { rows } = await client.query<SnapshotRow>(
        'SELECT * FROM balance_snapshots ORDER BY date DESC',
      );
      return rows.map(rowToSnapshot);
    },

    /**
     * Upsert by date. Returns the snapshot: the renderer appends it to its list.
     *
     * The conflict target MUST include ledger_id. Under the old single-dataset
     * schema this was `ON CONFLICT (date)`; keeping that against a shared
     * database would mean saving a snapshot in a private ledger overwrites the
     * household's snapshot for the same day.
     */
    async add(date, balance) {
      const { rows } = await client.query<SnapshotRow>(
        `INSERT INTO balance_snapshots (ledger_id, date, balance)
           VALUES ($1, $2, $3)
         ON CONFLICT (ledger_id, date) DO UPDATE SET balance = excluded.balance
         RETURNING *`,
        [ledgerId, date, balance],
      );
      return rowToSnapshot(rows[0]);
    },

    async remove(id) {
      await client.query('DELETE FROM balance_snapshots WHERE id = $1', [id]);
    },

    async getForRange(startDate, endDate) {
      const { rows } = await client.query<SnapshotRow>(
        'SELECT * FROM balance_snapshots WHERE date >= $1 AND date <= $2 ORDER BY date ASC',
        [startDate, endDate],
      );
      return rows.map(rowToSnapshot);
    },
  };
}
