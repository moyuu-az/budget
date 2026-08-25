import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Hono } from 'hono';
import { startTestDb, resetDb, raw, type TestDb } from '../test/pg';
import { createSessionService } from '../auth/session';
import { createDevVerifier } from '../auth/dev-verifier';
import { createApp, LEDGER_HEADER } from './app';
import { UnauthorizedError } from './errors';
import type { IdentityVerifier, VerifiedIdentity } from '../auth/identity';
import type { ErrorEnvelope } from '../../shared/errors';
import type { Session } from '../../shared/types';

// ---------------------------------------------------------------------------
// The HTTP boundary: authentication, authorisation, and argument validation.
//
// The repository tests prove one ledger's data cannot reach another THROUGH the
// data layer. These prove the same thing one level up, where the ledger is
// chosen by a header the client controls -- which is the only place a caller
// gets to ask for someone else's ledger in the first place.
// ---------------------------------------------------------------------------

const ALICE = 'alice@example.test';
const BOB = 'bob@example.test';
const STRANGER = 'stranger@example.test';

let db: TestDb;
let app: Hono<{ Variables: { session: Session } }>;

/** Identity comes from a header, so a test can be any person it likes. */
function headerVerifier(): IdentityVerifier {
  return {
    async verify(headers) {
      const email = headers.get('x-test-user');
      const sub = headers.get('x-test-sub');
      if (!email) throw new UnauthorizedError('no test identity');
      return { googleSub: sub ?? `sub:${email}`, email } satisfies VerifiedIdentity;
    },
  };
}

interface CallOptions {
  as?: string;
  sub?: string;
  ledgerId?: number;
  args?: unknown[];
  contentType?: string | null;
  fetchSite?: string;
}

