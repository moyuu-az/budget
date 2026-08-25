import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, migrationsDir, type TestDb } from '../../test/pg';
import { migrate } from '../migrate';
import { occurrenceDayInMonth } from '../../../shared/recurrence';
import { rowToTemplate } from '../../mappers';
import type { TemplateRow } from '../../repositories/row-types';

// ---------------------------------------------------------------------------
// Migration 005 rewrites the meaning of every existing planned entry.
//
// It does not move an amount, but it decides WHEN every entry in production
// happens -- and getting that wrong is the same class of harm: rent that lands
// on the wrong day, or an entry that stops happening at all. Neither shows up on
// screen as an error. Both show up as a forecast that is quietly untrue.
//
// So this file starts a database at the 004 schema, seeds entries shaped like
// the ones in production, applies 005, and checks two separate things:
//
//   1. THE BACKFILL DID NOT MOVE ANYTHING. Every pre-existing row must still
//      occur on exactly the day it occurred on before.
//   2. THE CONSTRAINTS ACTUALLY HOLD. The whole argument for spreading a union
//      across five columns instead of a JSONB blob was that the database can
//      then reject a nonsensical combination. That argument is worth nothing
//      unless the CHECK is under test -- an ALTER TABLE that silently failed to
//      apply looks identical to one that worked.
//
// Run as a NON-SUPERUSER OWNER for the same reason migration 004's test is: a
// real superuser is exempt from row-level security, so a test using the
// container's default user would pass whether or not the policies apply.
// ---------------------------------------------------------------------------

let db: TestDb;
let staging: string;
let ledgerId: number;

/**
 * A directory holding migrations 001..004 only.
 *
 * Compared with `>=` rather than a prefix match on '005': with a prefix test,
 * the day 006 is added it would be copied here and applied BEFORE 005, either
 * failing outright or -- worse -- passing while this file silently stops testing
 * what it claims to.
 */
function migrationsUpTo004(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-mig-005-'));
  for (const file of fs.readdirSync(migrationsDir())) {
    if (!file.endsWith('.sql')) continue;
    if (file >= '005') continue;
    fs.copyFileSync(path.join(migrationsDir(), file), path.join(dir, file));
  }
  return dir;
}

/** Inserts an entry at the 004 schema, where day_of_month is all there is. */
async function legacyTemplate(name: string, dayOfMonth: number, type = 'expense'): Promise<number> {
  const { rows } = await db.adminPool.query<{ id: number }>(
    `INSERT INTO entry_templates (ledger_id, name, day_of_month, type, default_amount)
       VALUES ($1, $2, $3, $4, 1000) RETURNING id`,
    [ledgerId, name, dayOfMonth, type],
  );
  return rows[0].id;
}

async function readRow(id: number): Promise<TemplateRow> {
  const { rows } = await db.adminPool.query<TemplateRow>(
    'SELECT * FROM entry_templates WHERE id = $1',
    [id],
  );
  return rows[0];
}

/** What the day looked like BEFORE the migration, captured while 004 is current. */
const before = new Map<number, number>();

let rentId: number;
let salaryId: number;
let endOfMonthId: number;

let warnings: string[] = [];

beforeAll(async () => {
  staging = migrationsUpTo004();
  db = await startTestDb({ migrationsDir: staging, nonSuperuserOwner: true });

  const { rows } = await db.adminPool.query<{ id: number }>(
    "INSERT INTO ledgers (slug, name, kind) VALUES ('household', '家計', 'shared') RETURNING id",
  );
  ledgerId = rows[0].id;

  rentId = await legacyTemplate('家賃', 27);
  salaryId = await legacyTemplate('給料', 25, 'income');
  // The day that exercises the clamp: a 31 has to keep meaning "the last day"
  // afterwards, not "skip every short month".
  endOfMonthId = await legacyTemplate('カード引き落とし', 31);

  for (const id of [rentId, salaryId, endOfMonthId]) {
    before.set(id, (await readRow(id)).day_of_month as number);
  }

  // "Reported rather than thrown" is worthless if the report goes nowhere; the
  // migration's verification block warns, and this is where that is observed.
  const originalWarn = console.warn;
  warnings = [];
  console.warn = (...args: unknown[]): void => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    await migrate(db.ownerPool, migrationsDir());
  } finally {
    console.warn = originalWarn;
  }
}, 120_000);

afterAll(async () => {
  await db?.stop();
  if (staging) fs.rmSync(staging, { recursive: true, force: true });
});

