import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Hono } from 'hono';
import { startTestDb, resetDb, raw, LEDGER_SCOPED_TABLES, type TestDb } from './test/pg';
import type { VocabProgress } from '../shared/types';
import { createSessionService } from './auth/session';
import { createApp, LEDGER_HEADER } from './http/app';
import { METHODS, type DataMethod } from './http/api';
import { UnauthorizedError } from './http/errors';
import type { IdentityVerifier } from './auth/identity';
import type { Session } from '../shared/types';
import type { Recurrence } from '../shared/recurrence';
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER } from '../shared/contract-version';

/** Shorthand for the shape almost every test template has. */
const monthlyOn = (dayOfMonth: number): Recurrence => ({ kind: 'monthly', dayOfMonth });

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
      // Every request states which wire contract it was built against; without
      // it the server refuses the caller as a stale client, and this whole
      // sweep would pass for the wrong reason.
      [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION),
      [LEDGER_HEADER]: String(ledgerId),
    },
    body: JSON.stringify({ args }),
  });
}

async function signIn(email: string): Promise<Session> {
  const response = await app.request('/api/getSession', {
    method: 'POST',
    headers: {
      'x-test-user': email,
      'content-type': 'application/json',
      [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION),
    },
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
      { name: `${tag}-tpl`, recurrence: monthlyOn(15), type: 'expense', categoryId: category.id, defaultAmount: 1000 },
    ])
  ).json()) as { id: number };

  await post('setMonthlyAmount', as, ledgerId, [template.id, '2026-01', 111]);
  await post('setMonthlyAmount', as, ledgerId, [template.id, '2026-02', 222]);
  await post('setMonthlyActual', as, ledgerId, [template.id, '2026-01', 333]);

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
  // Settings take no id at all: the only thing naming a ledger is the header,
  // which the sweep already forges. The attack these two have to survive is
  // therefore "read/write the OTHER ledger's settings by claiming to be in it",
  // and the sweep supplies that on its own.
  getLedgerSettings: () => [],
  updateLedgerSettings: () => [{ minBalanceThreshold: 999_999 }],

  // No arguments to subvert -- these are covered by asserting the RESPONSE holds
  // nothing of the other ledger's.
  getCategories: () => [],
  getTemplates: () => [],
  getSnapshots: () => [],

  // Writes into the caller's own ledger. Included so the sweep proves they do
  // not somehow spill sideways.
  addCategory: () => [{ name: 'intruder', type: 'expense' }],
  addSnapshot: () => ['2026-01-01', 999_999],

  // Every one of these names an id from the OTHER ledger.
  updateCategory: (v) => [v.categoryId, { name: 'hijacked', color: '#000000' }],
  deleteCategory: (v) => [v.categoryId],
  addTemplate: (v) => [{ name: 'intruder', recurrence: monthlyOn(1), type: 'expense', categoryId: v.categoryId }],
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

  // --- User-scoped methods ---
  //
  // These take no ledger id, so there is nothing here to point at Bob's ledger.
  // They are still in the sweep for the two things it asserts unconditionally:
  // that the call cannot mutate another ledger (a study-record handler reaching
  // household data at all would be the defect), and that it answers 4xx rather
  // than 500 when refused.
  //
  // The attack these actually have to survive -- Alice reading or clearing BOB's
  // answers -- is not expressible through arguments, because the person is taken
  // from the session. It is covered by 「学習記録は人ごとに分かれている」 below,
  // which is where a change to the user scope will fail.
  getVocabProgress: () => [],
  recordVocabAttempts: () => [[{ wordId: 'et-481', direction: 'en_to_ja', correct: true }]],
  resetVocabProgress: () => [31],
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
    const assetCategories = (await (await post('getAssetCategories', BOB, shared, [])).json()) as {
      name: string;
      kind: string | null;
    }[];

    expect(categories.map((c) => c.name)).toEqual(['household-cat']);
    // Both members see the same cash category, because it belongs to the ledger
    // rather than to whoever asked for it first.
    expect(assetCategories.filter((c) => c.kind === 'cash')).toHaveLength(1);
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


