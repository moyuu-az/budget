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

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS entry_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      day_of_month INTEGER NOT NULL CHECK(day_of_month >= 1 AND day_of_month <= 31),
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      category_id INTEGER DEFAULT NULL,
      default_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
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

    CREATE TABLE IF NOT EXISTS monthly_actuals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      year_month TEXT NOT NULL CHECK(length(year_month) = 7),
      actual_amount REAL NOT NULL,
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

  // Migration: add category_id column to entry_templates if it doesn't exist
  migrateEntryTemplates();

  // Migration from legacy recurring_entries table
  migrateFromRecurringEntries();

  // Seed preset categories if categories table is empty
  seedPresetCategories();

  // Ensure current_balance setting exists
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get('current_balance');
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('current_balance', '0');
  }
}

function migrateEntryTemplates(): void {
  const columns = db.prepare('PRAGMA table_info(entry_templates)').all() as Array<{ name: string }>;
  const columnNames = columns.map((c) => c.name);

  if (!columnNames.includes('category_id')) {
    db.exec('ALTER TABLE entry_templates ADD COLUMN category_id INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL');
  }

  if (!columnNames.includes('default_amount')) {
    db.exec('ALTER TABLE entry_templates ADD COLUMN default_amount REAL NOT NULL DEFAULT 0');
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

function seedPresetCategories(): void {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM categories').get() as { cnt: number };
  if (count.cnt > 0) return;

  const presets: Array<{ name: string; type: string; color: string; sortOrder: number }> = [
    // Expense categories
    { name: '住居費', type: 'expense', color: '#EF4444', sortOrder: 0 },
    { name: '食費', type: 'expense', color: '#F97316', sortOrder: 1 },
    { name: '光熱費', type: 'expense', color: '#EAB308', sortOrder: 2 },
    { name: '通信費', type: 'expense', color: '#22C55E', sortOrder: 3 },
    { name: '保険', type: 'expense', color: '#06B6D4', sortOrder: 4 },
    { name: '交通費', type: 'expense', color: '#3B82F6', sortOrder: 5 },
    { name: '娯楽', type: 'expense', color: '#8B5CF6', sortOrder: 6 },
    { name: 'その他', type: 'expense', color: '#6B7280', sortOrder: 7 },
    // Income categories
    { name: '給与', type: 'income', color: '#10B981', sortOrder: 0 },
    { name: '副収入', type: 'income', color: '#14B8A6', sortOrder: 1 },
    { name: '投資収入', type: 'income', color: '#6366F1', sortOrder: 2 },
    { name: 'その他収入', type: 'income', color: '#A3A3A3', sortOrder: 3 },
  ];

  const insert = db.prepare(
    'INSERT INTO categories (name, type, color, sort_order) VALUES (?, ?, ?, ?)'
  );

  const seed = db.transaction(() => {
    for (const preset of presets) {
      insert.run(preset.name, preset.type, preset.color, preset.sortOrder);
    }
  });
  seed();
}

// --- Settings ---

export function getBalance(): number {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('current_balance') as { value: string } | undefined;
  return row ? parseFloat(row.value) : 0;
}

export function setBalance(balance: number): void {
  db.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).run('current_balance', String(balance));
}

// --- Categories ---

interface CategoryRow {
  id: number;
  name: string;
  type: string;
  color: string | null;
  sort_order: number;
}

export function getCategories(): CategoryRow[] {
  return db.prepare('SELECT * FROM categories ORDER BY type ASC, sort_order ASC').all() as CategoryRow[];
}

export function addCategory(input: { name: string; type: string; color?: string; sortOrder?: number }): CategoryRow {
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM categories WHERE type = ?'
  ).get(input.type) as { max_order: number };
  const sortOrder = input.sortOrder ?? maxOrder.max_order + 1;
  const result = db.prepare(
    'INSERT INTO categories (name, type, color, sort_order) VALUES (?, ?, ?, ?)'
  ).run(input.name, input.type, input.color ?? null, sortOrder);
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid) as CategoryRow;
}

