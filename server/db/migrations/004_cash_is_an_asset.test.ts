import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, migrationsDir, raw, type TestDb } from '../../test/pg';
import { migrate } from '../migrate';

// ---------------------------------------------------------------------------
// Migration 004 moves MONEY, not just shapes.
//
// It decides, per ledger, whether the old `settings.current_balance` becomes a
// cash holding or is deliberately dropped as a duplicate. Get that wrong in
// either direction and a household either loses its balance or keeps counting it
// twice -- and neither is visible on screen, because both produce a plausible
// number.
//
// So this file starts a database at the 003 schema, seeds the three situations
// that actually exist in production, applies 004, and checks the outcome.
// ---------------------------------------------------------------------------

let db: TestDb;
let staging: string;

/** A directory holding migrations 001..003 only. */
function migrationsUpTo003(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-mig-'));
  for (const file of fs.readdirSync(migrationsDir())) {
    if (!file.endsWith('.sql')) continue;
    if (file.startsWith('004')) continue;
    fs.copyFileSync(path.join(migrationsDir(), file), path.join(dir, file));
  }
  return dir;
}

/** Ledger ids, one per situation the migration has to tell apart. */
let onlySetting: number;
let alsoHasCashHoldings: number;
let nothingAtAll: number;
let renamedCash: number;

beforeAll(async () => {
  staging = migrationsUpTo003();
  db = await startTestDb({ migrationsDir: staging });

  const ledger = async (slug: string): Promise<number> => {
    const { rows } = await db.adminPool.query<{ id: number }>(
      "INSERT INTO ledgers (slug, name, kind) VALUES ($1, $1, 'personal') RETURNING id",
      [slug],
    );
    return rows[0].id;
  };

  // (1) The ordinary case before this release: a balance, no asset tracking.
  onlySetting = await ledger('only-setting');
  await db.adminPool.query(
    "INSERT INTO settings (ledger_id, key, value) VALUES ($1, 'current_balance', '1525210')",
    [onlySetting],
  );

  // (2) The case that was double counting: a balance AND a 現金 category holding
  //     the same money.
  alsoHasCashHoldings = await ledger('double-counted');
  await db.adminPool.query(
    "INSERT INTO settings (ledger_id, key, value) VALUES ($1, 'current_balance', '800000')",
    [alsoHasCashHoldings],
  );
  const { rows: cashCat } = await db.adminPool.query<{ id: number }>(
    `INSERT INTO asset_categories (ledger_id, name, color, sort_order, fields)
       VALUES ($1, '現金', '#38bdf8', 0, '[]'::jsonb) RETURNING id`,
    [alsoHasCashHoldings],
  );
  await db.adminPool.query(
    `INSERT INTO assets (ledger_id, category_id, name, value, fields)
       VALUES ($1, $2, '銀行口座', 800000, '{}'::jsonb)`,
    [alsoHasCashHoldings, cashCat[0].id],
  );

  // (3) A ledger that never recorded anything.
  nothingAtAll = await ledger('empty');

  // (4) Asset tracking in use, but the cash category named something else. The
  //     migration must NOT promote it -- 定期預金 is not the money at hand.
  renamedCash = await ledger('other-assets-only');
  await db.adminPool.query(
    "INSERT INTO settings (ledger_id, key, value) VALUES ($1, 'current_balance', '42000')",
    [renamedCash],
  );
  await db.adminPool.query(
    `INSERT INTO asset_categories (ledger_id, name, color, sort_order, fields)
       VALUES ($1, '定期預金', '#a855f7', 0, '[]'::jsonb)`,
    [renamedCash],
  );

  // ... and now the migration under test.
  await migrate(db.adminPool, migrationsDir());
}, 120_000);

afterAll(async () => {
  await db?.stop();
  if (staging) fs.rmSync(staging, { recursive: true, force: true });
});

/** Every cash holding of one ledger, as the application would see them. */
async function cashHoldings(ledgerId: number): Promise<{ name: string; value: string }[]> {
  return raw(
    db.adminPool,
    `SELECT a.name, a.value::text AS value
       FROM assets a
       JOIN asset_categories c ON c.id = a.category_id
      WHERE a.ledger_id = $1 AND c.kind = 'cash'
      ORDER BY a.id`,
    [ledgerId],
  );
}