// ---------------------------------------------------------------------------
// THE OTHER TENANT.
//
// The sweep above is about households. This is about people, and it is the only
// place the user scope is proven -- the sweep cannot reach it, because which
// person a request is about comes from the session rather than from anything a
// caller can put in the arguments.
//
// Two members of one household share the 家計 ledger by design. Their STUDY
// RECORDS must not be shared by the same design, and the failure would be quiet:
// 「間違えた問題だけ」 would re-ask the questions the other person got wrong, and
// 正答率 would average two people who never sat the same quiz.
// ---------------------------------------------------------------------------
describe('学習記録は人ごとに分かれている', () => {
  const answer = (wordId: string, correct: boolean) => ({
    wordId,
    direction: 'en_to_ja' as const,
    correct,
  });

  /** Posts a user-scoped method. The ledger header is sent and must be ignored. */
  async function postAsUser(method: string, as: string, args: unknown[]): Promise<Response> {
    const session = await signIn(as);
    return post(method, as, session.ledgers[0].id, args);
  }

  it('records answers against the caller, not against the ledger they had open', async () => {
    // Both write while the SHARED ledger is active -- the case that would leak
    // if the record hung off the ledger instead of the person.
    const alice = await signIn(ALICE);
    const bob = await signIn(BOB);
    const shared = alice.ledgers.find((l) => l.kind === 'shared')!.id;
    expect(bob.ledgers.some((l) => l.id === shared)).toBe(true);

    await post('recordVocabAttempts', ALICE, shared, [[answer('et-481', true), answer('et-482', true)]]);
    await post('recordVocabAttempts', BOB, shared, [[answer('et-481', false)]]);

    const aliceProgress = (await (
      await post('getVocabProgress', ALICE, shared, [])
    ).json()) as VocabProgress;
    const bobProgress = (await (
      await post('getVocabProgress', BOB, shared, [])
    ).json()) as VocabProgress;

    expect(aliceProgress.map((s) => s.wordId)).toEqual(['et-481', 'et-482']);
    expect(aliceProgress[0].byDirection.en_to_ja).toMatchObject({ attempts: 1, correct: 1, lastCorrect: true });

    // Bob answered the same word and got it wrong. If the scope were the ledger,
    // one of these two assertions would see the other person's outcome.
    expect(bobProgress.map((s) => s.wordId)).toEqual(['et-481']);
    expect(bobProgress[0].byDirection.en_to_ja).toMatchObject({ attempts: 1, correct: 0, lastCorrect: false });
  });

  it("a reset clears only the caller's answers", async () => {
    await postAsUser('recordVocabAttempts', ALICE, [[answer('et-481', true)]]);
    await postAsUser('recordVocabAttempts', BOB, [[answer('et-481', true)]]);

    await postAsUser('resetVocabProgress', BOB, [null]);

    const aliceProgress = (await (
      await postAsUser('getVocabProgress', ALICE, [])
    ).json()) as VocabProgress;
    const bobProgress = (await (
      await postAsUser('getVocabProgress', BOB, [])
    ).json()) as VocabProgress;

    expect(bobProgress).toEqual([]);
    // The DELETE carries no `WHERE user_id` -- the policy supplies it. If the
    // policy were inert this would be empty too, which is exactly the failure
    // this assertion exists to catch.
    expect(aliceProgress).toHaveLength(1);
  });

  it('resets one Day without touching the others', async () => {
    // et-481 is Day 31, et-497 is Day 32.
    await postAsUser('recordVocabAttempts', ALICE, [
      [answer('et-481', true), answer('et-497', false)],
    ]);

    const left = (await (
      await postAsUser('resetVocabProgress', ALICE, [31])
    ).json()) as VocabProgress;

    expect(left.map((s) => s.wordId)).toEqual(['et-497']);
  });

  it('refuses a word id the book does not carry', async () => {
    // `vocab_attempts.word_id` has no foreign key (the words live in source, not
    // in the database), so this schema check is the ONLY thing keeping rows that
    // resolve to nothing out of the study record.
    const response = await postAsUser('recordVocabAttempts', ALICE, [
      [{ wordId: 'et-999', direction: 'en_to_ja', correct: true }],
    ]);
    expect(response.status).toBe(400);
  });

  it('refuses a Day the book does not have, rather than widening it to "all"', async () => {
    await postAsUser('recordVocabAttempts', ALICE, [[answer('et-481', true)]]);

    const response = await postAsUser('resetVocabProgress', ALICE, [99]);
    expect(response.status).toBe(400);

    // And nothing was deleted. A mis-typed Day quietly meaning "everything" is
    // the one place in this feature where being permissive destroys data.
    const progress = (await (
      await postAsUser('getVocabProgress', ALICE, [])
    ).json()) as VocabProgress;
    expect(progress).toHaveLength(1);
  });

  it('keeps the two directions apart', async () => {
    // Recognising a phrase and producing it are different skills, and the second
    // is reliably the weaker one. Folding them together would make
    // 「間違えた問題だけ」 re-ask questions the reader already answers correctly.
    await postAsUser('recordVocabAttempts', ALICE, [
      [
        { wordId: 'et-481', direction: 'en_to_ja', correct: true },
        { wordId: 'et-481', direction: 'ja_to_en', correct: false },
      ],
    ]);

    const progress = (await (
      await postAsUser('getVocabProgress', ALICE, [])
    ).json()) as VocabProgress;

    expect(progress[0].byDirection.en_to_ja.lastCorrect).toBe(true);
    expect(progress[0].byDirection.ja_to_en.lastCorrect).toBe(false);
  });

  it('takes the LAST answer of a run as the most recent, not an arbitrary one', async () => {
    // Every row of one submission shares an `answered_at`: now() is transaction
    // start time. Without the identity column as a tie-break, "the most recent
    // answer" would be whichever row the aggregate happened to visit first -- and
    // 「間違えた問題だけ」 is built entirely on that value.
    await postAsUser('recordVocabAttempts', ALICE, [
      [answer('et-481', false), answer('et-481', true)],
    ]);

    const progress = (await (
      await postAsUser('getVocabProgress', ALICE, [])
    ).json()) as VocabProgress;

    expect(progress[0].byDirection.en_to_ja).toMatchObject({
      attempts: 2,
      correct: 1,
      lastCorrect: true,
    });
  });
});
