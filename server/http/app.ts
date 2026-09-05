import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Pool } from '../db/pool';
import type { IdentityVerifier } from '../auth/identity';
import type { SessionService } from '../auth/session';
import { withLedgerRepositories, withUserRepositories } from '../repositories';
import {
  LEDGER_METHODS,
  USER_METHODS,
  isDataMethod,
  isUserMethod,
  type LedgerMethod,
  type UserMethod,
} from './api';
import {
  AppError,
  ForbiddenError,
  StaleClientError,
  UnauthorizedError,
  ValidationError,
  mapUnknownToAppError,
  statusFor,
  toEnvelope,
} from './errors';
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER } from '../../shared/contract-version';
import type { Session } from '../../shared/types';

export interface AppDependencies {
  pool: Pool;
  verifier: IdentityVerifier;
  sessions: SessionService;
  /** When true, internal error messages reach the client. Development only. */
  exposeInternals: boolean;
  /** Called for every failed request. Separated so tests can assert on it. */
  logError?(context: { method: string; error: AppError }): void;
}

/** Header naming the ledger a data request applies to. */
export const LEDGER_HEADER = 'x-ledger-id';

/**
 * Largest request body any method may send.
 *
 * The biggest legitimate body in this API is an asset category carrying its
 * twelve parameter definitions -- comfortably under 2 KB. 64 KB leaves room to
 * grow while removing a whole class of problem:
 *
 *   Validation cannot be the limit. Zod builds the parsed object before any
 *   refinement runs, and `z.record` reconstructs it key by key at roughly 320
 *   bytes each -- a measured ~30x amplification. A 15 MB body of single-character
 *   keys peaks around 440 MB, which is more than a default Cloud Run instance
 *   has. The caller is authenticated by then (IAP, the allowlist and ledger
 *   membership are all checked before the body is read), so this is not an
 *   anonymous attack -- but "a signed-in member can restart the service" is not
 *   a property worth keeping.
 *
 * Enforced here, at the door, for every method at once: one number instead of a
 * cap on each field of each schema, which is the version that would rot.
 */
const MAX_BODY_BYTES = 64 * 1024;

type Variables = { session: Session };

/**
 * Rejects requests that a browser tells us came from another site.
 *
 * IAP authenticates with a cookie and injects the assertion header itself, so a
 * cross-site POST WOULD arrive fully authenticated -- the classic CSRF setup.
 * Two things stop it:
 *
 *  - Every request is JSON with a custom header, which forces a CORS preflight
 *    that this server answers for nobody.
 *  - Fetch metadata, checked here, which browsers send and cannot be forged by
 *    page script.
 *
 * Requests without the header (curl, older clients) are allowed through: it is a
 * browser-only signal, and IAP has already established who is calling.
 */
function assertSameSite(fetchSite: string | undefined): void {
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    throw new ForbiddenError('クロスサイトからのリクエストは受け付けません');
  }
}

/**
 * Refuses a caller whose bundle was built against a different wire contract.
 *
 * A deploy replaces the server under tabs that are still open. Until migration
 * 005 every change had been additive and an old tab simply ignored what it did
 * not know about; replacing `EntryTemplate.dayOfMonth` with `recurrence` ended
 * that. An old build reading a new response finds no `dayOfMonth`, drops EVERY
 * planned entry from its forecast, and draws a flat balance line -- wrong, in
 * the reassuring direction, with nothing on screen to say so.
 *
 * A MISSING HEADER IS A MISMATCH, not a pass. Every build that knows about this
 * gate sends it; a request without one is by definition from a build that
 * predates it, which is exactly the case this exists for. (Non-browser callers
 * do not exist here -- there is no public API, only the bundle this server
 * serves.)
 *
 * Checked BEFORE authentication so an old tab gets the reload prompt rather than
 * an auth error it would report as something else entirely.
 */
function assertContractVersion(header: string | undefined): void {
  if (header !== String(CONTRACT_VERSION)) {
    throw new StaleClientError();
  }
}

/** Body shape for every data method: the argument list, verbatim. */
interface RequestBody {
  args?: unknown;
}

async function readArgs(request: Request): Promise<unknown[]> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    // Also the first half of the CSRF defence: a cross-origin form POST cannot
    // set this content type without triggering a preflight.
    throw new ValidationError('Content-Type: application/json が必要です');
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    throw new ValidationError('リクエストボディが JSON として解釈できません');
  }

  const args = body.args ?? [];
  if (!Array.isArray(args)) {
    throw new ValidationError('args は配列である必要があります');
  }
  return args;
}

/**
 * Resolves which ledger the request applies to, and proves the caller may open
 * it.
 *
 * The session's ledger list IS the authorization list -- it was built from
 * ledger_members for this user -- so the check is a membership test against data
 * the server produced, never against anything the client sent.
 */
function resolveLedgerId(session: Session, header: string | undefined): number {
  if (!header) {
    throw new ValidationError(`${LEDGER_HEADER} ヘッダが必要です`);
  }

  const ledgerId = Number(header);
  if (!Number.isInteger(ledgerId) || ledgerId <= 0) {
    throw new ValidationError(`${LEDGER_HEADER} が不正です`);
  }

  if (!session.ledgers.some((ledger) => ledger.id === ledgerId)) {
    // Deliberately does not distinguish "no such ledger" from "not yours":
    // telling the caller which one it is confirms the ledger exists.
    throw new ForbiddenError('この家計簿を開く権限がありません');
  }

  return ledgerId;
}

