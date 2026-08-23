import type { PoolClient } from '../db/pool';

export interface SettingsRepository {
  getBalance(): Promise<number>;
  setBalance(balance: number): Promise<void>;
}

const BALANCE_KEY = 'current_balance';

export function createSettingsRepository(
  client: PoolClient,
  ledgerId: number,
): SettingsRepository {
  return {
    async getBalance() {
      // No ledger predicate here, on purpose -- see the note in index.ts.
      const { rows } = await client.query<{ value: string }>(
        'SELECT value FROM settings WHERE key = $1',
        [BALANCE_KEY],
      );
      return rows.length > 0 ? Number(rows[0].value) : 0;
    },

    async setBalance(balance) {
      await client.query(
        `INSERT INTO settings (ledger_id, key, value, updated_at)
           VALUES ($1, $2, $3, now())
         ON CONFLICT (ledger_id, key)
           DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [ledgerId, BALANCE_KEY, String(balance)],
      );
    },
  };
}
