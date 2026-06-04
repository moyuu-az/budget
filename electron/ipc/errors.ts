import { ZodError } from 'zod';
import type { ErrorCode, ErrorEnvelope } from '../../shared/errors';
import { encodeEnvelope } from '../../shared/errors';

// Main-side error taxonomy. These exist purely for ergonomic `throw new ConflictError(...)`
// inside handlers/repos; they NEVER cross IPC as classes — toEnvelope() flattens them to a
// structured-clonable ErrorEnvelope that survives Electron's serialization.
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION', message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message);
  }
}

export class PersistenceError extends AppError {
  constructor(message: string) {
    super('PERSISTENCE', message);
  }
}

// Classify any thrown value into an AppError with a stable code.
export function mapUnknownToAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return new ValidationError('入力値が不正です', error.issues);
  }

  const code = (error as { code?: unknown }).code;
  const message = error instanceof Error ? error.message : String(error);

  if (code === 'SQLITE_CONSTRAINT_CHECK') {
    // A value-domain violation (e.g. amount < 0) — surface as validation.
    return new ValidationError(message || 'データ制約に違反しました');
  }
  if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) {
    // UNIQUE / FOREIGN KEY / NOT NULL violations.
    return new ConflictError(message || 'データの整合性に違反しました');
  }
  if (typeof code === 'string' && code.startsWith('SQLITE_')) {
    return new PersistenceError(message || 'データベースエラーが発生しました');
  }

  return new AppError('UNKNOWN', message || '予期しないエラーが発生しました');
}

// Only JSON-clonable details survive structured clone; drop anything else.
function jsonClonable(details: unknown): unknown {
  if (details === undefined) return undefined;
  try {
    JSON.stringify(details);
    return details;
  } catch {
    return undefined;
  }
}

export function toEnvelope(error: AppError): ErrorEnvelope {
  return {
    __appError: true,
    code: error.code,
    message: error.message,
    details: jsonClonable(error.details),
  };
}

// Wrap the envelope in an Error so it propagates across ipcMain.handle. The envelope is
// tagged-JSON-encoded into the message (the only field Electron reliably serializes); the
// renderer's normalizeError decodes it. The full envelope is also attached as `envelope`
// for the case where Electron does preserve own properties.
export function toThrowable(error: AppError): Error {
  const envelope = toEnvelope(error);
  const throwable = new Error(encodeEnvelope(envelope)) as Error & { envelope: ErrorEnvelope };
  throwable.envelope = envelope;
  return throwable;
}
