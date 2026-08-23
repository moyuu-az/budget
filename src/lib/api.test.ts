import { describe, it, expect, afterEach } from 'vitest';
import { getApi, setApi, configureApi, normalizeError } from './api';
import { encodeEnvelope, type ErrorEnvelope } from '../../shared/errors';
import { createMockApi } from '../test/mock-api';
import type { AppApi } from '../types';

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

  it('decodes an encoded envelope embedded in a longer message', () => {
    const envelope: ErrorEnvelope = {
      __appError: true,
      code: 'CONFLICT',
      message: 'データが競合しました',
    };
    const error = new Error(`request failed: ${encodeEnvelope(envelope)}`);

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

  it('falls back to UNKNOWN carrying the raw message for a plain Error', () => {
    const error = new Error('boom on the server');

    const result = normalizeError(error);

    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('boom on the server');
  });

  it('falls back to the JA default message when the raw message is empty', () => {
    const result = normalizeError(new Error(''));

    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('予期しないエラーが発生しました');
  });
});

describe('getApi / setApi seam', () => {
  afterEach(() => {
    setApi(null);
  });

  it('returns the configured client when no override is set', () => {
    const configured: AppApi = createMockApi();
    configureApi(configured);

    expect(getApi()).toBe(configured);
  });

  it('setApi(fake) makes getApi() return the fake', () => {
    const configured: AppApi = createMockApi();
    configureApi(configured);
    const fake: AppApi = createMockApi();

    setApi(fake);

    expect(getApi()).toBe(fake);
    expect(getApi()).not.toBe(configured);
  });

  it('setApi(null) restores the configured client', () => {
    const configured: AppApi = createMockApi();
    configureApi(configured);
    setApi(createMockApi());

    setApi(null);

    expect(getApi()).toBe(configured);
  });
});