export function updateCategory(id: number, input: { name?: string; type?: string; color?: string; sortOrder?: number }): void {
  const sets: string[] = [];
  const params: (string | number)[] = [];

  if (input.name !== undefined) {
    sets.push('name = ?');
    params.push(input.name);
  }
  if (input.type !== undefined) {
    sets.push('type = ?');
    params.push(input.type);
  }
  if (input.color !== undefined) {
    sets.push('color = ?');
    params.push(input.color);
  }
  if (input.sortOrder !== undefined) {
    sets.push('sort_order = ?');
    params.push(input.sortOrder);
  }

  if (sets.length === 0) return;

  params.push(id);
  db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

export function deleteCategory(id: number): void {
  // Set related templates' category_id to null before deleting
  db.prepare('UPDATE entry_templates SET category_id = NULL WHERE category_id = ?').run(id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
}

// --- Templates ---

interface TemplateRow {
  id: number;
  name: string;
  day_of_month: number;
  type: string;
  enabled: number;
  sort_order: number;
  category_id: number | null;
  default_amount: number;
  created_at: string;
  updated_at: string;
}

export function getTemplates(): TemplateRow[] {
  return db.prepare('SELECT * FROM entry_templates ORDER BY sort_order ASC, day_of_month ASC').all() as TemplateRow[];
}

export function addTemplate(
  name: string,
  dayOfMonth: number,
  type: string,
  categoryId?: number | null,
  defaultAmount?: number
): TemplateRow {
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM entry_templates').get() as { max_order: number };
  const result = db.prepare(
    'INSERT INTO entry_templates (name, day_of_month, type, sort_order, category_id, default_amount) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, dayOfMonth, type, maxOrder.max_order + 1, categoryId ?? null, defaultAmount ?? 0);
  return db.prepare('SELECT * FROM entry_templates WHERE id = ?').get(result.lastInsertRowid) as TemplateRow;
}

export function updateTemplate(
  id: number,
  input: { name?: string; dayOfMonth?: number; type?: string; categoryId?: number | null; defaultAmount?: number }
): void {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (input.name !== undefined) {
    sets.push('name = ?');
    params.push(input.name);
  }
  if (input.dayOfMonth !== undefined) {
    sets.push('day_of_month = ?');
    params.push(input.dayOfMonth);
  }
  if (input.type !== undefined) {
    sets.push('type = ?');
    params.push(input.type);
  }
  if (input.categoryId !== undefined) {
    sets.push('category_id = ?');
    params.push(input.categoryId);
  }
  if (input.defaultAmount !== undefined) {
    sets.push('default_amount = ?');
    params.push(input.defaultAmount);
  }

  if (sets.length === 0) return;

  sets.push('updated_at = datetime(\'now\')');
  params.push(id);
  db.prepare(`UPDATE entry_templates SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

export function deleteTemplate(id: number): void {
  db.prepare('DELETE FROM entry_templates WHERE id = ?').run(id);
}

export function toggleTemplate(id: number, enabled: boolean): void {
  db.prepare('UPDATE entry_templates SET enabled = ?, updated_at = datetime(\'now\') WHERE id = ?').run(enabled ? 1 : 0, id);
}

// --- Monthly Amounts ---

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

// --- Monthly Actuals ---

interface MonthlyActualRow {
  id: number;
  template_id: number;
  year_month: string;
  actual_amount: number;
  created_at: string;
}

export function getMonthlyActuals(yearMonth: string): MonthlyActualRow[] {
  return db.prepare('SELECT * FROM monthly_actuals WHERE year_month = ?').all(yearMonth) as MonthlyActualRow[];
}

export function setMonthlyActual(templateId: number, yearMonth: string, amount: number): MonthlyActualRow {
  db.prepare(
    'INSERT INTO monthly_actuals (template_id, year_month, actual_amount) VALUES (?, ?, ?) ON CONFLICT(template_id, year_month) DO UPDATE SET actual_amount = excluded.actual_amount'
  ).run(templateId, yearMonth, amount);
  return db.prepare('SELECT * FROM monthly_actuals WHERE template_id = ? AND year_month = ?').get(templateId, yearMonth) as MonthlyActualRow;
}

export function deleteMonthlyActual(templateId: number, yearMonth: string): void {
  db.prepare('DELETE FROM monthly_actuals WHERE template_id = ? AND year_month = ?').run(templateId, yearMonth);
}

// --- Snapshots ---

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
