import { ZodError } from 'zod';
import type { ErrorCode, ErrorEnvelope } from '../../shared/errors';
import { encodeEnvelope } from '../../shared/errors';

// ---------------------------------------------------------------------------
// Server-side error taxonomy.
//
// These classes exist so handlers can `throw new ConflictError(...)`; they never
// travel over the wire as classes. toEnvelope() flattens them into the plain
// ErrorEnvelope the client knows how to read.
// ---------------------------------------------------------------------------

export interface AppErrorOptions {
  details?: unknown;
  /**
   * Whether `message` was written FOR the caller.
   *
   * Classification by error code is not enough. A VALIDATION can be either
   * 'カテゴリ名は必須です', which the user should read, or PostgreSQL's
   * 'numeric field overflow ... precision 14, scale 2', which quotes the schema
   * and helps nobody. What decides is where the text came from, so that is what
   * is recorded -- at construction, where it is actually known.
   */
  safeMessage?: boolean;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly safeMessage: boolean;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = options.details;
    // Errors raised inside the application default to safe; the one place that
    // lifts text from a driver opts out explicitly.
    this.safeMessage = options.safeMessage ?? true;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION', message, { details });
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super('NOT_FOUND', message);
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

export class UnauthorizedError extends AppError {
  constructor(message = 'サインインが必要です') {
    super('UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'この操作を行う権限がありません') {
    super('FORBIDDEN', message);
  }
}

// ---------------------------------------------------------------------------
// PostgreSQL SQLSTATE classification.
//
// Codes are from https://www.postgresql.org/docs/16/errcodes-appendix.html.
// Only the ones this schema can actually produce are named; everything else
// falls through to PERSISTENCE, which is the honest answer for "the database
// said no and we do not have a better word for it".
// ---------------------------------------------------------------------------

const SQLSTATE: Record<string, ErrorCode> = {
  '23502': 'CONFLICT', // not_null_violation
  '23503': 'CONFLICT', // foreign_key_violation -- e.g. a category from another ledger
  '23505': 'CONFLICT', // unique_violation
  '23514': 'VALIDATION', // check_violation -- a value-domain breach such as amount < 0
  '22003': 'VALIDATION', // numeric_value_out_of_range
  '22P02': 'VALIDATION', // invalid_text_representation
};

/**
 * insufficient_privilege. Two very different things arrive under this one code,
 * and they need opposite answers.
 *
 *  - A ROW-LEVEL SECURITY refusal: the statement tried to reach a row outside
 *    the current ledger. The commonest way to provoke it is an upsert naming
 *    another ledger's template -- `ON CONFLICT DO UPDATE` finds the conflicting
 *    row, cannot see it under the USING policy, and raises
 *    'new row violates row-level security policy'. That is the second isolation
 *    layer working, and the honest answer to the caller is FORBIDDEN.
 *
 *  - A missing GRANT: the connecting role cannot touch the table at all. Nothing
 *    the caller did caused it and nothing they can do will fix it, so it stays a
 *    500.
 *
 * PostgreSQL only distinguishes them in the message text, so that is what is
 * matched. Both are logged either way.
 *
 * (A cross-ledger id usually trips the composite foreign key first and surfaces
 * as CONFLICT instead. Which of the two fires depends on whether a conflicting
 * row already exists -- both are 4xx with a message that fits, so the difference
 * does not reach the user as anything meaningful.)
 */
const INSUFFICIENT_PRIVILEGE = '42501';
const RLS_MESSAGE = /row-level security/i;

export function mapUnknownToAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return new ValidationError('入力値が不正です', error.issues);
  }

  const code = (error as { code?: unknown }).code;
  const message = error instanceof Error ? error.message : String(error);

  if (typeof code === 'string') {
    // Everything below carries the DRIVER's message, so none of it is safe to
    // show: PostgreSQL names constraints, columns and precisions.
    const fromDriver = (mapped: ErrorCode): AppError =>
      new AppError(mapped, message || 'データベースエラーが発生しました', {
        safeMessage: false,
      });

    if (code === INSUFFICIENT_PRIVILEGE) {
      return RLS_MESSAGE.test(message)
        ? // Our own wording: the caller reached outside their ledger.
          new ForbiddenError('この家計簿では操作できない対象です')
        : fromDriver('PERSISTENCE');
    }
    const mapped = SQLSTATE[code];
    if (mapped) return fromDriver(mapped);
    // Class 08 (connection), 53 (insufficient resources), 57 (operator
    // intervention), 40 (transaction rollback) and friends are all "the database
    // could not do it" rather than "you asked for something wrong".
    if (/^(08|22|23|25|40|42|53|55|57|58)/.test(code)) {
      return fromDriver('PERSISTENCE');
    }
  }

  // An unrecognised throw could be anything -- a stack trace, a file path.
  return new AppError('UNKNOWN', message || '予期しないエラーが発生しました', {
    safeMessage: false,
  });
}

/** Only JSON-serialisable details can travel over the wire; drop anything else. */
function jsonSerialisable(details: unknown): unknown {
  if (details === undefined) return undefined;
  try {
    JSON.stringify(details);
    return details;
  } catch {
    return undefined;
  }
}

/**
 * Stand-in text for a message that was not written for the caller.
 *
 * The original still reaches the server log; what is withheld is the copy that
 * would otherwise travel to the browser and sit in its network tab.
 */
const REDACTED: Record<ErrorCode, string> = {
  VALIDATION: '入力値が不正です',
  NOT_FOUND: '対象が見つかりませんでした',
  CONFLICT: 'データの整合性に違反しました',
  PERSISTENCE: 'データの保存に失敗しました',
  UNAUTHORIZED: 'サインインが必要です',
  FORBIDDEN: 'この操作を行う権限がありません',
  UNKNOWN: '予期しないエラーが発生しました',
};

export interface EnvelopeOptions {
  /** When false, internal messages and details are stripped. */
  exposeInternals: boolean;
}

export function toEnvelope(error: AppError, { exposeInternals }: EnvelopeOptions): ErrorEnvelope {
  const safe = exposeInternals || error.safeMessage;
  return {
    __appError: true,
    code: error.code,
    message: safe ? error.message : REDACTED[error.code],
    // Zod issues are the caller's own input echoed back. Anything attached to an
    // unsafe error is internal and stays on the server.
    details: safe ? jsonSerialisable(error.details) : undefined,
  };
}

/** HTTP status for a code. The client reads the envelope, but proxies and logs read this. */
export function statusFor(code: ErrorCode): number {
  switch (code) {
    case 'VALIDATION':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    default:
      return 500;
  }
}

/**
 * Wraps an envelope in an Error for the client to throw.
 *
 * The envelope is attached as a property AND encoded into the message, because
 * the client's normalizeError accepts either and different transports preserve
 * different things.
 */
export function toThrowable(envelope: ErrorEnvelope): Error & { envelope: ErrorEnvelope } {
  const throwable = new Error(encodeEnvelope(envelope)) as Error & { envelope: ErrorEnvelope };
  throwable.envelope = envelope;
  return throwable;
}
