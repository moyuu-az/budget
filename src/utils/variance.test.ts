import { describe, it, expect } from 'vitest';
import { previousMonth, summarizeVariance } from './variance';
import { makeTemplate, monthlyOn, yearlyOn } from '../test/factories';
import type { Category, MonthlyActualsMap, MonthlyAmountsMap } from '../types';

// ---------------------------------------------------------------------------
// The load-bearing decision in this module is what gets EXCLUDED.
//
// An entry the household has not got round to entering is not an entry they
// spent ¥0 on. Counting its plan without its actual manufactures a surplus that
// grows with how far behind they are on data entry -- the card would
// congratulate them most loudly exactly when it knows least.
// ---------------------------------------------------------------------------

const category = (overrides: Partial<Category> = {}): Category => ({
  id: 1,
  name: '住居費',
  type: 'expense',
  color: '#f87171',
  sortOrder: 0,
  costType: 'fixed',
  ...overrides,
});

const YM = '2026-05';
const NO_AMOUNTS: MonthlyAmountsMap = new Map();
const actuals = (pairs: Array<[number, number]>): MonthlyActualsMap =>
  new Map([[YM, new Map(pairs)]]);

const rent = makeTemplate({ id: 1, name: '家賃', categoryId: 1, defaultAmount: 100_000 });
const food = makeTemplate({ id: 2, name: '食費', categoryId: 1, defaultAmount: 60_000 });

describe('summarizeVariance', () => {
  it('compares planned against actual for the entries that have one', () => {
    const result = summarizeVariance(
      [rent, food], [category()], NO_AMOUNTS, actuals([[1, 105_000], [2, 55_000]]), YM, 'expense',
    );

    expect(result.plannedTotal).toBe(160_000);
    expect(result.actualTotal).toBe(160_000);
    expect(result.variance).toBe(0);
    expect(result.recordedCount).toBe(2);
    expect(result.missingCount).toBe(0);
  });

  it('EXCLUDES an entry with no recorded actual from BOTH sides', () => {
    // The whole point. Counting 食費's ¥60,000 plan with no actual would report
    // a ¥60,000 surplus the household did not have.
    const result = summarizeVariance(
      [rent, food], [category()], NO_AMOUNTS, actuals([[1, 105_000]]), YM, 'expense',
    );

    expect(result.plannedTotal).toBe(100_000);
    expect(result.actualTotal).toBe(105_000);
    expect(result.variance).toBe(5_000);
    expect(result.recordedCount).toBe(1);
    expect(result.missingCount).toBe(1);
  });

  it('reports nothing to compare rather than a perfect month', () => {
    // A household that records no actuals must not be told every month went
    // exactly as planned.
    const result = summarizeVariance([rent, food], [category()], NO_AMOUNTS, new Map(), YM, 'expense');

    expect(result.recordedCount).toBe(0);
    expect(result.variance).toBe(0);
    expect(result.missingCount).toBe(2);
    expect(result.lines).toEqual([]);
  });

  it('does not count a DISABLED entry as missing', () => {
    // The household paused it on purpose, so there is nothing they forgot.
    const result = summarizeVariance(
      [rent, { ...food, enabled: false }], [category()], NO_AMOUNTS, actuals([[1, 100_000]]), YM, 'expense',
    );

    expect(result.missingCount).toBe(0);
  });

  it('ignores an entry that does not fall in the month', () => {
    // An annual premium is enabled every month and belongs to one. Counting it
    // as missing in the other eleven would report a shortfall never had.
    const premium = makeTemplate({
      id: 3, name: '年払い保険', categoryId: 1, defaultAmount: 120_000, recurrence: yearlyOn(9, 1),
    });
    const result = summarizeVariance(
      [rent, premium], [category()], NO_AMOUNTS, actuals([[1, 100_000]]), YM, 'expense',
    );

    expect(result.missingCount).toBe(0);
    expect(result.recordedCount).toBe(1);
  });

  it('uses the monthly override as the plan when there is one', () => {
    const amounts: MonthlyAmountsMap = new Map([[YM, new Map([[1, 90_000]])]]);
    const result = summarizeVariance(
      [rent], [category()], amounts, actuals([[1, 95_000]]), YM, 'expense',
    );

    expect(result.plannedTotal).toBe(90_000);
    expect(result.variance).toBe(5_000);
  });

  it('sorts the largest overspend first', () => {
    // The reader is looking for what went wrong. Sorting by amount would bury a
    // ¥30,000 overrun under a ¥120,000 rent that landed exactly as planned.
    const result = summarizeVariance(
      [rent, food], [category()], NO_AMOUNTS, actuals([[1, 100_000], [2, 90_000]]), YM, 'expense',
    );

    expect(result.lines.map((line) => line.name)).toEqual(['食費', '家賃']);
    expect(result.lines[0].diff).toBe(30_000);
  });

  it('carries the category colour, and null when there is none', () => {
    const uncategorised = makeTemplate({ id: 4, name: '雑費', categoryId: null, defaultAmount: 1_000 });
    const result = summarizeVariance(
      [rent, uncategorised], [category()], NO_AMOUNTS, actuals([[1, 1], [4, 1]]), YM, 'expense',
    );

    expect(result.lines.find((l) => l.templateId === 1)?.color).toBe('#f87171');
    expect(result.lines.find((l) => l.templateId === 4)?.color).toBeNull();
  });

  it('compares income too, in the same shape', () => {
    // A month where the salary arrived short is exactly as worth knowing, and a
    // second copy of this function for the other direction is how the two would
    // drift over what counts as "recorded".
    const salary = makeTemplate({
      id: 5, name: '給料', type: 'income', categoryId: null, defaultAmount: 400_000, recurrence: monthlyOn(25),
    });
    const result = summarizeVariance(
      [salary], [], NO_AMOUNTS, actuals([[5, 380_000]]), YM, 'income',
    );

    expect(result.variance).toBe(-20_000);
  });

  it('ignores the other direction’s entries entirely', () => {
    const salary = makeTemplate({ id: 5, name: '給料', type: 'income', defaultAmount: 400_000 });
    const result = summarizeVariance(
      [rent, salary], [category()], NO_AMOUNTS, actuals([[1, 100_000], [5, 400_000]]), YM, 'expense',
    );

    expect(result.recordedCount).toBe(1);
    expect(result.lines[0].name).toBe('家賃');
  });
});

describe('previousMonth', () => {
  it('steps back one month', () => {
    expect(previousMonth(new Date(2026, 5, 4))).toBe('2026-05');
  });

  it('crosses a year boundary', () => {
    expect(previousMonth(new Date(2026, 0, 1))).toBe('2025-12');
  });

  it('is computed in LOCAL time', () => {
    // A UTC-based answer is the previous month for the first hours of every
    // month anywhere east of Greenwich -- which is where this app is used.
    expect(previousMonth(new Date(2026, 6, 1, 0, 30))).toBe('2026-06');
  });
});
