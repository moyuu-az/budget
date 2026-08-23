// The single client <-> server error wire format. The server never sends a raw
// Error: it sends a PLAIN tagged object (an ErrorEnvelope) so the client can
// recover a typed code rather than string-matching a message. The client detects
// it via isErrorEnvelope and maps the code to a user-facing message.

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PERSISTENCE'
  // The caller is not signed in, or the sign-in could not be verified.
  | 'UNAUTHORIZED'
  // The caller is signed in but may not touch what they asked for -- in practice,
  // naming a ledger they are not a member of.
  | 'FORBIDDEN'
  | 'UNKNOWN';

export interface ErrorEnvelope {
  __appError: true;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __appError?: unknown }).__appError === true &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

// The envelope is also encoded as tagged JSON inside an Error's message. Over HTTP the
// body carries the envelope directly, but a fetch client still has to throw *something*,
// and a thrown Error is the one shape every caller already handles. Encoding the envelope
// into the message means the code survives even where a custom property would not.
export const ENVELOPE_TAG = '@@APP_ERROR@@';

export function encodeEnvelope(envelope: ErrorEnvelope): string {
  return ENVELOPE_TAG + JSON.stringify(envelope);
}

export function decodeEnvelope(message: string): ErrorEnvelope | null {
  const index = message.indexOf(ENVELOPE_TAG);
  if (index < 0) return null;
  try {
    const parsed: unknown = JSON.parse(message.slice(index + ENVELOPE_TAG.length));
    return isErrorEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
