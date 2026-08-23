import type Database from 'better-sqlite3';
import type { Category, CategoryInput } from '../../shared/types';
import type { CategoryRow } from './row-types';
import { rowToCategory } from '../mappers';

export interface CategoryRepository {
  getAll(): Category[];
  add(input: CategoryInput): Category;
  update(id: number, input: Partial<CategoryInput>): void;
  remove(id: number): void;
}

export function createCategoryRepository(db: Database.Database): CategoryRepository {
  return {
    getAll() {
      const rows = db
        .prepare('SELECT * FROM categories ORDER BY type ASC, sort_order ASC')
        .all() as CategoryRow[];
      return rows.map(rowToCategory);
    },

    add(input) {
      const maxOrder = db
        .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM categories WHERE type = ?')
        .get(input.type) as { max_order: number };
      const sortOrder = input.sortOrder ?? maxOrder.max_order + 1;
      const result = db
        .prepare('INSERT INTO categories (name, type, color, sort_order) VALUES (?, ?, ?, ?)')
        .run(input.name, input.type, input.color ?? null, sortOrder);
      const row = db
        .prepare('SELECT * FROM categories WHERE id = ?')
        .get(result.lastInsertRowid) as CategoryRow;
      return rowToCategory(row);
    },

    update(id, input) {
      const sets: string[] = [];
      const params: (string | number | null)[] = [];

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
    },

    remove(id) {
      // FK ON DELETE SET NULL nullifies category_id in entry_templates.
      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    },
  };
}