export function createApp(deps: AppDependencies): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();

  // Liveness only: no authentication, no database. Cloud Run's health checks
  // must not depend on IAP or on the database being reachable.
  app.get('/healthz', (c) => c.text('ok'));

  // Registered before the authentication middleware on purpose: an oversized
  // body is refused without reading it and without verifying anything. 413 is
  // the honest status; the envelope keeps the client's error handling uniform.
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        c.json(
          {
            __appError: true,
            code: 'VALIDATION',
            message: 'リクエストが大きすぎます',
          },
          413,
        ),
    }),
  );

  // Stamps EVERY /api response, successes and errors alike, with the contract
  // this build speaks.
  //
  // The request-side gate only catches an old CLIENT. This catches the other
  // direction -- a new bundle talking to an older revision after a rollback or
  // during a traffic split. That server cannot refuse the request (it predates
  // the gate), so the client has to be able to refuse the ANSWER, and it can
  // only do that if a current server says so explicitly. A missing stamp is how
  // an old server identifies itself.
  //
  // Registered before the authentication middleware so even a 401 carries it:
  // an old server's 401 and a current one's must be distinguishable, or a new
  // tab would report "sign in again" for what is really a version skew.
  app.use('/api/*', async (c, next) => {
    await next();
    c.header(CONTRACT_VERSION_HEADER, String(CONTRACT_VERSION));
  });

  // Everything under /api is authenticated. The session is resolved once per
  // request and reused by the handler.
  app.use('/api/*', async (c, next) => {
    // Before anything else that could fail for a different reason: a tab running
    // an old bundle must be told to reload, not told its session is bad.
    assertContractVersion(c.req.header(CONTRACT_VERSION_HEADER));
    assertSameSite(c.req.header('sec-fetch-site'));
    const identity = await deps.verifier.verify(c.req.raw.headers);
    c.set('session', await deps.sessions.resolve(identity));
    await next();
  });

  // The route is the method name, exactly like the data methods -- which is what
  // lets the browser client be one generic call with no per-method wrappers.
  // Registered before /api/:method so the literal path wins the match; getSession
  // is not in METHODS, so the generic route would 404 it.
  app.post('/api/getSession', (c) => c.json(c.get('session')));

  app.post('/api/:method', async (c) => {
    const name = c.req.param('method');
    if (!isDataMethod(name)) {
      // The name is NOT echoed back. It is a caller-controlled string, and the
      // only reader of this message is a user whose tab is running an older
      // build -- 「未知のメソッド: getBalance」 tells them nothing they can act
      // on while putting attacker-chosen text into the response body.
      return c.json({ __appError: true, code: 'NOT_FOUND', message: '未知のメソッドです' }, 404);
    }

    const session = c.get('session');
    const rawArgs = await readArgs(c.req.raw);

    // The spec's schema and handler are both derived from AppApi, so this cast
    // only re-associates the two halves that the lookup by string erased.
    type ErasedSpec = {
      args: { parse(value: unknown): unknown[] };
      handle(repos: never, args: never): Promise<unknown>;
    };

    // WHICH TENANT THIS REQUEST IS ABOUT IS DECIDED BY WHICH TABLE HOLDS IT.
    //
    // Not by a flag on the request, and not by the shape of the name. A method
    // in USER_METHODS is answered from the signed-in person's own scope; one in
    // LEDGER_METHODS needs a household chosen first, and `resolveLedgerId`
    // refuses the request when the header names one this session may not open.
    //
    // THE LEDGER HEADER IS IGNORED FOR USER-SCOPED METHODS, on purpose. The
    // browser client sets it on every request once a ledger is active (it is one
    // header for the whole client, not per call), so requiring it here would
    // couple the study record to a ledger having been picked -- and honouring it
    // would suggest the record differs per household, which is precisely what
    // this scope exists to deny.
    let result: unknown;
    if (isUserMethod(name)) {
      const spec = USER_METHODS[name as UserMethod] as unknown as ErasedSpec;
      const args = spec.args.parse(rawArgs);
      // The user id comes from the SESSION -- resolved from the IAP assertion
      // before this handler ran -- never from anything the caller sent.
      result = await withUserRepositories(deps.pool, session.user.id, (repos) =>
        spec.handle(repos as never, args as never),
      );
    } else {
      const ledgerId = resolveLedgerId(session, c.req.header(LEDGER_HEADER));
      const spec = LEDGER_METHODS[name as LedgerMethod] as unknown as ErasedSpec;
      const args = spec.args.parse(rawArgs);
      result = await withLedgerRepositories(deps.pool, ledgerId, (repos) =>
        spec.handle(repos as never, args as never),
      );
    }

    // Repository methods that return void produce no body rather than `null`,
    // which keeps the client's `Promise<void>` honest.
    return result === undefined ? c.body(null, 204) : c.json(result as object);
  });

  app.onError((error, c) => {
    const appError = mapUnknownToAppError(error);
    deps.logError?.({ method: c.req.path, error: appError });
    const envelope = toEnvelope(appError, { exposeInternals: deps.exposeInternals });
    return c.json(envelope, statusFor(appError.code) as 400);
  });

  return app;
}

export { UnauthorizedError };
