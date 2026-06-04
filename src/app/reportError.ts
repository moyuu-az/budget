import { useToastStore } from '../stores/useToastStore';
import { normalizeError, type NormalizedError } from '../lib/ipc';
import type { ErrorCode } from '../../shared/errors';

const GENERIC_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION: '入力内容を確認してください',
  NOT_FOUND: '対象が見つかりませんでした',
  CONFLICT: 'データが競合しました。再度お試しください',
  PERSISTENCE: 'データの保存に失敗しました',
  UNKNOWN: '予期しないエラーが発生しました',
};

// The single renderer-side error choke point: normalize the cross-process error into a
// typed code, surface one user-facing JA toast, and return the normalized error so callers
// can still branch (e.g. VALIDATION -> inline field error). Validation messages come from
// our own Zod schemas and are already user-meaningful, so they pass through verbatim.
export function reportError(error: unknown): NormalizedError {
  const normalized = normalizeError(error);
  const message =
    normalized.code === 'VALIDATION' && normalized.message
      ? normalized.message
      : GENERIC_MESSAGES[normalized.code];
  useToastStore.getState().addToast(message, 'error');
  return normalized;
}
