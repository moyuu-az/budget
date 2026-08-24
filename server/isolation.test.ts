import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Hono } from 'hono';
import { startTestDb, resetDb, raw, LEDGER_SCOPED_TABLES, type TestDb } from './test/pg';
import { createSessionService } from './auth/session';
import { createApp, LEDGER_HEADER } from './http/app';
import { METHODS, type DataMethod } from './http/api';
import { UnauthorizedError } from './http/errors';
import type { IdentityVerifier } from './auth/identity';
import type { Session } from '../shared/types';

// ---------------------------------------------------------------------------
// The exhaustive tenant-isolation sweep.
//
// The other suites check isolation at each layer with hand-picked examples. This
// one asks the question of EVERY method in the contract at once, and -- more
// importantly -- it is driven by the METHODS table itself. A method added to
// AppApi without an entry here fails to compile, so coverage cannot quietly fall
// behind the API.
//
// That is the same principle the runtime design follows: rather than remembering
// to add a guard, make the omission impossible to express.
//
// THE SCENARIO
//   Two households share a deployment. Alice holds a completely valid session.
//   For each method she calls it scoped to HER ledger but passes ids belonging to
//   BOB's private ledger -- the only thing a client actually controls. Afterwards
//   every row of Bob's ledger must be byte-identical to what it was, and nothing
//   Alice got back may mention anything of his.
// ---------------------------------------------------------------------------

const ALICE = 'alice@example.test';
const BOB = 'bob@example.test';

let db: TestDb;
let app: Hono<{ Variables: { session: Session } }>;

/** Everything one ledger holds, for a before/after comparison. */
interface Fixture {
  ledgerId: number;
  categoryId: number;
  templateId: number;
  snapshotId: number;
  assetCategoryId: number;
  assetId: number;
}

function headerVerifier(): IdentityVerifier {
  return {
    async verify(headers) {
      const email = headers.get('x-test-user');
      if (!email) throw new UnauthorizedError('no test identity');
      return { googleSub: `sub:${email}`, email };
    },
  };
}

async function post(method: string, as: string, ledgerId: number, args: unknown[]): Promise<Response> {
  return app.request(`/api/${method}`, {
    method: 'POST',
    headers: {
      'x-test-user': as,
      'content-type': 'application/json',
      [LEDGER_HEADER]: String(ledgerId),
    },
    body: JSON.stringify({ args }),
  });
}

async function signIn(email: string): Promise<Session> {
  const response = await app.request('/api/getSession', {
    method: 'POST',
    headers: { 'x-test-user': email, 'content-type': 'application/json' },
    body: '{}',
  });
  return (await response.json()) as Session;
}

/** Fills a ledger with one of everything, so every method has something to reach for. */
async function seed(as: string, ledgerId: number, tag: string): Promise<Fixture> {
  const category = (await (
    await post('addCategory', as, ledgerId, [{ name: `${tag}-cat`, type: 'expense', color: '#123456' }])
  ).json()) as { id: number };

  const template = (await (
    await post('addTemplate', as, ledgerId, [
      { name: `${tag}-tpl`, dayOfMonth: 15, type: 'expense', categoryId: category.id, defaultAmount: 1000 },
    ])
  ).json()) as { id: number };

  await post('setMonthlyAmount', as, ledgerId, [template.id, '2026-01', 111]);
  await post('setMonthlyAmount', as, ledgerId, [template.id, '2026-02', 222]);
  await post('setMonthlyActual', as, ledgerId, [template.id, '2026-01', 333]);
  await post('setBalance', as, ledgerId, [444_444]);

  const snapshot = (await (
    await post('addSnapshot', as, ledgerId, ['2026-01-01', 555_555])
  ).json()) as { id: number };

  const assetCategory = (await (
    await post('addAssetCategory', as, ledgerId, [
      {
        name: `${tag}-asset-cat`,
        color: '#654321',
        fields: [{ key: 'f1', label: '銘柄', type: 'text', required: true, unit: null }],
      },
    ])
  ).json()) as { id: number };

  const asset = (await (
    await post('addAsset', as, ledgerId, [
      { categoryId: assetCategory.id, name: `${tag}-asset`, value: 777_777, fields: { f1: `${tag}-銘柄` } },
    ])
  ).json()) as { id: number };

  return {
    ledgerId,
    categoryId: category.id,
    templateId: template.id,
    snapshotId: snapshot.id,
    assetCategoryId: assetCategory.id,
    assetId: asset.id,
  };
}

