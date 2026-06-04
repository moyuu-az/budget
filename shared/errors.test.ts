import { describe, it, expect } from 'vitest';
import { isErrorEnvelope, encodeEnvelope, decodeEnvelope, type ErrorEnvelope } from './errors';

const env: ErrorEnvelope = { __appError: true, code: 'VALIDATION', message: '入力が不正', details: [{ path: ['name'] }] };

describe('isErrorEnvelope', () => {
  it('accepts a valid envelope', () => {
    expect(isErrorEnvelope(env)).toBe(true);
  });
  it('rejects non-envelopes', () => {
    expect(isErrorEnvelope(null)).toBe(false);
    expect(isErrorEnvelope({ code: 'X', message: 'y' })).toBe(false);
    expect(isErrorEnvelope(new Error('boom'))).toBe(false);
    expect(isErrorEnvelope('str')).toBe(false);
  });
});

describe('encode/decode round-trip', () => {
  it('round-trips an envelope through a string', () => {
    const decoded = decodeEnvelope(encodeEnvelope(env));
    expect(decoded).not.toBeNull();
    expect(decoded?.code).toBe('VALIDATION');
    expect(decoded?.message).toBe('入力が不正');
  });

  it('decodes even when Electron prefixes the message', () => {
    const prefixed = "Error invoking remote method 'add-category': " + encodeEnvelope(env);
    expect(decodeEnvelope(prefixed)?.code).toBe('VALIDATION');
  });

  it('returns null for a plain message', () => {
    expect(decodeEnvelope('just a normal error')).toBeNull();
  });

  it('returns null for malformed tagged json', () => {
    expect(decodeEnvelope('@@APP_ERROR@@{not json')).toBeNull();
  });
});
