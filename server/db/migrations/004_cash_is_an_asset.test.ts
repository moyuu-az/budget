import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, migrationsDir, raw, type TestDb } from '../../test/pg';
import { migrate } from '../migrate';
import { MAX_ASSET_VALUE } from '../../../shared/asset-fields';
import { CASH_CATEGORY_DEFAULTS } from '../../../shared/asset-templates';

// ---------------------------------------------------------------------------
// Migration 004 moves MONEY, not just shapes.
//
// It decides, per ledger, whether the old `settings.current_balance` becomes a
// cash holding or is deliberately dropped as a duplicate. Get that wrong in
// either direction and a household either loses its balance or keeps counting it
// twice -- and neither is visible on screen, because both produce a plausible
// number.
//
// So this file starts a database at the 003 schema, seeds the situations that
// actually exist in production, applies 004, and checks the outcome.
//
// IT RUNS THE MIGRATION AS A NON-SUPERUSER OWNER (see startTestDb's
// `nonSuperuserOwner`). PostgreSQL exempts real superusers from row-level
// security unconditionally, and Cloud SQL's `postgres` is NOT one -- so a test
// that used the container's default user would run with the policies switched
// off and would pass whether or not this migration scopes its writes correctly.
// The set_config calls in 004 are the most fragile thing in it; they have to be
// under test.
// ---------------------------------------------------------------------------

let db: TestDb;
let staging: string;

/**
 * A directory holding migrations 001..003 only.
 *
 * Compared with `>=` rather than matched against '004'. With a prefix test, the
 * day 005 is added it would be copied here and applied BEFORE 004 -- either
 * failing outright (if it needs something 004 creates) or, worse, passing while
 * this file silently stops testing what it claims to.
 */
function migrationsUpTo003(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-mig-'));
  for (const file of fs.readdirSync(migrationsDir())) {
    if (!file.endsWith('.sql')) continue;
    if (file >= '004') continue;
    fs.copyFileSync(path.join(migrationsDir(), file), path.join(dir, file));
  }
  return dir;
}

/** Ledger ids, one per situation the migration has to tell apart. */
let onlySetting: number;
let alsoHasCashHoldings: number;
let nothingAtAll: number;
let otherAssetsOnly: number;
let twoCashCategories: number;
let zeroValuedCashRow: number;
let unparseableBalance: number;
let hugeBalance: number;
let fractionalBalance: number;
let twoCashCategoriesBothHolding: number;
let manySmallVersusOneLarge: number;

/**
 * Everything the migration warned about, as the operator would see it.
 *
 * The migration deliberately does not abort on a value it cannot use -- one bad
 * row must not block a deployment for every ledger -- so warnings are the ONLY
 * way anyone learns that a figure was rewritten. Captured here because "reported
 * rather than thrown" is worthless if the report goes nowhere.
 */
let warnings: string[] = [];

/** Creates an asset category at the 003 schema (no `kind` column yet in spirit). */
async function category(ledgerId: number, name: string, sortOrder: number): Promise<number> {
  const { rows } = await db.adminPool.query<{ id: number }>(
    `INSERT INTO asset_categories (ledger_id, name, color, sort_order, fields)
       VALUES ($1, $2, '#38bdf8', $3, '[]'::jsonb) RETURNING id`,
    [ledgerId, name, sortOrder],
  );
  return rows[0].id;
}

async function holding(
  ledgerId: number,
  categoryId: number,
  name: string,
  value: number,
): Promise<void> {
  await db.adminPool.query(
    `INSERT INTO assets (ledger_id, category_id, name, value, fields)
       VALUES ($1, $2, $3, $4, '{}'::jsonb)`,
    [ledgerId, categoryId, name, value],
  );
}

async function balanceSetting(ledgerId: number, value: string): Promise<void> {
  await db.adminPool.query(
    "INSERT INTO settings (ledger_id, key, value) VALUES ($1, 'current_balance', $2)",
    [ledgerId, value],
  );
}