/** Every row belonging to one ledger, ordered, as a comparable string. */
async function snapshotLedger(ledgerId: number): Promise<string> {
  const parts: string[] = [];
  for (const table of LEDGER_SCOPED_TABLES) {
    const rows = await raw(
      db.adminPool,
      `SELECT * FROM ${table} WHERE ledger_id = $1 ORDER BY 1`,
      [ledgerId],
    );
    parts.push(`${table}:${JSON.stringify(rows)}`);
  }
  return parts.join('\n');
}

/**
 * For each method, the arguments most likely to reach into the other ledger.
 *
 * Typed as a mapped type over DataMethod: adding a method to the contract
 * without deciding how it could be abused here is a compile error.
 */
const ADVERSARIAL_ARGS: { [M in DataMethod]: (victim: Fixture) => unknown[] } = {
  // No arguments to subvert -- these are covered by asserting the RESPONSE holds
  // nothing of the other ledger's.
  getBalance: () => [],
  getCategories: () => [],
  getTemplates: () => [],
  getSnapshots: () => [],

  // Writes into the caller's own ledger. Included so the sweep proves they do
  // not somehow spill sideways.
  setBalance: () => [999_999],
  addCategory: () => [{ name: 'intruder', type: 'expense' }],
  addSnapshot: () => ['2026-01-01', 999_999],

  // Every one of these names an id from the OTHER ledger.
  updateCategory: (v) => [v.categoryId, { name: 'hijacked', color: '#000000' }],
  deleteCategory: (v) => [v.categoryId],
  addTemplate: (v) => [{ name: 'intruder', dayOfMonth: 1, type: 'expense', categoryId: v.categoryId }],
  updateTemplate: (v) => [v.templateId, { name: 'hijacked', defaultAmount: 999 }],
  toggleTemplate: (v) => [v.templateId, false],
  deleteTemplate: (v) => [v.templateId],
  deleteSnapshot: (v) => [v.snapshotId],
  setMonthlyAmount: (v) => [v.templateId, '2026-01', 999],
  deleteMonthlyAmount: (v) => [v.templateId, '2026-01'],
  setMonthlyActual: (v) => [v.templateId, '2026-01', 999],
  deleteMonthlyActual: (v) => [v.templateId, '2026-01'],

  // Reads whose whole job is to return rows in bulk.
  getMonthlyAmounts: () => ['2026-01'],
  getMonthlyAmountsRange: () => ['2000-01', '2099-12'],
  getMonthlyActuals: () => ['2026-01'],
  getMonthlyActualsRange: () => ['2000-01', '2099-12'],
  getSnapshotsRange: () => ['2000-01-01', '2099-12-31'],

  // The bulk copy: an INSERT ... SELECT whose SELECT carries no ledger predicate,
  // so if row-level security were inert this is where the other ledger's figures
  // would be pulled across.
  copyMonthlyAmounts: () => ['2026-01', '2026-03'],

  // --- Assets ---
  getAssetCategories: () => [],
  getAssets: () => [],
  addAssetCategory: () => [{ name: 'intruder', fields: [] }],
  updateAssetCategory: (v) => [v.assetCategoryId, { name: 'hijacked' }],
  deleteAssetCategory: (v) => [v.assetCategoryId],
  // Names BOTH of the other ledger's ids at once: the holding to rewrite and the
  // category to attach it to. add and update are separate code paths, so the
  // category check has to be proven on each.
  updateAsset: (v) => [v.assetId, { categoryId: v.assetCategoryId, name: 'hijacked', value: 1 }],
  deleteAsset: (v) => [v.assetId],
  // Attaching a holding to the OTHER ledger's asset category. The category
  // lookup runs inside the ledger-scoped transaction, so it must come back
  // empty -- and if it somehow did not, the composite foreign key is the second
  // refusal.
  addAsset: (v) => [{ categoryId: v.assetCategoryId, name: 'intruder', value: 1, fields: { f1: 'x' } }],
};

beforeAll(async () => {
  db = await startTestDb();
}, 180_000);

afterAll(async () => {
  await db?.stop();
});

beforeEach(async () => {
  await resetDb(db.adminPool);
  app = createApp({
    pool: db.pool,
    verifier: headerVerifier(),
    sessions: createSessionService(db.pool, {
      allowedEmails: [ALICE, BOB],
      sharedLedgerName: '家計',
    }),
    exposeInternals: true,
  });
});

