import { useToastStore } from '../stores/useToastStore';
import { normalizeError, type NormalizedError } from '../lib/api';
import { useStaleClientStore } from './staleClient';
import type { ErrorCode } from '../../shared/errors';

const GENERIC_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION: '入力内容を確認してください',
  NOT_FOUND: '対象が見つかりませんでした',
  CONFLICT: 'データが競合しました。再度お試しください',
  PERSISTENCE: 'データの保存に失敗しました',
  UNAUTHORIZED: 'サインインが必要です。ページを再読み込みしてください',
  FORBIDDEN: 'この家計簿を開く権限がありません',
  STALE_CLIENT: 'アプリが更新されました。ページを再読み込みしてください',
  UNKNOWN: '予期しないエラーが発生しました',
};

// The single renderer-side error choke point: normalize the cross-process error into a
// typed code, surface one user-facing JA toast, and return the normalized error so callers
// can still branch (e.g. VALIDATION -> inline field error). Validation messages come from
// our own Zod schemas and are already user-meaningful, so they pass through verbatim.
export function reportError(error: unknown): NormalizedError {
  const normalized = normalizeError(error);

  // STALE_CLIENT is not a failure the user can retry past: every request from
  // this bundle will be refused the same way. A toast would disappear and be
  // replaced by the next one while the tab stayed unusable, so it is latched
  // instead and the shell shows a reload prompt. Handled HERE because this is
  // the one place every error passes through -- the refusal can arrive from a
  // background refetch nobody is watching.
  if (normalized.code === 'STALE_CLIENT') {
    useStaleClientStore.getState().markStale();
    return normalized;
  }

  const message =
    normalized.code === 'VALIDATION' && normalized.message
      ? normalized.message
      : GENERIC_MESSAGES[normalized.code];
  useToastStore.getState().addToast(message, 'error');
  return normalized;
}
