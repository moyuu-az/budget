import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getIpc, setIpc, normalizeError } from './ipc';
import { encodeEnvelope, type ErrorEnvelope } from '../../shared/errors';
import { createMockElectronAPI } from '../test/mockElectronAPI';
import type { ElectronAPI } from '../types';

describe('normalizeError', () => {
  it('recovers code/message from a real ErrorEnvelope object', () => {
    const envelope: ErrorEnvelope = {
      __appError: true,
      code: 'VALIDATION',
      message: '金額は正の数で入力してください',
      details: { field: 'amount' },
    };

    const result = normalizeError(envelope);

    expect(result.code).toBe('VALIDATION');
    expect(result.message).toBe('金額は正の数で入力してください');
    expect(result.details).toEqual({ field: 'amount' });
  });

  it('decodes an Error whose message is an encoded envelope', () => {
    const envelope: ErrorEnvelope = {
      __appError: true,
      code: 'NOT_FOUND',
      message: 'カテゴリが見つかりません',
      details: { id: 42 },
    };
    const error = new Error(encodeEnvelope(envelope));

    const result = normalizeError(error);

    expect(result.code).toBe('NOT_FOUND');
    expect(result.message).toBe('カテゴリが見つかりません');
    expect(result.details).toEqual({ id: 42 });
  });

  it('decodes an encoded envelope embedded in a remote-prefixed Error message', () => {
    const envelope: ErrorEnvelope = {
      __appError: true,
      code: 'CONFLICT',
      message: 'データが競合しました',
    };
    const error = new Error(
      `Error invoking remote method 'add-category': ${encodeEnvelope(envelope)}`,
    );

    const result = normalizeError(error);

    expect(result.code).toBe('CONFLICT');
    expect(result.message).toBe('データが競合しました');
  });

  it('recovers code/message from an Error with an attached .envelope property', () => {
    const envelope: ErrorEnvelope = {
      __appError: true,
      code: 'PERSISTENCE',
      message: '保存に失敗しました',
      details: { reason: 'disk' },
    };
    const error = new Error('opaque message with no tag') as Error & {
      envelope: ErrorEnvelope;
    };
    error.envelope = envelope;

    const result = normalizeError(error);

    expect(result.code).toBe('PERSISTENCE');
    expect(result.message).toBe('保存に失敗しました');
    expect(result.details).toEqual({ reason: 'disk' });
  });

  it('uses the string message of a plain object falling back to UNKNOWN', () => {
    const result = normalizeError({ message: 'something went sideways' });

    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('something went sideways');
  });

  it('falls back to UNKNOWN with the Electron remote-method prefix stripped for a plain Error', () => {
    const error = new Error(
      "Error invoking remote method 'set-balance': boom in main process",
    );

    const result = normalizeError(error);

    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('boom in main process');
  });

  it('falls back to the JA default message when the raw message is empty', () => {
    const result = normalizeError(new Error(''));

    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('予期しないエラーが発生しました');
  });
});

describe('getIpc / setIpc seam', () => {
  afterEach(() => {
    setIpc(null);
  });

  it('returns window.electronAPI when no override is set', () => {
    expect(getIpc()).toBe(window.electronAPI);
  });

  it('setIpc(fake) makes getIpc() return the fake', () => {
    const fake: ElectronAPI = createMockElectronAPI();

    setIpc(fake);

    expect(getIpc()).toBe(fake);
    expect(getIpc()).not.toBe(window.electronAPI);
  });

  it('setIpc(null) restores window.electronAPI', () => {
    const fake: ElectronAPI = createMockElectronAPI();
    setIpc(fake);

    setIpc(null);

    expect(getIpc()).toBe(window.electronAPI);
  });
});
