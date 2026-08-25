import type { AppApi } from '../types';
import { isErrorEnvelope, type ErrorEnvelope } from '../../shared/errors';
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER } from '../../shared/contract-version';

// ---------------------------------------------------------------------------
// The browser client.
//
// Every method on AppApi maps to POST /api/<methodName> with the argument list
// as the body. Because the route IS the method name, the whole client is one
// generic call plus a Proxy -- there is no per-method wrapper to keep in step
// with the contract, and no table of route names that can drift from it.
//
// Which ledger a call applies to is NOT an argument. It travels in the
// X-Ledger-Id header, read fresh from `activeLedgerId()` on every call, so
// switching ledgers is a single piece of client state rather than a change to
// 25 call sites.
// ---------------------------------------------------------------------------

/** Header naming the ledger a request applies to. Mirrors LEDGER_HEADER on the server. */
const LEDGER_HEADER = 'X-Ledger-Id';

export interface HttpApiOptions {
  /**
   * The ledger for the next request, or null before one has been chosen.
   *
   * A function rather than a value: the client is created once at start-up, but
   * the active ledger changes whenever the user switches.
   */
  activeLedgerId(): number | null;
  /** Overridable for tests; defaults to the page's own origin. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Turns an error response into something normalizeError can read. */
function toThrowable(body: unknown, status: number): Error {
  const envelope: ErrorEnvelope = isErrorEnvelope(body)
    ? body
    : {
        __appError: true,
        // A response that is not an envelope did not come from the application:
        // an IAP sign-in redirect, a proxy error page, a dropped connection.
        code: status === 401 || status === 403 ? 'UNAUTHORIZED' : 'UNKNOWN',
        message: `サーバーエラー (HTTP ${status})`,
      };
  const error = new Error(envelope.message) as Error & { envelope: ErrorEnvelope };
  error.envelope = envelope;
  return error;
}

export function createHttpApi(options: HttpApiOptions): AppApi {
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl ?? '';

  async function call(method: string, args: unknown[]): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // Which wire contract this bundle was built against. A server that has
      // moved on refuses rather than answering with data this build would
      // misread -- see shared/contract-version.ts for why silence is the danger.
      [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION),
    };

    // getSession runs before any ledger is known, and the server does not
    // require the header for it.
    const ledgerId = options.activeLedgerId();
    if (ledgerId !== null) headers[LEDGER_HEADER] = String(ledgerId);

    const response = await doFetch(`${baseUrl}/api/${method}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ args }),
      // IAP authenticates with a cookie, so it has to be sent.
      credentials: 'same-origin',
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      throw toThrowable(body, response.status);
    }

    // 204 for the methods whose contract is Promise<void>, which keeps them from
    // resolving to a meaningless null.
    if (response.status === 204) return undefined;
    return (await response.json()) as unknown;
  }

  return new Proxy({} as AppApi, {
    get(_target, property) {
      // A Proxy answers for EVERY property, including ones the runtime probes
      // on its own. `then` is the dangerous one: without this guard, awaiting
      // the client would find a function there and treat it as a thenable,
      // hanging forever.
      if (typeof property !== 'string' || property === 'then') return undefined;
      return (...args: unknown[]) => call(property, args);
    },
  });
}
