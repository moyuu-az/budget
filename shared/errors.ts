// The single cross-process error wire format. Electron's structured-clone IPC
// strips Error subclass identity, so the main process throws a PLAIN tagged object
// (an ErrorEnvelope) which survives serialization intact. The renderer detects it
// via isErrorEnvelope and maps the code to a user-facing message.

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PERSISTENCE'
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

// Electron IPC strips thrown Error subclass identity, and whether it preserves a thrown
// plain object's own properties is version-dependent. The ONE thing it always preserves is
// Error.message — so we encode the envelope as tagged JSON inside the message. The renderer
// decodes it back, recovering the precise error code regardless of Electron's serialization.
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
