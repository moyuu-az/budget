import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDb, resetDb, createLedger, raw, type TestDb } from '../test/pg';
import { withLedgerScope, withoutLedgerScope } from './ledger-scope';
import { assertIsolationEnforceable } from './assert-isolation';

// ---------------------------------------------------------------------------
// What this file protects
//
// Two households share one deployment. Every assertion here is about a way that
// arrangement could leak or corrupt data, expressed at the layer that has the
// final say: the database. Repository-level tests cannot substitute -- a
// repository that forgets a WHERE clause would agree with itself.
// ---------------------------------------------------------------------------

let db: TestDb;
let ledgerA: number;
let ledgerB: number;

/** PostgreSQL SQLSTATE of a rejected statement, or undefined if it succeeded. */
async function sqlstateOf(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

beforeAll(async () => {
  db = await startTestDb();
}, 180_000);

afterAll(async () => {
  await db?.stop();
});

beforeEach(async () => {
  await resetDb(db.adminPool);
  ledgerA = await createLedger(db.adminPool, 'household', 'shared');
  ledgerB = await createLedger(db.adminPool, 'private', 'personal');
});

describe('row-level security', () => {
  it('is FORCEd on every ledger-scoped table', async () => {
    // ENABLE alone exempts the table owner. Migrations run as the owner, and a
    // deployment that connects with that same role would then see no isolation
    // at all. Assert the flag directly rather than inferring it.
    const rows = await raw<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      db.adminPool,
      `SELECT relname, relrowsecurity, relforcerowsecurity
         FROM pg_class
        WHERE relname = ANY($1::text[])`,
      [[
        'settings', 'categories', 'entry_templates',
        'monthly_amounts', 'monthly_actuals', 'balance_snapshots',
      ]],
    );

    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.relrowsecurity, `${row.relname} ENABLE`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} FORCE`).toBe(true);
    }
  });

  it('hides another ledger\'s rows from a scoped read', async () => {
    await withLedgerScope(db.pool, ledgerA, (c) =>
      c.query("INSERT INTO categories (ledger_id, name, type) VALUES ($1, 'A only', 'expense')", [ledgerA]),
    );
    await withLedgerScope(db.pool, ledgerB, (c) =>
      c.query("INSERT INTO categories (ledger_id, name, type) VALUES ($1, 'B only', 'expense')", [ledgerB]),
    );

    const seenFromA = await withLedgerScope(db.pool, ledgerA, async (c) =>
      (await c.query<{ name: string }>('SELECT name FROM categories')).rows,
    );

    // Note the query has NO WHERE clause: the filtering is entirely the policy's
    // doing, which is exactly the protection a forgetful repository needs.
    expect(seenFromA.map((r) => r.name)).toEqual(['A only']);

    // Both rows really are stored; only the scoped view is narrow.
    const all = await raw<{ name: string }>(db.adminPool, 'SELECT name FROM categories ORDER BY name');
    expect(all.map((r) => r.name)).toEqual(['A only', 'B only']);
  });

  it('refuses to write a row into another ledger (WITH CHECK)', async () => {
    // USING alone would filter reads while still letting a caller *create* rows
    // in someone else's ledger. The policies carry WITH CHECK for this reason.
    const code = await sqlstateOf(() =>
      withLedgerScope(db.pool, ledgerA, (c) =>
        c.query("INSERT INTO categories (ledger_id, name, type) VALUES ($1, 'smuggled', 'expense')", [ledgerB]),
      ),
    );

    expect(code).toBe('42501'); // insufficient_privilege -- the policy rejected it
    const all = await raw(db.adminPool, 'SELECT 1 FROM categories');
    expect(all).toHaveLength(0);
  });

  it('cannot UPDATE another ledger\'s row into view', async () => {
    await withLedgerScope(db.pool, ledgerB, (c) =>
      c.query("INSERT INTO categories (ledger_id, name, type) VALUES ($1, 'B only', 'expense')", [ledgerB]),
    );

    const updated = await withLedgerScope(db.pool, ledgerA, async (c) =>
      (await c.query("UPDATE categories SET name = 'hijacked'")).rowCount,
    );

    // USING filtered the row out of the UPDATE's candidate set entirely.
    expect(updated).toBe(0);
    const [row] = await raw<{ name: string }>(db.adminPool, 'SELECT name FROM categories');
    expect(row.name).toBe('B only');
  });

  it('cannot DELETE another ledger\'s row', async () => {
    await withLedgerScope(db.pool, ledgerB, (c) =>
      c.query("INSERT INTO categories (ledger_id, name, type) VALUES ($1, 'B only', 'expense')", [ledgerB]),
    );

    const deleted = await withLedgerScope(db.pool, ledgerA, async (c) =>
      (await c.query('DELETE FROM categories')).rowCount,
    );

    expect(deleted).toBe(0);
    expect(await raw(db.adminPool, 'SELECT 1 FROM categories')).toHaveLength(1);
  });

  it('fails closed when no scope was opened', async () => {
    await withLedgerScope(db.pool, ledgerA, (c) =>
      c.query("INSERT INTO categories (ledger_id, name, type) VALUES ($1, 'A only', 'expense')", [ledgerA]),
    );

    // Forgetting withLedgerScope must yield nothing, never everything.
    const rows = await withoutLedgerScope(db.pool, async (c) =>
      (await c.query('SELECT * FROM categories')).rows,
    );
    expect(rows).toEqual([]);
  });

  it('does not leak the scope to the next user of a pooled connection', async () => {
    // set_config(..., is_local => true) ties the setting to the transaction.
    // A session-level SET would survive release() and hand the next request
    // whatever ledger the previous one was reading.
    await withLedgerScope(db.pool, ledgerA, (c) =>
      c.query("INSERT INTO categories (ledger_id, name, type) VALUES ($1, 'A only', 'expense')", [ledgerA]),
    );

    const leaked = await withoutLedgerScope(db.pool, async (c) => {
      const { rows } = await c.query<{ v: string | null }>(
        "SELECT current_setting('app.current_ledger_id', true) AS v",
      );
      return rows[0].v;
    });

    expect(leaked === null || leaked === '').toBe(true);
  });

  it('rejects a nonsensical ledger id instead of failing closed silently', async () => {
    // An unset GUC produces an empty result, which reads as "no data" rather
    // than "bad request". Catching it here keeps that ambiguity out of the app.
    await expect(withLedgerScope(db.pool, Number.NaN, async () => null)).rejects.toThrow(/invalid ledgerId/);
    await expect(withLedgerScope(db.pool, 0, async () => null)).rejects.toThrow(/invalid ledgerId/);
    await expect(withLedgerScope(db.pool, -1, async () => null)).rejects.toThrow(/invalid ledgerId/);
  });
});

describe('cross-ledger referential integrity', () => {
  it('refuses a template pointing at a category in another ledger', async () => {
    const categoryInB = await withLedgerScope(db.pool, ledgerB, async (c) => {
      const { rows } = await c.query<{ id: number }>(
        "INSERT INTO categories (ledger_id, name, type) VALUES ($1, 'B cat', 'expense') RETURNING id",
        [ledgerB],
      );
      return rows[0].id;
    });

    // Foreign key checks run with row security bypassed, so this is genuinely
    // the composite FK talking -- not the policy hiding the target row.
    const code = await sqlstateOf(() =>
      withLedgerScope(db.pool, ledgerA, (c) =>
        c.query(
          `INSERT INTO entry_templates (ledger_id, name, day_of_month, type, category_id)
             VALUES ($1, 'leaky', 1, 'expense', $2)`,
          [ledgerA, categoryInB],
        ),
      ),
    );

    expect(code).toBe('23503'); // foreign_key_violation
  });

  it('allows a template with no category at all', async () => {
    // MATCH SIMPLE skips a composite FK when any column is NULL, which is what
    // keeps "uncategorised" legal.
    await expect(
      withLedgerScope(db.pool, ledgerA, (c) =>
        c.query(
          `INSERT INTO entry_templates (ledger_id, name, day_of_month, type, category_id)
             VALUES ($1, 'no category', 1, 'expense', NULL)`,
          [ledgerA],
        ),
      ),
    ).resolves.toBeDefined();
  });

  it('nulls only category_id when a category is deleted, keeping ledger_id intact', async () => {
    await withLedgerScope(db.pool, ledgerA, async (c) => {
      const { rows } = await c.query<{ id: number }>(
        "INSERT INTO categories (ledger_id, name, type) VALUES ($1, 'doomed', 'expense') RETURNING id",
        [ledgerA],
      );
      await c.query(
        `INSERT INTO entry_templates (ledger_id, name, day_of_month, type, category_id)
           VALUES ($1, 'orphan-to-be', 1, 'expense', $2)`,
        [ledgerA, rows[0].id],
      );
      await c.query('DELETE FROM categories WHERE id = $1', [rows[0].id]);
    });

    // A plain ON DELETE SET NULL would try to null ledger_id too and violate its
    // NOT NULL constraint. The (category_id) column list is what makes this work.
    const [template] = await raw<{ ledger_id: number; category_id: number | null }>(
      db.adminPool,
      'SELECT ledger_id, category_id FROM entry_templates',
    );
    expect(template.category_id).toBeNull();
    expect(template.ledger_id).toBe(ledgerA);
  });

  it('refuses a monthly amount whose ledger disagrees with its template', async () => {
    const templateInB = await withLedgerScope(db.pool, ledgerB, async (c) => {
      const { rows } = await c.query<{ id: number }>(
        `INSERT INTO entry_templates (ledger_id, name, day_of_month, type)
           VALUES ($1, 'B template', 1, 'expense') RETURNING id`,
        [ledgerB],
      );
      return rows[0].id;
    });

    // ledger_id is denormalised onto monthly_amounts so reads stay flat and the
    // RLS predicate stays a simple column comparison. The composite FK is what
    // makes that denormalisation impossible to get wrong.
    const code = await sqlstateOf(() =>
      withLedgerScope(db.pool, ledgerA, (c) =>
        c.query(
          `INSERT INTO monthly_amounts (ledger_id, template_id, year_month, amount)
             VALUES ($1, $2, '2026-01', 100)`,
          [ledgerA, templateInB],
        ),
      ),
    );

    expect(code).toBe('23503');
  });

  it('removes every trace of a ledger when it is deleted', async () => {
    await withLedgerScope(db.pool, ledgerA, async (c) => {
      const { rows } = await c.query<{ id: number }>(
        `INSERT INTO entry_templates (ledger_id, name, day_of_month, type)
           VALUES ($1, 't', 1, 'expense') RETURNING id`,
        [ledgerA],
      );
      await c.query(
        `INSERT INTO monthly_amounts (ledger_id, template_id, year_month, amount) VALUES ($1, $2, '2026-01', 1)`,
        [ledgerA, rows[0].id],
      );
      await c.query("INSERT INTO settings (ledger_id, key, value) VALUES ($1, 'current_balance', '5')", [ledgerA]);
      await c.query("INSERT INTO balance_snapshots (ledger_id, date, balance) VALUES ($1, '2026-01-01', 5)", [ledgerA]);
    });

    await raw(db.adminPool, 'DELETE FROM ledgers WHERE id = $1', [ledgerA]);

    for (const table of ['entry_templates', 'monthly_amounts', 'settings', 'balance_snapshots']) {
      expect(await raw(db.adminPool, `SELECT 1 FROM ${table}`), table).toHaveLength(0);
    }
  });
});

describe('per-ledger uniqueness', () => {
  it('lets each ledger hold a snapshot for the same date', async () => {
    // The old schema had a bare `date UNIQUE` and the repository upserts with
    // ON CONFLICT (date). Carried over unchanged, saving a snapshot in a private
    // ledger would have overwritten the household one for that day -- silent
    // data loss, not merely a visibility bug.
    await withLedgerScope(db.pool, ledgerA, (c) =>
      c.query("INSERT INTO balance_snapshots (ledger_id, date, balance) VALUES ($1, '2026-03-01', 100)", [ledgerA]),
    );
    await withLedgerScope(db.pool, ledgerB, (c) =>
      c.query("INSERT INTO balance_snapshots (ledger_id, date, balance) VALUES ($1, '2026-03-01', 999)", [ledgerB]),
    );

    const rows = await raw<{ ledger_id: number; balance: number }>(
      db.adminPool,
      'SELECT ledger_id, balance FROM balance_snapshots ORDER BY ledger_id',
    );
    expect(rows).toEqual([
      { ledger_id: ledgerA, balance: 100 },
      { ledger_id: ledgerB, balance: 999 },
    ]);
  });

  it('still rejects two snapshots for the same date in one ledger', async () => {
    await withLedgerScope(db.pool, ledgerA, (c) =>
      c.query("INSERT INTO balance_snapshots (ledger_id, date, balance) VALUES ($1, '2026-03-01', 100)", [ledgerA]),
    );
    const code = await sqlstateOf(() =>
      withLedgerScope(db.pool, ledgerA, (c) =>
        c.query("INSERT INTO balance_snapshots (ledger_id, date, balance) VALUES ($1, '2026-03-01', 200)", [ledgerA]),
      ),
    );
    expect(code).toBe('23505'); // unique_violation
  });

  it('gives each ledger its own current_balance', async () => {
    // `settings` used to be keyed on `key` alone, so the whole database had one
    // balance. A shared forecast and a personal forecast need their own.
    await withLedgerScope(db.pool, ledgerA, (c) =>
      c.query("INSERT INTO settings (ledger_id, key, value) VALUES ($1, 'current_balance', '1000')", [ledgerA]),
    );
    await withLedgerScope(db.pool, ledgerB, (c) =>
      c.query("INSERT INTO settings (ledger_id, key, value) VALUES ($1, 'current_balance', '2000')", [ledgerB]),
    );

    const readB = await withLedgerScope(db.pool, ledgerB, async (c) =>
      (await c.query<{ value: string }>("SELECT value FROM settings WHERE key = 'current_balance'")).rows,
    );
    expect(readB).toEqual([{ value: '2000' }]);
  });

  it('keeps one planned amount per template and month', async () => {
    // template_id already determines the ledger, so this needs no ledger_id.
    const templateId = await withLedgerScope(db.pool, ledgerA, async (c) => {
      const { rows } = await c.query<{ id: number }>(
        `INSERT INTO entry_templates (ledger_id, name, day_of_month, type)
           VALUES ($1, 't', 1, 'expense') RETURNING id`,
        [ledgerA],
      );
      await c.query(
        `INSERT INTO monthly_amounts (ledger_id, template_id, year_month, amount) VALUES ($1, $2, '2026-01', 10)`,
        [ledgerA, rows[0].id],
      );
      return rows[0].id;
    });

    const code = await sqlstateOf(() =>
      withLedgerScope(db.pool, ledgerA, (c) =>
        c.query(
          `INSERT INTO monthly_amounts (ledger_id, template_id, year_month, amount) VALUES ($1, $2, '2026-01', 20)`,
          [ledgerA, templateId],
        ),
      ),
    );
    expect(code).toBe('23505');
  });
});

describe('money and date representation', () => {
  it('stores amounts exactly, unlike the binary float the old schema used', async () => {
    // REAL is a binary float: 0.1 + 0.2 is not 0.3, and a ledger accumulates
    // that error. NUMERIC(14,2) is exact, and PostgreSQL sums it exactly too.
    const templateId = await withLedgerScope(db.pool, ledgerA, async (c) => {
      const { rows } = await c.query<{ id: number }>(
        `INSERT INTO entry_templates (ledger_id, name, day_of_month, type)
           VALUES ($1, 't', 1, 'expense') RETURNING id`,
        [ledgerA],
      );
      return rows[0].id;
    });

    await withLedgerScope(db.pool, ledgerA, async (c) => {
      await c.query(
        `INSERT INTO monthly_amounts (ledger_id, template_id, year_month, amount)
           VALUES ($1, $2, '2026-01', 0.10), ($1, $2, '2026-02', 0.20)`,
        [ledgerA, templateId],
      );
    });

    const [{ total }] = await withLedgerScope(db.pool, ledgerA, async (c) =>
      (await c.query<{ total: number }>('SELECT SUM(amount) AS total FROM monthly_amounts')).rows,
    );
    expect(total).toBe(0.3);
  });

  it('returns amounts as numbers, matching the API contract', async () => {
    // node-postgres hands NUMERIC back as a string by default; server/db/pool.ts
    // registers a parser so repositories never have to cast.
    await withLedgerScope(db.pool, ledgerA, (c) =>
      c.query("INSERT INTO balance_snapshots (ledger_id, date, balance) VALUES ($1, '2026-01-01', 1525210)", [ledgerA]),
    );
    const [row] = await withLedgerScope(db.pool, ledgerA, async (c) =>
      (await c.query<{ balance: number }>('SELECT balance FROM balance_snapshots')).rows,
    );
    expect(row.balance).toBe(1525210);
    expect(typeof row.balance).toBe('number');
  });

  it('returns a DATE as a plain YYYY-MM-DD string, not a zone-shifted Date', async () => {
    // The default parser builds a JS Date at *local* midnight. West of UTC that
    // turns 2026-01-01 into 2025-12-31 on the way out.
    await withLedgerScope(db.pool, ledgerA, (c) =>
      c.query("INSERT INTO balance_snapshots (ledger_id, date, balance) VALUES ($1, '2026-01-01', 1)", [ledgerA]),
    );
    const [row] = await withLedgerScope(db.pool, ledgerA, async (c) =>
      (await c.query<{ date: string }>('SELECT date FROM balance_snapshots')).rows,
    );
    expect(row.date).toBe('2026-01-01');
  });

  it('rejects a malformed year_month', async () => {
    const templateId = await withLedgerScope(db.pool, ledgerA, async (c) => {
      const { rows } = await c.query<{ id: number }>(
        `INSERT INTO entry_templates (ledger_id, name, day_of_month, type)
           VALUES ($1, 't', 1, 'expense') RETURNING id`,
        [ledgerA],
      );
      return rows[0].id;
    });

    const code = await sqlstateOf(() =>
      withLedgerScope(db.pool, ledgerA, (c) =>
        c.query(
          `INSERT INTO monthly_amounts (ledger_id, template_id, year_month, amount) VALUES ($1, $2, '2026-1', 1)`,
          [ledgerA, templateId],
        ),
      ),
    );
    expect(code).toBe('23514'); // check_violation
  });
});

describe('asset schema', () => {
  it('refuses a holding attached to another ledger\'s category', async () => {
    const categoryInB = await withLedgerScope(db.pool, ledgerB, async (c) => {
      const { rows } = await c.query<{ id: number }>(
        "INSERT INTO asset_categories (ledger_id, name) VALUES ($1, 'B cat') RETURNING id",
        [ledgerB],
      );
      return rows[0].id;
    });

    // Foreign key checks bypass row security, so this really is the composite
    // FK refusing -- not the policy hiding the target row.
    const code = await sqlstateOf(() =>
      withLedgerScope(db.pool, ledgerA, (c) =>
        c.query('INSERT INTO assets (ledger_id, category_id, name, value) VALUES ($1, $2, $3, 0)', [
          ledgerA,
          categoryInB,
          'leaky',
        ]),
      ),
    );

    expect(code).toBe('23503'); // foreign_key_violation
  });

  it('deletes the holdings when their category goes', async () => {
    await withLedgerScope(db.pool, ledgerA, async (c) => {
      const { rows } = await c.query<{ id: number }>(
        "INSERT INTO asset_categories (ledger_id, name) VALUES ($1, 'doomed') RETURNING id",
        [ledgerA],
      );
      await c.query(
        "INSERT INTO assets (ledger_id, category_id, name, value) VALUES ($1, $2, 'holding', 1)",
        [ledgerA, rows[0].id],
      );
      await c.query('DELETE FROM asset_categories WHERE id = $1', [rows[0].id]);
    });

    expect(await raw(db.adminPool, 'SELECT * FROM assets')).toEqual([]);
  });

  it('refuses JSON of the wrong shape in either column', async () => {
    // The CHECK is the floor under shared/asset-fields.ts: even a bug in the
    // server cannot store an object where the UI will iterate an array.
    const defsAsObject = await sqlstateOf(() =>
      withLedgerScope(db.pool, ledgerA, (c) =>
        c.query("INSERT INTO asset_categories (ledger_id, name, fields) VALUES ($1, 'x', '{}')", [
          ledgerA,
        ]),
      ),
    );
    expect(defsAsObject).toBe('23514'); // check_violation

    const categoryId = await withLedgerScope(db.pool, ledgerA, async (c) => {
      const { rows } = await c.query<{ id: number }>(
        "INSERT INTO asset_categories (ledger_id, name) VALUES ($1, 'ok') RETURNING id",
        [ledgerA],
      );
      return rows[0].id;
    });

    const valuesAsArray = await sqlstateOf(() =>
      withLedgerScope(db.pool, ledgerA, (c) =>
        c.query(
          "INSERT INTO assets (ledger_id, category_id, name, value, fields) VALUES ($1, $2, 'x', 0, '[]')",
          [ledgerA, categoryId],
        ),
      ),
    );
    expect(valuesAsArray).toBe('23514');
  });

  it('stores an asset value exactly, including a negative one', async () => {
    const value = await withLedgerScope(db.pool, ledgerA, async (c) => {
      const { rows: category } = await c.query<{ id: number }>(
        "INSERT INTO asset_categories (ledger_id, name) VALUES ($1, 'loan') RETURNING id",
        [ledgerA],
      );
      const { rows } = await c.query<{ value: number }>(
        "INSERT INTO assets (ledger_id, category_id, name, value) VALUES ($1, $2, 'x', $3) RETURNING value",
        [ledgerA, category[0].id, -28_000_000.55],
      );
      return rows[0].value;
    });
    // No CHECK (value >= 0), unlike monthly_amounts: a loan balance has to be
    // enterable for the portfolio total to mean anything.
    expect(value).toBe(-28_000_000.55);
  });
});

describe('expense classification', () => {
  it('refuses 固定費/変動費 on an income category', async () => {
    const code = await sqlstateOf(() =>
      withLedgerScope(db.pool, ledgerA, (c) =>
        c.query(
          "INSERT INTO categories (ledger_id, name, type, cost_type) VALUES ($1, 'salary', 'income', 'fixed')",
          [ledgerA],
        ),
      ),
    );
    expect(code).toBe('23514'); // check_violation
  });

  it('refuses a classification that is neither fixed nor variable', async () => {
    const code = await sqlstateOf(() =>
      withLedgerScope(db.pool, ledgerA, (c) =>
        c.query(
          "INSERT INTO categories (ledger_id, name, type, cost_type) VALUES ($1, 'rent', 'expense', 'occasional')",
          [ledgerA],
        ),
      ),
    );
    expect(code).toBe('23514');
  });

  it('leaves NULL legal on an expense category', async () => {
    // Every category that predates this feature is unclassified; making the
    // column NOT NULL would have forced a wrong answer onto all of them.
    await expect(
      withLedgerScope(db.pool, ledgerA, (c) =>
        c.query("INSERT INTO categories (ledger_id, name, type) VALUES ($1, 'food', 'expense')", [
          ledgerA,
        ]),
      ),
    ).resolves.toBeDefined();
  });
});

describe('isolation start-up guard', () => {
  it('accepts the least-privilege application role', async () => {
    await expect(assertIsolationEnforceable(db.pool)).resolves.toBeUndefined();
  });

  it('refuses a superuser connection', async () => {
    // The exact mistake that produced a real leak during development: the server
    // pointed at the `postgres` user, where no policy applies and a request for
    // an empty ledger returns whatever row the planner found first.
    await expect(assertIsolationEnforceable(db.adminPool)).rejects.toThrow(
      /bypasses row-level security/,
    );
  });
});

describe('isolation guard catches inherited privilege', () => {
  it('refuses a role that merely INHERITS bypass rights', async () => {
    // The realistic mistake is not creating a superuser for the app -- it is
    // granting the app role membership of something convenient. Checking only
    // the role's own attributes would wave this through.
    await db.adminPool.query('CREATE ROLE privileged_parent BYPASSRLS');
    await db.adminPool.query('GRANT privileged_parent TO app_user');
    try {
      await expect(assertIsolationEnforceable(db.pool)).rejects.toThrow(
        /inherits BYPASSRLS from "privileged_parent"/,
      );
    } finally {
      await db.adminPool.query('REVOKE privileged_parent FROM app_user');
      await db.adminPool.query('DROP ROLE privileged_parent');
    }
  });
});
