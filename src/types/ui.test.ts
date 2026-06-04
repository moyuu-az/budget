import { describe, it, expect } from 'vitest';
import { shiftYearMonth } from './ui';

describe('shiftYearMonth', () => {
  it('shifts forward within the same year', () => {
    expect(shiftYearMonth('2026-03', 1)).toBe('2026-04');
  });

  it('shifts backward within the same year', () => {
    expect(shiftYearMonth('2026-03', -1)).toBe('2026-02');
  });

  it('returns the same month when delta is 0', () => {
    expect(shiftYearMonth('2026-03', 0)).toBe('2026-03');
  });

  it('rolls over the year boundary going forward', () => {
    expect(shiftYearMonth('2026-12', 1)).toBe('2027-01');
  });

  it('rolls over the year boundary going backward', () => {
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12');
  });

  it('handles a multi-month forward jump crossing a year', () => {
    expect(shiftYearMonth('2026-11', 3)).toBe('2027-02');
  });

  it('handles a multi-month backward jump crossing a year', () => {
    expect(shiftYearMonth('2026-02', -4)).toBe('2025-10');
  });

  it('zero-pads single-digit months', () => {
    expect(shiftYearMonth('2026-08', 1)).toBe('2026-09');
  });
});
