import { describe, it, expect } from 'vitest';
import { formatWithCommas, parseCommaNumber, handleCurrencyInput } from './currency';

describe('formatWithCommas', () => {
  it('formats a positive integer with thousands separators', () => {
    expect(formatWithCommas(1000000)).toBe('1,000,000');
  });

  it('returns zero unchanged', () => {
    expect(formatWithCommas(0)).toBe('0');
  });

  it('leaves numbers under 1000 without commas', () => {
    expect(formatWithCommas(999)).toBe('999');
  });

  it('formats a large number', () => {
    expect(formatWithCommas(1234567890)).toBe('1,234,567,890');
  });

  it('preserves the decimal portion while grouping the integer part', () => {
    expect(formatWithCommas('1234567.89')).toBe('1,234,567.89');
  });

  it('strips existing commas from a string before reformatting', () => {
    expect(formatWithCommas('1,000,000')).toBe('1,000,000');
  });

  it('handles a negative number sign without grouping it', () => {
    expect(formatWithCommas(-12345)).toBe('-12,345');
  });
});

describe('parseCommaNumber', () => {
  it('parses a comma-formatted string to a number', () => {
    expect(parseCommaNumber('1,000,000')).toBe(1000000);
  });

  it('returns 0 for an empty string', () => {
    expect(parseCommaNumber('')).toBe(0);
  });

  it('returns 0 for a non-numeric string', () => {
    expect(parseCommaNumber('abc')).toBe(0);
  });

  it('parses a plain numeric string', () => {
    expect(parseCommaNumber('42')).toBe(42);
  });

  it('parses a decimal value', () => {
    expect(parseCommaNumber('1,234.5')).toBe(1234.5);
  });
});

describe('handleCurrencyInput', () => {
  it('returns an empty string when there are no digits', () => {
    expect(handleCurrencyInput('')).toBe('');
    expect(handleCurrencyInput('abc')).toBe('');
  });

  it('strips non-digits and formats with commas', () => {
    expect(handleCurrencyInput('1000000')).toBe('1,000,000');
  });

  it('ignores existing commas and currency symbols', () => {
    expect(handleCurrencyInput('¥1,234,567')).toBe('1,234,567');
  });

  it('drops a decimal point because only digits are kept', () => {
    expect(handleCurrencyInput('1234.56')).toBe('123,456');
  });
});