beforeAll(async () => {
  staging = migrationsUpTo003();
  db = await startTestDb({ migrationsDir: staging, nonSuperuserOwner: true });

  const ledger = async (slug: string): Promise<number> => {
    const { rows } = await db.adminPool.query<{ id: number }>(
      "INSERT INTO ledgers (slug, name, kind) VALUES ($1, $1, 'personal') RETURNING id",
      [slug],
    );
    return rows[0].id;
  };

  // (1) The ordinary case before this release: a balance, no asset tracking.
  onlySetting = await ledger('only-setting');
  await balanceSetting(onlySetting, '1525210');

  // (2) The case that was double counting: a balance AND a 現金 category holding
  //     the same money.
  alsoHasCashHoldings = await ledger('double-counted');
  await balanceSetting(alsoHasCashHoldings, '800000');
  await holding(
    alsoHasCashHoldings,
    await category(alsoHasCashHoldings, '現金', 0),
    '銀行口座',
    800_000,
  );

  // (3) A ledger that never recorded anything.
  nothingAtAll = await ledger('empty');

  // (4) Asset tracking in use, but not for cash. 定期預金 is not money at hand,
  //     so the balance still needs a home of its own.
  otherAssetsOnly = await ledger('other-assets-only');
  await balanceSetting(otherAssetsOnly, '42000');
  await category(otherAssetsOnly, '定期預金', 0);

  // (5) TWO categories named 現金, with the money in the SECOND one. Reachable:
  //     asset categories have no unique name and the 現金 template could be
  //     applied twice. Promoting the empty one and carrying the balance into it
  //     would leave the real cash beside it as "some other asset" -- the same
  //     double count, in the new shape.
  twoCashCategories = await ledger('two-cash-categories');
  await balanceSetting(twoCashCategories, '300000');
  await category(twoCashCategories, '現金', 0);
  await holding(
    twoCashCategories,
    await category(twoCashCategories, '現金', 1),
    '財布',
    300_000,
  );

  // (6) A 現金 category whose only row is itself ¥0 -- a placeholder someone
  //     created and never filled in. Dropping the balance here would lose money;
  //     adding it to zero cannot double count.
  //
  //     DO NOT REMOVE THIS LEDGER as an unused-looking fixture. It is the ONLY
  //     case that separates "does the cash category hold anything" from "does it
  //     have any rows", which is the difference between carrying the old balance
  //     across and silently discarding it. Mutation testing confirmed it: revert
  //     the migration to counting rows and this is the single test that fails.
  zeroValuedCashRow = await ledger('zero-valued-cash-row');
  await balanceSetting(zeroValuedCashRow, '500000');
  await holding(zeroValuedCashRow, await category(zeroValuedCashRow, '現金', 0), '財布', 0);

  // (7) and (8) Values nothing ever validated. `setBalance` accepted any finite
  //     number and the column is TEXT, so both of these could be sitting in a
  //     production ledger -- and either would abort the whole migration.
  unparseableBalance = await ledger('unparseable-balance');
  await balanceSetting(unparseableBalance, '');

  hugeBalance = await ledger('huge-balance');
  await balanceSetting(hugeBalance, '99999999999999999');

  // (9) A fraction of a yen. The old setBalance schema was `z.number().finite()`
  //     with no `.int()`, so this is not hypothetical -- and a holding that is
  //     not a whole number cannot be saved again without the user retyping it.
  fractionalBalance = await ledger('fractional-balance');
  await balanceSetting(fractionalBalance, '1234.56');

  // (10) TWO categories named 現金, each holding ONE row, with the money in the
  //      one that sorts first... by row count they tie, so only the amount can
  //      decide. Picking the smaller would leave net worth right and the
  //      forecast starting from the wrong half.
  twoCashCategoriesBothHolding = await ledger('two-cash-both-holding');
  await holding(
    twoCashCategoriesBothHolding,
    await category(twoCashCategoriesBothHolding, '現金', 0),
    '財布A',
    100_000,
  );
  await holding(
    twoCashCategoriesBothHolding,
    await category(twoCashCategoriesBothHolding, '現金', 1),
    '銀行',
    200_000,
  );

  // (11) Duplicate 現金 where one holds MANY SMALL rows and the other holds ONE
  //      LARGE one. This is what separates "does it hold anything" from "how
  //      many rows does it hold": counting rows promotes the ¥10,000 side and
  //      leaves ¥1,000,000 outside the balance, with net worth still correct so
  //      nothing on screen looks wrong.
  manySmallVersusOneLarge = await ledger('many-small-vs-one-large');
  const smallCategory = await category(manySmallVersusOneLarge, '現金', 0);
  await holding(manySmallVersusOneLarge, smallCategory, '小銭入れ', 3_000);
  await holding(manySmallVersusOneLarge, smallCategory, '封筒', 3_000);
  await holding(manySmallVersusOneLarge, smallCategory, '車の中', 4_000);
  await holding(
    manySmallVersusOneLarge,
    await category(manySmallVersusOneLarge, '現金', 1),
    '銀行口座',
    1_000_000,
  );

  // ... and now the migration under test, applied by the schema owner.
  //
  // console.warn is where migrate() forwards PostgreSQL notices; see the
  // listener it installs and why.
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    await migrate(db.ownerPool, migrationsDir());
  } finally {
    console.warn = warn;
  }
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

/** Everything the ledger holds, cash or not -- i.e. its net worth. */
async function netWorth(ledgerId: number): Promise<string> {
  const [row] = await raw<{ total: string }>(
    db.adminPool,
    'SELECT coalesce(sum(value), 0)::text AS total FROM assets WHERE ledger_id = $1',
    [ledgerId],
  );
  return row.total;
}

describe('every ledger comes out with exactly one cash category', () => {
  it.each([
    ['a ledger that only had the setting', () => onlySetting],
    ['a ledger that was double counting', () => alsoHasCashHoldings],
    ['a ledger with nothing at all', () => nothingAtAll],
    ['a ledger tracking other assets', () => otherAssetsOnly],
    ['a ledger with two categories named 現金', () => twoCashCategories],
    ['a ledger whose only cash row is ¥0', () => zeroValuedCashRow],
    ['a ledger whose balance was fractional', () => fractionalBalance],
    ['a ledger with many small cash rows beside one large one', () => manySmallVersusOneLarge],
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
    expect(await cashHoldings(otherAssetsOnly)).toEqual([{ name: '口座残高', value: '42000.00' }]);
    const categories = await raw<{ name: string; kind: string | null }>(
      db.adminPool,
      'SELECT name, kind FROM asset_categories WHERE ledger_id = $1 ORDER BY sort_order',
      [otherAssetsOnly],
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

  it('is carried in when the only cash row is itself ¥0', async () => {
    // A placeholder row must not be read as "this household already records its
    // cash": adding the balance to zero cannot double count, while dropping it
    // loses money.
    expect(await cashHoldings(zeroValuedCashRow)).toEqual([
      { name: '財布', value: '0.00' },
      { name: '口座残高', value: '500000.00' },
    ]);
  });

  it('is kept under a retired key rather than deleted', async () => {
    // The one question a household cannot reconstruct for itself is "what was my
    // balance before this ran". Retired, not dropped.
    const rows = await raw<{ key: string; value: string }>(
      db.adminPool,
      'SELECT key, value FROM settings WHERE ledger_id = $1',
      [onlySetting],
    );
    expect(rows).toEqual([{ key: 'legacy_current_balance', value: '1525210' }]);
  });

  it('leaves no readable current_balance behind', async () => {
    // Retired everywhere, so nothing can quietly start reading it again and
    // reintroduce a second source of cash.
    expect(await raw(db.adminPool, "SELECT 1 FROM settings WHERE key = 'current_balance'"))
      .toHaveLength(0);
  });
});

describe('two categories named 現金 that both hold something', () => {
  it('promotes the one holding the most, since the row counts tie', async () => {
    // The failure this catches leaves net worth CORRECT and only the balance
    // wrong -- exactly the kind of error no screen would show as an error.
    expect(await cashHoldings(twoCashCategoriesBothHolding)).toEqual([
      { name: '銀行', value: '200000.00' },
    ]);
  });

  it('leaves the smaller one as an ordinary asset rather than losing it', async () => {
    expect(await netWorth(twoCashCategoriesBothHolding)).toBe('300000.00');
  });

  it('tells the operator that the ledger had duplicates', () => {
    // The household will see its balance drop from 300,000 to 200,000 -- correct
    // under the new rule, and inexplicable without someone knowing why.
    // Named by ledger id -- there is more than one such ledger in this fixture,
    // and an operator needs to know WHICH household to look at.
    expect(
      warnings.filter((line) =>
        line.includes(`ledger ${twoCashCategoriesBothHolding}: more than one category is named 現金`),
      ),
    ).toHaveLength(1);
  });
});

describe('two categories named 現金 with different numbers of rows', () => {
  it('promotes the one holding the MOST, not the one holding the MANY', async () => {
    // Row count is not the question. Three coins totalling ¥10,000 must not
    // outrank one account holding ¥1,000,000 -- that leaves 99% of the
    // household's cash outside 現在の残高, and the forecast starts from ¥10,000.
    expect(await cashHoldings(manySmallVersusOneLarge)).toEqual([
      { name: '銀行口座', value: '1000000.00' },
    ]);
  });

  it('still keeps the rest, so net worth is unaffected', async () => {
    expect(await netWorth(manySmallVersusOneLarge)).toBe('1010000.00');
  });

  it('warns in terms that match what it actually did', async () => {
    // The warning says "the one holding the most was promoted". Under row
    // counting that sentence was simply false for this ledger, and it is the
    // one sentence an operator reads.
    expect(
      warnings.filter((line) =>
        line.includes(`ledger ${manySmallVersusOneLarge}: more than one category is named 現金`),
      ),
    ).toHaveLength(1);
  });
});

describe('a ledger with two categories named 現金', () => {
  it('promotes the one holding the money, not the first by sort order', async () => {
    // Promoting the empty one and carrying 300,000 into it would leave the real
    // 財布 as an ordinary asset: net worth 600,000 for a household with 300,000.
    expect(await cashHoldings(twoCashCategories)).toEqual([{ name: '財布', value: '300000.00' }]);
  });

  it('does not carry the old balance in on top', async () => {
    expect(await netWorth(twoCashCategories)).toBe('300000.00');
  });

  it('leaves the other one as an ordinary category', async () => {
    const rows = await raw<{ name: string; kind: string | null; sort_order: number }>(
      db.adminPool,
      'SELECT name, kind, sort_order FROM asset_categories WHERE ledger_id = $1 ORDER BY sort_order',
      [twoCashCategories],
    );
    expect(rows).toEqual([
      { name: '現金', kind: null, sort_order: 0 },
      { name: '現金', kind: 'cash', sort_order: 1 },
    ]);
  });
});

describe('balances nothing ever validated', () => {
  it('does not abort the migration on a value that will not parse', async () => {
    // `setBalance` accepted any finite number and the column is TEXT. A value
    // like this aborting the run would block the deployment, not just the ledger.
    expect(await cashHoldings(unparseableBalance)).toEqual([
      { name: '口座残高', value: '0.00' },
    ]);
  });

  it('rounds a fractional balance to whole yen', async () => {
    // Holdings are whole yen now (server/http/input-schemas.ts). Carried across
    // unrounded, this row could not be saved again without the user retyping a
    // figure they never entered.
    expect(await cashHoldings(fractionalBalance)).toEqual([
      { name: '口座残高', value: '1235.00' },
    ]);
  });

  it('clamps a value too large for an asset to hold', async () => {
    // NUMERIC(14,2) tops out below 10^12; the old column had no such limit.
    //
    // Compared against MAX_ASSET_VALUE rather than a literal: the migration
    // spells the same number out in SQL (it cannot import TypeScript), and this
    // is what stops the two from drifting apart unnoticed -- the same guard the
    // CASH_CATEGORY_DEFAULTS test provides for the category's shape.
    expect(await cashHoldings(hugeBalance)).toEqual([
      { name: '口座残高', value: `${MAX_ASSET_VALUE}.00` },
    ]);
  });

  it('tells the operator about each figure it rewrote', () => {
    // Silence here would be the worst outcome: the migration succeeds, the
    // deployment proceeds, and a balance of ¥99,999,999,999,999,999 has quietly
    // become ¥999,999,999,999 with nobody informed. node-postgres discards
    // notices unless something listens, so this asserts the listener as much as
    // the SQL.
    expect(warnings.filter((line) => line.includes('is not a number'))).toHaveLength(1);
    expect(warnings.filter((line) => line.includes('exceeds what an asset value can hold')))
      .toHaveLength(1);
    // Prefixed and labelled, so it is findable in a deployment log.
    expect(warnings.every((line) => line.startsWith('[migration] '))).toBe(true);
  });

  it('keeps the original of both, so neither is silently rewritten', async () => {
    const rows = await raw<{ ledger_id: number; value: string }>(
      db.adminPool,
      `SELECT ledger_id, value FROM settings
        WHERE key = 'legacy_current_balance' AND ledger_id = ANY($1) ORDER BY ledger_id`,
      [[unparseableBalance, hugeBalance]],
    );
    expect(rows).toEqual([
      { ledger_id: unparseableBalance, value: '' },
      { ledger_id: hugeBalance, value: '99999999999999999' },
    ]);
  });
});

describe('applying it a second time', () => {
  // The runner skips applied migrations, so this only happens by hand or from a
  // dump restored without schema_migrations. It is tested because the file
  // PROMISES not to destroy the old balance, and a promise that holds only while
  // nobody makes a mistake is not worth writing down.
  it('changes nothing', async () => {
    const before = {
      cash: await cashHoldings(onlySetting),
      empty: await cashHoldings(nothingAtAll),
      zero: await cashHoldings(zeroValuedCashRow),
      settings: await raw(
        db.adminPool,
        'SELECT ledger_id, key, value FROM settings ORDER BY ledger_id, key',
      ),
    };

    const sql = fs.readFileSync(
      path.join(migrationsDir(), '004_cash_is_an_asset.sql'),
      'utf8',
    );
    await db.ownerPool.query(sql);

    expect(await cashHoldings(onlySetting)).toEqual(before.cash);
    // THIS is the ledger the guard protects: its carried-in 口座残高 is itself
    // ¥0, so `cash_total = 0` is still true on the second pass and the insert
    // would run again. (zeroValuedCashRow below is NOT a witness -- after the
    // first pass it holds ¥500,000, so the amount test stops it earlier.)
    expect(await cashHoldings(nothingAtAll)).toEqual(before.empty);
    expect(await cashHoldings(zeroValuedCashRow)).toEqual(before.zero);
    // And the retired balances survive: the naive
    // "DELETE legacy; UPDATE current_balance -> legacy" form wiped them here.
    expect(
      await raw(db.adminPool, 'SELECT ledger_id, key, value FROM settings ORDER BY ledger_id, key'),
    ).toEqual(before.settings);
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

describe('the category it creates agrees with the one the server provisions', () => {
  it('has the same name, colour, order and parameters', async () => {
    // The definition is written twice -- here in SQL and in
    // shared/asset-templates.ts -- because a .sql file cannot import TypeScript.
    // Unavoidable, but not unwatched: without this, changing 保管場所 in one
    // place would leave older ledgers permanently shaped differently.
    const [created] = await raw<{
      name: string;
      color: string;
      sort_order: number;
      fields: unknown;
    }>(
      db.adminPool,
      `SELECT name, color, sort_order, fields FROM asset_categories
        WHERE ledger_id = $1 AND kind = 'cash'`,
      [nothingAtAll],
    );

    expect(created).toEqual({
      name: CASH_CATEGORY_DEFAULTS.name,
      color: CASH_CATEGORY_DEFAULTS.color,
      sort_order: CASH_CATEGORY_DEFAULTS.sortOrder,
      fields: CASH_CATEGORY_DEFAULTS.fields,
    });
  });
});
