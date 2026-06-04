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