describe('the backfill', () => {
  it('applies cleanly and warns about nothing', () => {
    // A warning here means a row escaped the backfill -- an entry that would
    // never occur again. There is no acceptable non-zero count.
    expect(warnings).toEqual([]);
  });

  it('gives every existing entry the meaning it already had', async () => {
    for (const [id, day] of before) {
      const row = await readRow(id);
      expect(row.recurrence_kind).toBe('monthly');
      expect(row.day_of_month).toBe(day);
      // And nothing else was populated -- a leftover column would make the
      // shape CHECK reject the next ordinary edit of a row nobody touched.
      expect(row.month_of_year).toBeNull();
      expect(row.interval_months).toBeNull();
      expect(row.anchor_month).toBeNull();
      expect(row.on_date).toBeNull();
    }
  });

  it('leaves every entry occurring on exactly the day it occurred on before', async () => {
    // The claim the whole migration rests on, checked through the SAME predicate
    // the application runs rather than by re-reading the column: it is the
    // predicate, not the column, that decides when money moves.
    for (const [id, day] of before) {
      const recurrence = rowToTemplate(await readRow(id)).recurrence;
      expect(occurrenceDayInMonth(recurrence, '2026-07')).toBe(day);
    }
  });

  it('keeps a day-31 entry meaning "the last day", not "skip short months"', async () => {
    const recurrence = rowToTemplate(await readRow(endOfMonthId)).recurrence;
    expect(occurrenceDayInMonth(recurrence, '2026-02')).toBe(28);
    expect(occurrenceDayInMonth(recurrence, '2026-04')).toBe(30);
    expect(occurrenceDayInMonth(recurrence, '2026-03')).toBe(31);
  });

  it('does not touch names, types or amounts', async () => {
    const rent = await readRow(rentId);
    expect(rent.name).toBe('家賃');
    expect(rent.type).toBe('expense');
    expect(Number(rent.default_amount)).toBe(1000);

    const salary = await readRow(salaryId);
    expect(salary.type).toBe('income');
  });

  it('is safe to run again', async () => {
    // The runner skips applied files, so this proves the guard rather than the
    // SQL -- but a migration that had been recorded without applying (a partial
    // failure, a hand-run file) is exactly the situation where a second run
    // happens, and it must not double anything.
    await migrate(db.ownerPool, migrationsDir());
    const rent = await readRow(rentId);
    expect(rent.recurrence_kind).toBe('monthly');
    expect(rent.day_of_month).toBe(before.get(rentId));
  });
});

describe('the shape constraint', () => {
  // Each case below is a row the application must never be able to write. They
  // are asserted at the DATABASE because that is the only place the guarantee is
  // worth anything: the argument for five columns over a JSONB blob was exactly
  // that this rejection happens in production, not only in the code path that
  // happened to write it.

  const insert = (columns: string, values: string): Promise<unknown> =>
    db.adminPool.query(
      `INSERT INTO entry_templates (ledger_id, name, type, default_amount, ${columns})
         VALUES (${ledgerId}, 'bad', 'expense', 0, ${values})`,
    );

  it('rejects an unknown recurrence kind', async () => {
    await expect(insert("recurrence_kind, day_of_month", "'weekly', 1")).rejects.toThrow();
  });

  it('rejects monthly without a day', async () => {
    // The NOT NULL that used to guarantee this was dropped so 'once' could omit
    // it. If this passes, every monthly entry can silently become one that never
    // occurs.
    await expect(insert('recurrence_kind', "'monthly'")).rejects.toThrow();
  });

  it('rejects monthly carrying another shape leftovers', async () => {
    await expect(
      insert('recurrence_kind, day_of_month, month_of_year', "'monthly', 5, 3"),
    ).rejects.toThrow();
    await expect(
      insert('recurrence_kind, day_of_month, on_date', "'monthly', 5, DATE '2026-03-05'"),
    ).rejects.toThrow();
  });

  it('rejects yearly without a month', async () => {
    await expect(insert('recurrence_kind, day_of_month', "'yearly', 20")).rejects.toThrow();
  });

  it('rejects interval without an anchor, and without an interval', async () => {
    // Without the anchor "every two months" does not say which two, and the
    // occurrence test has no phase to work from.
    await expect(
      insert('recurrence_kind, day_of_month, interval_months', "'interval', 10, 2"),
    ).rejects.toThrow();
    await expect(
      insert('recurrence_kind, day_of_month, anchor_month', "'interval', 10, '2026-03'"),
    ).rejects.toThrow();
  });

  it('rejects once without a date, and once carrying a day', async () => {
    await expect(insert('recurrence_kind', "'once'")).rejects.toThrow();
    await expect(
      insert('recurrence_kind, on_date, day_of_month', "'once', DATE '2026-11-20', 20"),
    ).rejects.toThrow();
  });

  it('accepts each of the four shapes in its correct form', async () => {
    // The constraint has to admit the valid rows too -- a CHECK that rejects
    // everything would pass every test above.
    await expect(insert('recurrence_kind, day_of_month', "'monthly', 25")).resolves.toBeDefined();
    await expect(
      insert('recurrence_kind, day_of_month, month_of_year', "'yearly', 20, 3"),
    ).resolves.toBeDefined();
    await expect(
      insert(
        'recurrence_kind, day_of_month, interval_months, anchor_month',
        "'interval', 10, 2, '2026-03'",
      ),
    ).resolves.toBeDefined();
    await expect(insert('recurrence_kind, on_date', "'once', DATE '2026-11-20'")).resolves.toBeDefined();
  });
});

