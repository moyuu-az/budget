import type Database from 'better-sqlite3';
import type { EntryTemplate, EntryTemplateInput } from '../../shared/types';
import type { TemplateRow } from './row-types';
import { rowToTemplate } from '../mappers';

export interface TemplateRepository {
  getAll(): EntryTemplate[];
  add(input: EntryTemplateInput): EntryTemplate;
  update(id: number, input: Partial<EntryTemplateInput>): void;
  toggle(id: number, enabled: boolean): void;
  remove(id: number): void;
}

export function createTemplateRepository(db: Database.Database): TemplateRepository {
  return {
    getAll() {
      const rows = db
        .prepare('SELECT * FROM entry_templates ORDER BY sort_order ASC, day_of_month ASC')
        .all() as TemplateRow[];
      return rows.map(rowToTemplate);
    },

    add(input) {
      const maxOrder = db
        .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM entry_templates')
        .get() as { max_order: number };
      const result = db
        .prepare(
          'INSERT INTO entry_templates (name, day_of_month, type, sort_order, category_id, default_amount) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          input.name,
          input.dayOfMonth,
          input.type,
          maxOrder.max_order + 1,
          input.categoryId ?? null,
          input.defaultAmount ?? 0,
        );
      const row = db
        .prepare('SELECT * FROM entry_templates WHERE id = ?')
        .get(result.lastInsertRowid) as TemplateRow;
      return rowToTemplate(row);
    },

    update(id, input) {
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

      sets.push("updated_at = datetime('now')");
      params.push(id);
      db.prepare(`UPDATE entry_templates SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    },

    toggle(id, enabled) {
      db.prepare("UPDATE entry_templates SET enabled = ?, updated_at = datetime('now') WHERE id = ?").run(
        enabled ? 1 : 0,
        id,
      );
    },

    remove(id) {
      db.prepare('DELETE FROM entry_templates WHERE id = ?').run(id);
    },
  };
}
