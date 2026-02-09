import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db: Database.Database;

export function initDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'balance-forecast.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS entry_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      day_of_month INTEGER NOT NULL CHECK(day_of_month >= 1 AND day_of_month <= 31),
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monthly_amounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      year_month TEXT NOT NULL CHECK(length(year_month) = 7),
      amount REAL NOT NULL CHECK(amount >= 0),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (template_id) REFERENCES entry_templates(id) ON DELETE CASCADE,
      UNIQUE(template_id, year_month)
    );

    CREATE TABLE IF NOT EXISTS balance_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      balance REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  migrateFromRecurringEntries();

  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get('current_balance');
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('current_balance', '0');
  }
}

function migrateFromRecurringEntries(): void {
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='recurring_entries'"
  ).get();

  if (!tableExists) return;

  const rows = db.prepare('SELECT * FROM recurring_entries').all() as Array<{
    id: number;
    name: string;
    amount: number;
    day_of_month: number;
    type: string;
    enabled: number;
    created_at: string;
    updated_at: string;
  }>;

  if (rows.length > 0) {
    const insertTemplate = db.prepare(
      'INSERT INTO entry_templates (name, day_of_month, type, enabled, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const insertAmount = db.prepare(
      'INSERT OR IGNORE INTO monthly_amounts (template_id, year_month, amount) VALUES (?, ?, ?)'
    );

    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const migrate = db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const result = insertTemplate.run(
          row.name, row.day_of_month, row.type, row.enabled, i, row.created_at, row.updated_at
        );
        if (row.amount > 0) {
          insertAmount.run(result.lastInsertRowid, currentYearMonth, row.amount);
        }
      }
    });
    migrate();
  }

  db.exec('DROP TABLE recurring_entries');
}

// Settings
export function getBalance(): number {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('current_balance') as { value: string } | undefined;
  return row ? parseFloat(row.value) : 0;
}

export function setBalance(balance: number): void {
  db.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).run('current_balance', String(balance));
}

// Templates
interface TemplateRow {
  id: number;
  name: string;
  day_of_month: number;
  type: string;
  enabled: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function getTemplates(): TemplateRow[] {
  return db.prepare('SELECT * FROM entry_templates ORDER BY sort_order ASC, day_of_month ASC').all() as TemplateRow[];
}

export function addTemplate(name: string, dayOfMonth: number, type: string): TemplateRow {
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM entry_templates').get() as { max_order: number };
  const result = db.prepare(
    'INSERT INTO entry_templates (name, day_of_month, type, sort_order) VALUES (?, ?, ?, ?)'
  ).run(name, dayOfMonth, type, maxOrder.max_order + 1);
  return db.prepare('SELECT * FROM entry_templates WHERE id = ?').get(result.lastInsertRowid) as TemplateRow;
}

export function updateTemplate(id: number, name: string, dayOfMonth: number, type: string): TemplateRow {
  db.prepare(
    'UPDATE entry_templates SET name = ?, day_of_month = ?, type = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(name, dayOfMonth, type, id);
  return db.prepare('SELECT * FROM entry_templates WHERE id = ?').get(id) as TemplateRow;
}

export function deleteTemplate(id: number): void {
  db.prepare('DELETE FROM entry_templates WHERE id = ?').run(id);
}

export function toggleTemplate(id: number, enabled: boolean): void {
  db.prepare('UPDATE entry_templates SET enabled = ?, updated_at = datetime(\'now\') WHERE id = ?').run(enabled ? 1 : 0, id);
}

// Monthly Amounts
interface MonthlyAmountRow {
  id: number;
  template_id: number;
  year_month: string;
  amount: number;
  created_at: string;
}

export function getMonthlyAmounts(yearMonth: string): MonthlyAmountRow[] {
  return db.prepare('SELECT * FROM monthly_amounts WHERE year_month = ?').all(yearMonth) as MonthlyAmountRow[];
}

export function getMonthlyAmountsRange(startMonth: string, endMonth: string): MonthlyAmountRow[] {
  return db.prepare('SELECT * FROM monthly_amounts WHERE year_month >= ? AND year_month <= ?').all(startMonth, endMonth) as MonthlyAmountRow[];
}

export function setMonthlyAmount(templateId: number, yearMonth: string, amount: number): MonthlyAmountRow {
  db.prepare(
    'INSERT INTO monthly_amounts (template_id, year_month, amount) VALUES (?, ?, ?) ON CONFLICT(template_id, year_month) DO UPDATE SET amount = excluded.amount'
  ).run(templateId, yearMonth, amount);
  return db.prepare('SELECT * FROM monthly_amounts WHERE template_id = ? AND year_month = ?').get(templateId, yearMonth) as MonthlyAmountRow;
}

export function deleteMonthlyAmount(templateId: number, yearMonth: string): void {
  db.prepare('DELETE FROM monthly_amounts WHERE template_id = ? AND year_month = ?').run(templateId, yearMonth);
}

export function copyMonthlyAmounts(fromMonth: string, toMonth: string): MonthlyAmountRow[] {
  const sourceAmounts = db.prepare('SELECT * FROM monthly_amounts WHERE year_month = ?').all(fromMonth) as MonthlyAmountRow[];

  const insert = db.prepare(
    'INSERT OR IGNORE INTO monthly_amounts (template_id, year_month, amount) VALUES (?, ?, ?)'
  );

  const copy = db.transaction(() => {
    for (const row of sourceAmounts) {
      insert.run(row.template_id, toMonth, row.amount);
    }
  });
  copy();

  return db.prepare('SELECT * FROM monthly_amounts WHERE year_month = ?').all(toMonth) as MonthlyAmountRow[];
}

// Snapshots
export function getSnapshots(): Array<{
  id: number;
  date: string;
  balance: number;
  created_at: string;
}> {
  return db.prepare('SELECT * FROM balance_snapshots ORDER BY date DESC').all() as Array<{
    id: number;
    date: string;
    balance: number;
    created_at: string;
  }>;
}

export function addSnapshot(date: string, balance: number): {
  id: number;
  date: string;
  balance: number;
  created_at: string;
} {
  const result = db.prepare(
    'INSERT INTO balance_snapshots (date, balance) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET balance = excluded.balance'
  ).run(date, balance);
  return db.prepare('SELECT * FROM balance_snapshots WHERE date = ?').get(date) as {
    id: number;
    date: string;
    balance: number;
    created_at: string;
  };
}

export function deleteSnapshot(id: number): void {
  db.prepare('DELETE FROM balance_snapshots WHERE id = ?').run(id);
}
