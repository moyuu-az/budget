import type Database from 'better-sqlite3';

export interface SettingsRepository {
  getBalance(): number;
  setBalance(balance: number): void;
}

export function createSettingsRepository(db: Database.Database): SettingsRepository {
  return {
    getBalance() {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('current_balance') as
        | { value: string }
        | undefined;
      return row ? parseFloat(row.value) : 0;
    },

    setBalance(balance) {
      db.prepare(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      ).run('current_balance', String(balance));
    },
  };
}
