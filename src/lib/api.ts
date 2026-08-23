import type { AppApi } from '../types';
import { isErrorEnvelope, decodeEnvelope, type ErrorCode } from '../../shared/errors';

// ---------------------------------------------------------------------------
// The single typed access point to the server.
//
// Stores call getApi().* rather than importing a client, which keeps one seam
// for tests (setApi) and means the transport can change without touching a
// single store. It already has once: this used to reach into window.electronAPI.
// ---------------------------------------------------------------------------

let configured: AppApi | null = null;
let override: AppApi | null = null;

/**
 * Installs the real client. Called once during start-up, before React renders.
 *
 * Kept separate from setApi so a test that calls setApi(null) restores this
 * rather than clearing everything.
 */
export function configureApi(api: AppApi): void {
  configured = api;
}

export function getApi(): AppApi {
  const api = override ?? configured;
  if (!api) {
    // Only reachable if a component renders before bootstrap finished, which
    // would otherwise surface as an unhelpful "cannot read property of null".
    throw new Error('API client has not been configured yet');
  }
  return api;
}

/** Test seam: inject a fake; pass null to restore the configured client. */
export function setApi(fake: AppApi | null): void {
  override = fake;
}

export interface NormalizedError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Recovers the typed error code from whatever the transport threw: the envelope
 * itself, an Error whose message carries the tagged encoding, or an Error with
 * the envelope attached as a property.
 */
export function normalizeError(error: unknown): NormalizedError {
  if (isErrorEnvelope(error)) {
    return { code: error.code, message: error.message, details: error.details };
  }

  const messageProp = (error as { message?: unknown }).message;
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof messageProp === 'string'
          ? messageProp
          : '';
  const decoded = decodeEnvelope(raw);
  if (decoded) {
    return { code: decoded.code, message: decoded.message, details: decoded.details };
  }

  const attached = (error as { envelope?: unknown }).envelope;
  if (isErrorEnvelope(attached)) {
    return { code: attached.code, message: attached.message, details: attached.details };
  }

  return { code: 'UNKNOWN', message: raw || '予期しないエラーが発生しました' };
}
