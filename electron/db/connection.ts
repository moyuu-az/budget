import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { runMigrations } from './migrations';
import { runSeed } from './seed';

const SCHEMA_SQL = `
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
    actual_amount REAL NOT NULL CHECK(actual_amount >= 0),
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
`;

let db: Database.Database | undefined;

// Must be called inside app.whenReady() — app.getPath('userData') throws before then.
// Establishes the schema -> migrate -> seed ordering, which is load-bearing.
export function createDatabase(): Database.Database {
  const dbPath = path.join(app.getPath('userData'), 'balance-forecast.db');
  const instance = new Database(dbPath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');

  instance.exec(SCHEMA_SQL);
  runMigrations(instance);
  runSeed(instance);

  db = instance;
  return instance;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized: call createDatabase() inside app.whenReady() first');
  }
  return db;
}
