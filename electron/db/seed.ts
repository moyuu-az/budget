import type Database from 'better-sqlite3';

// Seeds preset categories on a fresh DB and ensures the current_balance setting exists.
export function runSeed(db: Database.Database): void {
  seedPresetCategories(db);
  ensureCurrentBalance(db);
}

function seedPresetCategories(db: Database.Database): void {
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

  const insert = db.prepare('INSERT INTO categories (name, type, color, sort_order) VALUES (?, ?, ?, ?)');

  const seed = db.transaction(() => {
    for (const preset of presets) {
      insert.run(preset.name, preset.type, preset.color, preset.sortOrder);
    }
  });
  seed();
}

function ensureCurrentBalance(db: Database.Database): void {
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get('current_balance');
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('current_balance', '0');
  }
}