async function call(method: string, options: CallOptions = {}): Promise<Response> {
  const headers = new Headers();
  if (options.as) headers.set('x-test-user', options.as);
  if (options.sub) headers.set('x-test-sub', options.sub);
  if (options.ledgerId !== undefined) headers.set(LEDGER_HEADER, String(options.ledgerId));
  if (options.contentType !== null) {
    headers.set('content-type', options.contentType ?? 'application/json');
  }
  if (options.fetchSite) headers.set('sec-fetch-site', options.fetchSite);

  return app.request(`/api/${method}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ args: options.args ?? [] }),
  });
}

async function envelopeOf(response: Response): Promise<ErrorEnvelope> {
  return (await response.json()) as ErrorEnvelope;
}

/** Signs someone in and returns their session. */
async function sessionFor(email: string, sub?: string): Promise<Session> {
  const response = await call('getSession', { as: email, sub });
  expect(response.status).toBe(200);
  return (await response.json()) as Session;
}

const personalLedgerOf = (session: Session): number =>
  session.ledgers.find((ledger) => ledger.kind === 'personal')!.id;
const sharedLedgerOf = (session: Session): number =>
  session.ledgers.find((ledger) => ledger.kind === 'shared')!.id;

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

describe('authentication', () => {
  it('refuses a request with no verified identity', async () => {
    const response = await call('getCategories', { ledgerId: 1 });
    expect(response.status).toBe(401);
    expect((await envelopeOf(response)).code).toBe('UNAUTHORIZED');
  });

  it('provisions an allowed account on first sign-in', async () => {
    const session = await sessionFor(ALICE);

    expect(session.user.email).toBe(ALICE);
    expect(session.user.displayName).toBe('alice');
    // A shared household ledger and a private one of their own.
    expect(session.ledgers.map((l) => l.kind).sort()).toEqual(['personal', 'shared']);
    // The shared ledger sorts first, so the client opens it by default.
    expect(session.ledgers[0].kind).toBe('shared');
  });

  it('refuses an account that is not on the allow list', async () => {
    const response = await call('getSession', { as: STRANGER });
    expect(response.status).toBe(403);
    expect((await envelopeOf(response)).code).toBe('FORBIDDEN');
    expect(await raw(db.adminPool, 'SELECT 1 FROM users')).toHaveLength(0);
  });

  it('gives both members the SAME shared ledger', async () => {
    const alice = await sessionFor(ALICE);
    const bob = await sessionFor(BOB);

    expect(sharedLedgerOf(alice)).toBe(sharedLedgerOf(bob));
    // ...and different private ones.
    expect(personalLedgerOf(alice)).not.toBe(personalLedgerOf(bob));
  });

  it('recognises an established user whose email has changed', async () => {
    // Identity is the Google subject id, not the address. Matching on email
    // would strand someone the day they change their Google account address --
    // they would be treated as a stranger and refused by the allow list.
    const before = await sessionFor(ALICE, 'sub:stable');
    const after = await sessionFor('alice.new@example.test', 'sub:stable');

    expect(after.user.id).toBe(before.user.id);
    expect(after.user.email).toBe('alice.new@example.test');
    expect(after.ledgers.map((l) => l.id).sort()).toEqual(before.ledgers.map((l) => l.id).sort());
    expect(await raw(db.adminPool, 'SELECT 1 FROM users')).toHaveLength(1);
  });

  it('is idempotent across repeated sign-ins', async () => {
    await sessionFor(ALICE);
    const second = await sessionFor(ALICE);

    expect(second.ledgers).toHaveLength(2);
    expect(await raw(db.adminPool, 'SELECT 1 FROM ledgers')).toHaveLength(2);
  });
});

describe('ledger authorisation', () => {
  it('requires the ledger header on a data method', async () => {
    const response = await call('getCategories', { as: ALICE });
    expect(response.status).toBe(400);
    expect((await envelopeOf(response)).code).toBe('VALIDATION');
  });

  it('rejects a malformed ledger header', async () => {
    await sessionFor(ALICE);
    for (const value of ['abc', '0', '-1', '1.5']) {
      const response = await app.request('/api/getCategories', {
        method: 'POST',
        headers: { 'x-test-user': ALICE, 'content-type': 'application/json', [LEDGER_HEADER]: value },
        body: JSON.stringify({ args: [] }),
      });
      expect(response.status, value).toBe(400);
    }
  });

  it("refuses to open another person's private ledger", async () => {
    // THE test this whole design exists for. Alice holds a valid session and
    // simply asks for Bob's ledger id -- the one thing a client can do that the
    // repository layer would never see.
    const bob = await sessionFor(BOB);
    await call('addCategory', {
      as: BOB, ledgerId: personalLedgerOf(bob), args: [{ name: 'bob-only', type: 'expense' }],
    });

    await sessionFor(ALICE);
    const response = await call('getCategories', { as: ALICE, ledgerId: personalLedgerOf(bob) });

    expect(response.status).toBe(403);
    expect((await envelopeOf(response)).code).toBe('FORBIDDEN');
  });

  it('answers the same way for a ledger that does not exist', async () => {
    // Distinguishing "not yours" from "no such ledger" would let a caller probe
    // for which ids exist.
    await sessionFor(ALICE);
    const missing = await call('getCategories', { as: ALICE, ledgerId: 999_999 });
    const bob = await sessionFor(BOB);
    const forbidden = await call('getCategories', { as: ALICE, ledgerId: personalLedgerOf(bob) });

    expect(missing.status).toBe(forbidden.status);
    expect((await envelopeOf(missing)).message).toBe((await envelopeOf(forbidden)).message);
  });

  it('lets both members see the same shared data', async () => {
    const alice = await sessionFor(ALICE);
    const bob = await sessionFor(BOB);
    const shared = sharedLedgerOf(alice);

    await call('addCategory', {
      as: ALICE, ledgerId: shared, args: [{ name: '住居費', type: 'expense' }],
    });
    const response = await call('getCategories', { as: BOB, ledgerId: sharedLedgerOf(bob) });

    expect(((await response.json()) as { name: string }[]).map((c) => c.name)).toEqual(['住居費']);
  });

  it('keeps private ledgers private even for the shared household', async () => {
    const alice = await sessionFor(ALICE);
    await call('addCategory', {
      as: ALICE, ledgerId: personalLedgerOf(alice), args: [{ name: '個人的な出費', type: 'expense' }],
    });

    const shared = await call('getCategories', { as: ALICE, ledgerId: sharedLedgerOf(alice) });
    expect(await shared.json()).toEqual([]);
  });
});

describe('cross-site protection', () => {
  it('rejects a request a browser reports as cross-site', async () => {
    // IAP authenticates with a cookie and injects the assertion itself, so a
    // cross-site POST would arrive fully authenticated. Fetch metadata is the
    // signal that stops it.
    const response = await call('getCategories', { as: ALICE, ledgerId: 1, fetchSite: 'cross-site' });
    expect(response.status).toBe(403);
  });

  it('allows same-origin and direct (non-browser) requests', async () => {
    const alice = await sessionFor(ALICE);
    const sameOrigin = await call('getCategories', {
      as: ALICE, ledgerId: sharedLedgerOf(alice), fetchSite: 'same-origin',
    });
    expect(sameOrigin.status).toBe(200);

    // No Sec-Fetch-Site at all: curl, or an older client. IAP has already
    // established who is calling, so this is not the layer that should refuse.
    const direct = await call('getCategories', { as: ALICE, ledgerId: sharedLedgerOf(alice) });
    expect(direct.status).toBe(200);
  });

  it('requires a JSON content type', async () => {
    const alice = await sessionFor(ALICE);
    const response = await call('getCategories', {
      as: ALICE, ledgerId: sharedLedgerOf(alice), contentType: 'application/x-www-form-urlencoded',
    });
    expect(response.status).toBe(400);
  });
});

describe('argument validation', () => {
  it('rejects a malformed year-month', async () => {
    const alice = await sessionFor(ALICE);
    const response = await call('getMonthlyAmounts', {
      as: ALICE, ledgerId: sharedLedgerOf(alice), args: ['2026-1'],
    });

    expect(response.status).toBe(400);
    expect((await envelopeOf(response)).code).toBe('VALIDATION');
  });

  it('rejects a negative amount', async () => {
    const alice = await sessionFor(ALICE);
    const shared = sharedLedgerOf(alice);
    const created = await call('addTemplate', {
      as: ALICE, ledgerId: shared,
      args: [{ name: 't', dayOfMonth: 1, type: 'expense' }],
    });
    const template = (await created.json()) as { id: number };

    const response = await call('setMonthlyAmount', {
      as: ALICE, ledgerId: shared, args: [template.id, '2026-01', -1],
    });
    expect(response.status).toBe(400);
  });

  it('rejects an id that is not a positive integer', async () => {
    // The IPC version passed ids through unvalidated; over HTTP the body is
    // untrusted, so every argument is checked.
    const alice = await sessionFor(ALICE);
    const response = await call('deleteCategory', {
      as: ALICE, ledgerId: sharedLedgerOf(alice), args: [-5],
    });
    expect(response.status).toBe(400);
  });

  it('rejects args that are not an array', async () => {
    const alice = await sessionFor(ALICE);
    const response = await app.request('/api/getCategories', {
      method: 'POST',
      headers: {
        'x-test-user': ALICE,
        'content-type': 'application/json',
        [LEDGER_HEADER]: String(sharedLedgerOf(alice)),
      },
      body: JSON.stringify({ args: { nope: true } }),
    });
    expect(response.status).toBe(400);
  });

  it('404s an unknown method', async () => {
    const alice = await sessionFor(ALICE);
    const response = await call('dropEverything', { as: ALICE, ledgerId: sharedLedgerOf(alice) });
    expect(response.status).toBe(404);
  });
});

describe('responses', () => {
  it('returns 204 with no body for a method whose contract is void', async () => {
    // Otherwise the client would resolve Promise<void> to a meaningless null.
    const alice = await sessionFor(ALICE);
    const response = await call('updateCategory', {
      as: ALICE, ledgerId: sharedLedgerOf(alice), args: [999_999, { name: 'nothing here' }],
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('maps a database constraint breach to CONFLICT', async () => {
    const alice = await sessionFor(ALICE);
    const bob = await sessionFor(BOB);

    // A category id from Bob's private ledger, used inside the shared one: the
    // composite foreign key rejects it.
    const foreign = await call('addCategory', {
      as: BOB, ledgerId: personalLedgerOf(bob), args: [{ name: 'private', type: 'expense' }],
    });
    const category = (await foreign.json()) as { id: number };

    const response = await call('addTemplate', {
      as: ALICE, ledgerId: sharedLedgerOf(alice),
      args: [{ name: 'leaky', dayOfMonth: 1, type: 'expense', categoryId: category.id }],
    });

    expect(response.status).toBe(409);
    expect((await envelopeOf(response)).code).toBe('CONFLICT');
  });

  it('passes our own message through even when internals are hidden', async () => {
    // Messages the application wrote are meant for the user; only text lifted
    // from a driver is redacted. Classifying by error code alone would suppress
    // 'カテゴリ名は必須です' too.
    const alice = await sessionFor(ALICE);
    const response = await call('addCategory', {
      as: ALICE, ledgerId: sharedLedgerOf(alice), args: [{ name: '', type: 'expense' }],
    });

    expect(response.status).toBe(400);
    const envelope = await envelopeOf(response);
    expect(envelope.code).toBe('VALIDATION');
    expect(envelope.message).toBe('入力値が不正です');
    // Zod issues are the caller's own input echoed back.
    expect(envelope.details).toBeDefined();
  });

  it('answers FORBIDDEN when row-level security refuses a cross-ledger write', async () => {
    // An upsert naming another ledger's template: ON CONFLICT DO UPDATE finds
    // the conflicting row, cannot see it under the USING policy, and raises
    // 42501. That is the isolation layer working, not the server malfunctioning,
    // so it must not surface as a 500.
    const bob = await sessionFor(BOB);
    const bobLedger = personalLedgerOf(bob);
    const template = (await (
      await call('addTemplate', {
        as: BOB, ledgerId: bobLedger, args: [{ name: 'bob', dayOfMonth: 1, type: 'expense' }],
      })
    ).json()) as { id: number };
    await call('setMonthlyAmount', { as: BOB, ledgerId: bobLedger, args: [template.id, '2026-01', 111] });

    const alice = await sessionFor(ALICE);
    const response = await call('setMonthlyAmount', {
      as: ALICE, ledgerId: personalLedgerOf(alice), args: [template.id, '2026-01', 999],
    });

    expect(response.status).toBe(403);
    expect((await envelopeOf(response)).code).toBe('FORBIDDEN');

    // Bob's figure is untouched.
    const amounts = (await (
      await call('getMonthlyAmounts', { as: BOB, ledgerId: bobLedger, args: ['2026-01'] })
    ).json()) as { amount: number }[];
    expect(amounts).toEqual([expect.objectContaining({ amount: 111 })]);
  });

  it('still treats a missing GRANT as a server fault, not a permission answer', async () => {
    // The same SQLSTATE (42501) covers "the role cannot touch this table at
    // all". Nothing the caller did caused that and nothing they can do fixes
    // it, so it must stay a 500 rather than telling them they lack permission.
    const alice = await sessionFor(ALICE);
    const ledgerId = sharedLedgerOf(alice);

    await db.adminPool.query('REVOKE SELECT ON categories FROM app_user');
    try {
      const response = await call('getCategories', { as: ALICE, ledgerId });
      expect(response.status).toBe(500);
      expect((await envelopeOf(response)).code).toBe('PERSISTENCE');
    } finally {
      await db.adminPool.query('GRANT SELECT ON categories TO app_user');
    }
  });

  it('withholds driver error text when internals are not exposed', async () => {
    const production = createApp({
      pool: db.pool,
      verifier: headerVerifier(),
      sessions: createSessionService(db.pool, {
        allowedEmails: [ALICE],
        sharedLedgerName: '家計',
      }),
      exposeInternals: false,
    });

    const session = (await (
      await production.request('/api/getSession', {
        method: 'POST',
        headers: { 'x-test-user': ALICE, 'content-type': 'application/json' },
        body: '{}',
      })
    ).json()) as Session;

    // A value the argument schema accepts (it is a finite number) but
    // NUMERIC(14,2) cannot hold, so the rejection -- and the message -- comes
    // from PostgreSQL rather than from us.
    const response = await production.request('/api/addSnapshot', {
      method: 'POST',
      headers: {
        'x-test-user': ALICE,
        'content-type': 'application/json',
        [LEDGER_HEADER]: String(sharedLedgerOf(session)),
      },
      body: JSON.stringify({ args: ['2026-01-01', 1e30] }),
    });

    const envelope = await envelopeOf(response);
    expect(envelope.code).toBe('VALIDATION');
    // The redacted text, not PostgreSQL's "numeric field overflow ... precision 14".
    expect(envelope.message).toBe('入力値が不正です');
    expect(envelope.details).toBeUndefined();
  });
});

describe('development verifier', () => {
  it('refuses to exist in production', async () => {
    // It accepts a plain header as proof of identity. The guard is at
    // construction, so no caller can forget to check.
    expect(() => createDevVerifier('production')).toThrow(/cannot be used in production/);
  });

  it('reads the email from a header outside production', async () => {
    const verifier = createDevVerifier('development');
    const identity = await verifier.verify(new Headers({ 'x-dev-user-email': ALICE }));
    expect(identity).toEqual({ googleSub: `dev:${ALICE}`, email: ALICE });
  });

  it('still requires that header to be present', async () => {
    const verifier = createDevVerifier('development');
    await expect(verifier.verify(new Headers())).rejects.toThrow(UnauthorizedError);
  });
});

describe('request size', () => {
  it('refuses a body larger than the limit, before parsing it', async () => {
    // Validation cannot be the limit: Zod builds the whole parsed object before
    // any refinement runs, and z.record reconstructs it key by key at roughly
    // 320 bytes each. A body of one-character keys therefore costs ~30x its own
    // size in heap -- enough for one authenticated member to exhaust a default
    // Cloud Run instance. The cap has to be at the door.
    const alice = await sessionFor(ALICE);
    const fields: Record<string, number> = {};
    for (let i = 0; i < 20_000; i += 1) fields[`k${i}`] = 0;

    const response = await call('addAsset', {
      as: ALICE,
      ledgerId: personalLedgerOf(alice),
      args: [{ categoryId: 1, name: 'x', value: 0, fields }],
    });

    expect(response.status).toBe(413);
    expect((await envelopeOf(response)).message).toContain('大きすぎます');
  });

  it('lets an ordinary body through', async () => {
    // The largest legitimate request is an asset category with its twelve
    // parameter definitions -- well under the cap.
    const alice = await sessionFor(ALICE);
    const response = await call('addAssetCategory', {
      as: ALICE,
      ledgerId: personalLedgerOf(alice),
      args: [
        {
          name: 'NISA',
          fields: Array.from({ length: 12 }, (_, i) => ({
            key: `f${i + 1}`,
            label: `パラメータ${i + 1}`,
            type: 'text',
            required: false,
            unit: null,
          })),
        },
      ],
    });

    expect(response.status).toBe(200);
  });
});

describe('bounded names', () => {
  it('refuses a name long enough to slow every other member down', async () => {
    // The columns are TEXT and the list endpoints return every row, so an
    // unbounded name is downloaded by everyone sharing the ledger on each load.
    const alice = await sessionFor(ALICE);
    const response = await call('addCategory', {
      as: ALICE,
      ledgerId: personalLedgerOf(alice),
      args: [{ name: 'あ'.repeat(101), type: 'expense' }],
    });

    expect(response.status).toBe(400);
    expect((await envelopeOf(response)).code).toBe('VALIDATION');
  });

  it('bounds a colour by length, not by notation', async () => {
    // The app only ever writes #rrggbb, but categories imported from the old
    // SQLite database carry whatever they had, and the settings form sends the
    // colour on every save. A strict format check would make such a category
    // permanently uneditable -- a worse outcome than an unusual colour.
    const alice = await sessionFor(ALICE);
    const ledgerId = personalLedgerOf(alice);

    const legacy = await call('addCategory', {
      as: ALICE,
      ledgerId,
      args: [{ name: 'legacy', type: 'expense', color: 'rgb(255, 0, 0)' }],
    });
    expect(legacy.status).toBe(200);

    const oversized = await call('addCategory', {
      as: ALICE,
      ledgerId,
      args: [{ name: 'oversized', type: 'expense', color: '#'.repeat(64) }],
    });
    expect(oversized.status).toBe(400);
  });
});

describe('asset values are whole yen', () => {
  it('refuses a fraction of a yen', async () => {
    // Every screen rounds for display, and figures rounded independently stop
    // adding up: two holdings of 100.5 render as ¥101 + ¥101 beside a total of
    // ¥201. Refusing the input is the only fix that does not require every
    // reader to round the same way forever.
    const alice = await sessionFor(ALICE);
    const ledgerId = personalLedgerOf(alice);
    const category = (await (
      await call('addAssetCategory', { as: ALICE, ledgerId, args: [{ name: '現金' }] })
    ).json()) as { id: number };

    const response = await call('addAsset', {
      as: ALICE,
      ledgerId,
      args: [{ categoryId: category.id, name: '財布', value: 100.5 }],
    });

    expect(response.status).toBe(400);
    expect((await envelopeOf(response)).code).toBe('VALIDATION');
  });

  it('still accepts a negative whole amount', async () => {
    const alice = await sessionFor(ALICE);
    const ledgerId = personalLedgerOf(alice);
    const category = (await (
      await call('addAssetCategory', { as: ALICE, ledgerId, args: [{ name: '住宅ローン' }] })
    ).json()) as { id: number };

    const response = await call('addAsset', {
      as: ALICE,
      ledgerId,
      args: [{ categoryId: category.id, name: '残債', value: -28_000_000 }],
    });

    expect(response.status).toBe(200);
  });
});