describe('every ledger comes out with exactly one cash category', () => {
  it.each([
    ['a ledger that only had the setting', () => onlySetting],
    ['a ledger that was double counting', () => alsoHasCashHoldings],
    ['a ledger with nothing at all', () => nothingAtAll],
    ['a ledger tracking other assets', () => renamedCash],
  ])('%s', async (_label, id) => {
    const rows = await raw(
      db.adminPool,
      "SELECT id FROM asset_categories WHERE ledger_id = $1 AND kind = 'cash'",
      [id()],
    );
    expect(rows).toHaveLength(1);
  });
});

describe('the old balance', () => {
  it('becomes a holding when the ledger had no cash recorded as an asset', async () => {
    expect(await cashHoldings(onlySetting)).toEqual([
      { name: '口座残高', value: '1525210.00' },
    ]);
  });

  it('is NOT added on top of holdings that already exist', async () => {
    // This is the double count being removed. Adding 800,000 to the 800,000
    // already recorded would preserve it in the new shape -- permanently, and
    // invisibly, because the result still looks like a balance.
    expect(await cashHoldings(alsoHasCashHoldings)).toEqual([
      { name: '銀行口座', value: '800000.00' },
    ]);
  });

  it('gives an empty ledger a zero holding rather than nothing to edit', async () => {
    expect(await cashHoldings(nothingAtAll)).toEqual([{ name: '口座残高', value: '0.00' }]);
  });

  it('is carried in beside unrelated asset categories', async () => {
    // 定期預金 is not the money at hand, so the balance still needs a home.
    expect(await cashHoldings(renamedCash)).toEqual([{ name: '口座残高', value: '42000.00' }]);
    const categories = await raw<{ name: string; kind: string | null }>(
      db.adminPool,
      'SELECT name, kind FROM asset_categories WHERE ledger_id = $1 ORDER BY sort_order',
      [renamedCash],
    );
    expect(categories).toEqual([
      { name: '現金', kind: 'cash' },
      { name: '定期預金', kind: null },
    ]);
  });

  it('promotes an existing 現金 category instead of creating a second one', async () => {
    const rows = await raw<{ name: string; kind: string | null }>(
      db.adminPool,
      'SELECT name, kind FROM asset_categories WHERE ledger_id = $1',
      [alsoHasCashHoldings],
    );
    expect(rows).toEqual([{ name: '現金', kind: 'cash' }]);
  });

  it('is kept under a retired key rather than deleted', async () => {
    // The one question a household cannot reconstruct for itself is "what was my
    // balance before this ran". Renamed, not dropped.
    const rows = await raw<{ key: string; value: string }>(
      db.adminPool,
      'SELECT key, value FROM settings WHERE ledger_id = $1',
      [onlySetting],
    );
    expect(rows).toEqual([{ key: 'legacy_current_balance', value: '1525210' }]);
  });

  it('leaves no readable current_balance behind', async () => {
    // Renamed everywhere, so nothing can quietly start reading it again and
    // reintroduce a second source of cash.
    expect(await raw(db.adminPool, "SELECT 1 FROM settings WHERE key = 'current_balance'"))
      .toHaveLength(0);
  });
});

describe('the schema keeps the guarantee', () => {
  it('refuses a second cash category in the same ledger', async () => {
    await expect(
      db.adminPool.query(
        `INSERT INTO asset_categories (ledger_id, name, sort_order, fields, kind)
           VALUES ($1, 'もう一つの現金', 5, '[]'::jsonb, 'cash')`,
        [onlySetting],
      ),
    ).rejects.toThrow();
  });

  it('refuses a kind the application has no code for', async () => {
    await expect(
      db.adminPool.query(
        `INSERT INTO asset_categories (ledger_id, name, sort_order, fields, kind)
           VALUES ($1, '謎', 6, '[]'::jsonb, 'crypto')`,
        [onlySetting],
      ),
    ).rejects.toThrow();
  });

  it('allows any number of ordinary categories', async () => {
    await expect(
      db.adminPool.query(
        `INSERT INTO asset_categories (ledger_id, name, sort_order, fields)
           VALUES ($1, 'NISA', 7, '[]'::jsonb), ($1, 'iDeCo', 8, '[]'::jsonb)`,
        [onlySetting],
      ),
    ).resolves.toBeDefined();
  });
});