describe('exhaustive isolation sweep', () => {
  it('covers every method the contract exposes', () => {
    // Guards against the sweep drifting from the API even if the mapped type
    // were ever loosened.
    expect(Object.keys(ADVERSARIAL_ARGS).sort()).toEqual(Object.keys(METHODS).sort());
  });

  it.each(Object.keys(METHODS) as DataMethod[])(
    '%s cannot touch or reveal another ledger',
    async (method) => {
      const alice = await signIn(ALICE);
      const bob = await signIn(BOB);
      const aliceLedger = alice.ledgers.find((l) => l.kind === 'personal')!.id;
      const bobLedger = bob.ledgers.find((l) => l.kind === 'personal')!.id;

      const victim = await seed(BOB, bobLedger, 'bob');
      await seed(ALICE, aliceLedger, 'alice');

      const before = await snapshotLedger(bobLedger);

      const response = await post(method, ALICE, aliceLedger, ADVERSARIAL_ARGS[method](victim));
      // The call may legitimately succeed (on Alice's own data) or be rejected.
      // What must never happen is that Bob's ledger changes -- and a rejection
      // must be a 4xx: a 500 would mean the server treated a caller reaching
      // into another ledger as its own malfunction.
      expect(
        [200, 204, 400, 403, 409],
        `${method} answered ${response.status}: ${await response.clone().text()}`,
      ).toContain(response.status);

      expect(await snapshotLedger(bobLedger), `${method} mutated the other ledger`).toBe(before);

      // ...and nothing of Bob's may come back in the payload.
      const body = response.status === 204 ? '' : await response.text();
      for (const [label, id] of [
        ['category', victim.categoryId],
        ['template', victim.templateId],
        ['snapshot', victim.snapshotId],
        ['asset category', victim.assetCategoryId],
        ['asset', victim.assetId],
      ] as const) {
        expect(
          new RegExp(`"(id|templateId|categoryId)":${id}\\b`).test(body),
          `${method} returned the other ledger's ${label} id ${id}`,
        ).toBe(false);
      }
      expect(body, `${method} returned the other ledger's data`).not.toContain('bob-');
    },
  );
});

describe('shared data stays shared', () => {
  it('lets both members read what either of them wrote', async () => {
    // The sweep proves separation. This proves the separation did not go too
    // far: the household ledger is meant to be shared, and a change that broke
    // that would otherwise pass every isolation test in this file.
    const alice = await signIn(ALICE);
    const bob = await signIn(BOB);
    const shared = alice.ledgers.find((l) => l.kind === 'shared')!.id;
    expect(bob.ledgers.some((l) => l.id === shared)).toBe(true);

    await seed(ALICE, shared, 'household');

    const categories = (await (await post('getCategories', BOB, shared, [])).json()) as {
      name: string;
    }[];
    const balance = await (await post('getBalance', BOB, shared, [])).json();

    expect(categories.map((c) => c.name)).toEqual(['household-cat']);
    expect(balance).toBe(444_444);
  });
});

describe('schema drift guard', () => {
  it('gives every ledger-scoped table a FORCEd isolation policy', async () => {
    // Finds the tables by their ledger_id column rather than from a list, so a
    // table added later is checked automatically. Without this, a new
    // ledger-scoped table could ship with no policy and leak from day one --
    // and every existing test would still pass.
    const tables = await raw<{ table_name: string }>(
      db.adminPool,
      `SELECT c.table_name
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_name = c.table_name AND t.table_schema = c.table_schema
        WHERE c.table_schema = 'public'
          AND c.column_name = 'ledger_id'
          AND t.table_type = 'BASE TABLE'
          AND c.table_name <> 'ledger_members'
        ORDER BY c.table_name`,
    );

    expect(tables.length).toBeGreaterThan(0);

    for (const { table_name } of tables) {
      const [flags] = await raw<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        db.adminPool,
        'SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = $1',
        [table_name],
      );
      expect(flags?.relrowsecurity, `${table_name} has no ENABLE ROW LEVEL SECURITY`).toBe(true);
      expect(flags?.relforcerowsecurity, `${table_name} has no FORCE ROW LEVEL SECURITY`).toBe(true);

      const policies = await raw<{ qual: string; with_check: string | null }>(
        db.adminPool,
        'SELECT qual, with_check FROM pg_policies WHERE tablename = $1',
        [table_name],
      );
      expect(policies.length, `${table_name} has no policy`).toBeGreaterThan(0);
      for (const policy of policies) {
        // USING without WITH CHECK would filter reads while still allowing a
        // write into someone else's ledger.
        expect(policy.qual, `${table_name} policy has no USING`).toContain('app_current_ledger_id');
        expect(policy.with_check, `${table_name} policy has no WITH CHECK`).toContain(
          'app_current_ledger_id',
        );
      }
    }
  });
});
