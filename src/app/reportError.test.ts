import { describe, it, expect, beforeEach } from 'vitest';
import { reportError } from './reportError';
import { useToastStore } from '../stores/useToastStore';
import { type ErrorEnvelope } from '../../shared/errors';

const resetToasts = (): void => {
  useToastStore.setState({ toasts: [], queue: [] });
};

describe('reportError', () => {
  beforeEach(() => {
    resetToasts();
  });

  it('emits exactly one error toast and returns the normalized error', () => {
    const envelope: ErrorEnvelope = {
      __appError: true,
      code: 'PERSISTENCE',
      message: 'main-process detail',
    };

    const normalized = reportError(envelope);

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('error');
    expect(normalized).toEqual({
      code: 'PERSISTENCE',
      message: 'main-process detail',
      details: undefined,
    });
  });

  it('shows the specific message for a VALIDATION envelope', () => {
    const envelope: ErrorEnvelope = {
      __appError: true,
      code: 'VALIDATION',
      message: '金額は正の数で入力してください',
    };

    const normalized = reportError(envelope);

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('金額は正の数で入力してください');
    expect(toasts[0].type).toBe('error');
    expect(normalized.code).toBe('VALIDATION');
    expect(normalized.message).toBe('金額は正の数で入力してください');
  });

  it('shows the generic JA message for a non-VALIDATION code, ignoring the raw message', () => {
    const envelope: ErrorEnvelope = {
      __appError: true,
      code: 'NOT_FOUND',
      message: 'row 42 missing in table snapshots',
    };

    const normalized = reportError(envelope);

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('対象が見つかりませんでした');
    expect(normalized.code).toBe('NOT_FOUND');
    expect(normalized.message).toBe('row 42 missing in table snapshots');
  });

  it('shows the generic UNKNOWN JA message for an unrecognized error', () => {
    const normalized = reportError(new Error('totally opaque failure'));

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('予期しないエラーが発生しました');
    expect(toasts[0].type).toBe('error');
    expect(normalized.code).toBe('UNKNOWN');
    expect(normalized.message).toBe('totally opaque failure');
  });

  it('falls back to the generic VALIDATION message when the envelope message is empty', () => {
    const envelope: ErrorEnvelope = {
      __appError: true,
      code: 'VALIDATION',
      message: '',
    };

    reportError(envelope);

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('入力内容を確認してください');
  });
});