describe('the range constraints', () => {
  const insert = (columns: string, values: string): Promise<unknown> =>
    db.adminPool.query(
      `INSERT INTO entry_templates (ledger_id, name, type, default_amount, ${columns})
         VALUES (${ledgerId}, 'range', 'expense', 0, ${values})`,
    );

  it('rejects a month outside 1-12', async () => {
    await expect(insert('recurrence_kind, day_of_month, month_of_year', "'yearly', 1, 0")).rejects.toThrow();
    await expect(insert('recurrence_kind, day_of_month, month_of_year', "'yearly', 1, 13")).rejects.toThrow();
  });

  it('rejects an interval of 1, which is monthly spelled a second way', async () => {
    await expect(
      insert(
        'recurrence_kind, day_of_month, interval_months, anchor_month',
        "'interval', 1, 1, '2026-03'",
      ),
    ).rejects.toThrow();
  });

  it('rejects an interval beyond five years', async () => {
    await expect(
      insert(
        'recurrence_kind, day_of_month, interval_months, anchor_month',
        "'interval', 1, 61, '2026-03'",
      ),
    ).rejects.toThrow();
  });

  it('rejects a malformed anchor month', async () => {
    // 'YYYY-M' and 'YYYY-13' both parse as strings and would make the entry
    // occur in no month at all, which is indistinguishable on screen from an
    // entry the user forgot to enable.
    await expect(
      insert(
        'recurrence_kind, day_of_month, interval_months, anchor_month',
        "'interval', 1, 2, '2026-3'",
      ),
    ).rejects.toThrow();
    await expect(
      insert(
        'recurrence_kind, day_of_month, interval_months, anchor_month',
        "'interval', 1, 2, '2026-13'",
      ),
    ).rejects.toThrow();
  });

  it('rejects a one-off on a date that does not exist', async () => {
    // Free from the DATE column, but asserted because it is the guarantee the
    // client-side check in shared/recurrence.ts mirrors -- if this ever became a
    // TEXT column the mirror would be the only thing left.
    await expect(insert('recurrence_kind, on_date', "'once', DATE '2026-02-31'")).rejects.toThrow();
  });

  it('still rejects a day outside 1-31, from the original schema', async () => {
    await expect(insert('recurrence_kind, day_of_month', "'monthly', 32")).rejects.toThrow();
    await expect(insert('recurrence_kind, day_of_month', "'monthly', 0")).rejects.toThrow();
  });
});

describe('the index', () => {
  it('is left exactly as migration 001 created it', async () => {
    // Asserted rather than assumed. The migration deliberately does NOT rebuild
    // it -- a btree indexes NULLs fine, so the only thing a rebuild would buy is
    // tidiness, at the price of an ACCESS EXCLUSIVE lock taken on a live table
    // immediately before a deploy. A future edit that "fixes" the index should
    // have to delete this test and read the reasoning above it first.
    const { rows } = await db.adminPool.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'entry_templates_ledger_idx'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('sort_order');
    expect(rows[0].indexdef).toContain('day_of_month');
  });

  it('still indexes a one-off, whose day_of_month is NULL', async () => {
    // The concern that prompted the rebuild, checked directly: a NULL in an
    // indexed column does not make the row unindexable, and the row is still
    // returned by an ordinary read.
    await db.adminPool.query(
      `INSERT INTO entry_templates (ledger_id, name, type, default_amount, recurrence_kind, on_date)
         VALUES ($1, 'indexed one-off', 'expense', 0, 'once', DATE '2026-11-20')`,
      [ledgerId],
    );
    const { rows } = await db.adminPool.query(
      "SELECT 1 FROM entry_templates WHERE ledger_id = $1 AND name = 'indexed one-off'",
      [ledgerId],
    );
    expect(rows).toHaveLength(1);
  });
});
