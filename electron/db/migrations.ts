import type Database from 'better-sqlite3';

// Idempotent schema migrations, run after the base DDL and before seeding.
// Order is load-bearing: migrateEntryTemplates adds columns the legacy import relies on.
export function runMigrations(db: Database.Database): void {
  migrateEntryTemplates(db);
  migrateFromRecurringEntries(db);
}

function migrateEntryTemplates(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(entry_templates)').all() as Array<{ name: string }>;
  const columnNames = columns.map((c) => c.name);

  if (!columnNames.includes('category_id')) {
    db.exec('ALTER TABLE entry_templates ADD COLUMN category_id INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL');
  }

  if (!columnNames.includes('default_amount')) {
    db.exec('ALTER TABLE entry_templates ADD COLUMN default_amount REAL NOT NULL DEFAULT 0');
  }
}

// One-time migration from the legacy recurring_entries table; drops it when done.
function migrateFromRecurringEntries(db: Database.Database): void {
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='recurring_entries'")
    .get();

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
      'INSERT INTO entry_templates (name, day_of_month, type, enabled, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const insertAmount = db.prepare(
      'INSERT OR IGNORE INTO monthly_amounts (template_id, year_month, amount) VALUES (?, ?, ?)',
    );

    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const migrate = db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const result = insertTemplate.run(
          row.name, row.day_of_month, row.type, row.enabled, i, row.created_at, row.updated_at,
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
