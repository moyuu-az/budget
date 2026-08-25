import { describe, it, expect } from 'vitest';
import {
  buildCategoryTrend,
  buildCompositionData,
  buildComparisonData,
  generateMonthRange,
} from './analytics';
import type {
  Category,
  EntryTemplate,
  MonthlyAmountsMap,
  MonthlyActualsMap,
  CategoryTrendPoint,
} from '../types';
import { monthlyOn, yearlyOn } from '../test/factories';

function makeTemplate(overrides: Partial<EntryTemplate> = {}): EntryTemplate {
  return {
    id: 1,
    name: 'Template',
    recurrence: monthlyOn(1),
    type: 'expense',
    enabled: true,
    sortOrder: 0,
    categoryId: null,
    defaultAmount: 1000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Food',
    type: 'expense',
    color: '#ff0000',
    sortOrder: 0,
    costType: null,
    ...overrides,
  };
}

// Convenience builders for the nested yearMonth -> templateId -> amount maps.
function amounts(...entries: Array<[string, Array<[number, number]>]>): MonthlyAmountsMap {
  return new Map(entries.map(([ym, pairs]) => [ym, new Map(pairs)]));
}
const actuals = amounts as (...entries: Array<[string, Array<[number, number]>]>) => MonthlyActualsMap;

const NO_MAP: MonthlyAmountsMap = new Map();

describe('buildCategoryTrend', () => {
  it('returns one entry per requested month with empty categories on no data', () => {
    const result = buildCategoryTrend([], [], NO_MAP, new Map(), ['2026-01', '2026-02'], 'expense');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ yearMonth: '2026-01', categories: [] });
    expect(result[1].categories).toEqual([]);
  });

  it('falls back to the planned default amount when no actual is recorded (regression)', () => {
    // The original bug: past/current months read ONLY actuals, so a month with no
    // recorded actuals rendered blank. Planned amounts must fill the gap.
    const tpl = makeTemplate({ id: 1, type: 'expense', categoryId: 1, defaultAmount: 5000 });
    const cats = [makeCategory({ id: 1, name: 'Food', color: '#abcdef' })];
    const result = buildCategoryTrend([tpl], cats, NO_MAP, new Map(), ['2026-01'], 'expense');
    expect(result[0].categories[0]).toMatchObject({
      categoryId: 1,
      name: 'Food',
      color: '#abcdef',
      amount: 5000,
    });
  });

  it('prefers a recorded actual over the planned amount', () => {
    const tpl = makeTemplate({ id: 1, type: 'expense', categoryId: 1, defaultAmount: 5000 });
    const cats = [makeCategory({ id: 1 })];
    const result = buildCategoryTrend(
      [tpl], cats, NO_MAP, actuals(['2026-01', [[1, 1200]]]), ['2026-01'], 'expense',
    );
    expect(result[0].categories[0].amount).toBe(1200);
  });

  it('treats a recorded actual of 0 as overriding the plan (then drops the zero bar)', () => {
    const tpl = makeTemplate({ id: 1, type: 'expense', categoryId: 1, defaultAmount: 5000 });
    const result = buildCategoryTrend(
      [tpl], [makeCategory({ id: 1 })], NO_MAP, actuals(['2026-01', [[1, 0]]]), ['2026-01'], 'expense',
    );
    expect(result[0].categories).toEqual([]);
  });

  it('applies a monthly planned override over the default', () => {
    const tpl = makeTemplate({ id: 1, categoryId: 1, defaultAmount: 1000 });
    const result = buildCategoryTrend(
      [tpl], [makeCategory({ id: 1 })], amounts(['2026-12', [[1, 7777]]]), new Map(), ['2026-12'], 'expense',
    );
    expect(result[0].categories[0].amount).toBe(7777);
  });

  it('filters templates by type', () => {
    const tpls = [
      makeTemplate({ id: 1, type: 'expense', categoryId: 1, defaultAmount: 100 }),
      makeTemplate({ id: 2, type: 'income', categoryId: 2, defaultAmount: 200 }),
    ];
    const cats = [makeCategory({ id: 1, name: 'Food' }), makeCategory({ id: 2, name: 'Pay', type: 'income' })];
    const expense = buildCategoryTrend(tpls, cats, NO_MAP, new Map(), ['2026-01'], 'expense');
    const income = buildCategoryTrend(tpls, cats, NO_MAP, new Map(), ['2026-01'], 'income');
    expect(expense[0].categories).toHaveLength(1);
    expect(expense[0].categories[0]).toMatchObject({ name: 'Food', amount: 100 });
    expect(income[0].categories[0]).toMatchObject({ name: 'Pay', amount: 200 });
  });

  it('ignores disabled templates and non-positive amounts', () => {
    const tpls = [
      makeTemplate({ id: 1, enabled: false, categoryId: 1, defaultAmount: 5000 }),
      makeTemplate({ id: 2, enabled: true, categoryId: 2, defaultAmount: 0 }),
    ];
    const result = buildCategoryTrend(tpls, [], NO_MAP, new Map(), ['2026-01'], 'expense');
    expect(result[0].categories).toEqual([]);
  });

  it('falls back to その他 / default color for a null category', () => {
    const tpl = makeTemplate({ id: 1, categoryId: null, defaultAmount: 400 });
    const result = buildCategoryTrend([tpl], [], NO_MAP, new Map(), ['2026-01'], 'expense');
    expect(result[0].categories[0]).toMatchObject({
      categoryId: null,
      name: 'その他',
      color: '#6b7280',
      amount: 400,
    });
  });

  it('aggregates templates sharing a category and sorts descending', () => {
    const tpls = [
      makeTemplate({ id: 1, categoryId: 1, defaultAmount: 300 }),
      makeTemplate({ id: 2, categoryId: 1, defaultAmount: 200 }),
      makeTemplate({ id: 3, categoryId: 2, defaultAmount: 800 }),
    ];
    const cats = [
      makeCategory({ id: 1, name: 'Food' }),
      makeCategory({ id: 2, name: 'Rent', color: '#00ff00' }),
    ];
    const result = buildCategoryTrend(tpls, cats, NO_MAP, new Map(), ['2026-01'], 'expense');
    const items = result[0].categories;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ categoryId: 2, name: 'Rent', amount: 800 });
    expect(items[1]).toMatchObject({ categoryId: 1, name: 'Food', amount: 500 });
  });

  it('applies an actual override to only the matching template within a shared category', () => {
    const tpls = [
      makeTemplate({ id: 1, categoryId: 1, defaultAmount: 300 }),
      makeTemplate({ id: 2, categoryId: 1, defaultAmount: 200 }),
    ];
    const result = buildCategoryTrend(
      tpls, [makeCategory({ id: 1 })], NO_MAP, actuals(['2026-01', [[1, 50]]]), ['2026-01'], 'expense',
    );
    // template 1 -> actual 50, template 2 -> planned 200 => 250 total
    expect(result[0].categories[0].amount).toBe(250);
  });

  it('counts recorded actuals even when the template is disabled (toggling never erases history)', () => {
    // A recorded actual is a fact: disabling the template later must not retroactively
    // wipe it from historical analytics.
    const tpl = makeTemplate({ id: 1, enabled: false, type: 'expense', categoryId: 1, defaultAmount: 5000 });
    const result = buildCategoryTrend(
      [tpl], [makeCategory({ id: 1 })], NO_MAP, actuals(['2026-01', [[1, 1800]]]), ['2026-01'], 'expense',
    );
    expect(result[0].categories[0]).toMatchObject({ categoryId: 1, amount: 1800 });
  });

  it('does not synthesize a planned fallback for a disabled template without an actual', () => {
    const tpl = makeTemplate({ id: 1, enabled: false, type: 'expense', categoryId: 1, defaultAmount: 5000 });
    const result = buildCategoryTrend([tpl], [makeCategory({ id: 1 })], NO_MAP, new Map(), ['2026-01'], 'expense');
    expect(result[0].categories).toEqual([]);
  });

  it('ignores an actual whose template type does not match the requested type', () => {
    const tpl = makeTemplate({ id: 1, type: 'income', categoryId: 1, defaultAmount: 0 });
    const result = buildCategoryTrend(
      [tpl], [makeCategory({ id: 1 })], NO_MAP, actuals(['2026-01', [[1, 999]]]), ['2026-01'], 'expense',
    );
    expect(result[0].categories).toEqual([]);
  });
});

describe('the planned fallback vs. irregular timing', () => {
  // -----------------------------------------------------------------------
  // The trend charts synthesise a planned amount for any month with no
  // recorded actual. Since migration 005 that synthesis has to ask WHETHER the
  // entry falls in the month -- otherwise an annual premium is invented into
  // all twelve, and a trend line reads flat at a value no month's own total
  // agrees with.
  //
  // The actuals path deliberately keeps no such filter, which is the second
  // test below: a recorded actual is a FACT about a month, and editing the
  // recurrence afterwards must not erase history.
  // -----------------------------------------------------------------------
  it('does not synthesise a yearly plan into the months it skips', () => {
    const tpl = makeTemplate({
      id: 1, type: 'expense', categoryId: 1, defaultAmount: 120_000, recurrence: yearlyOn(3, 20),
    });
    const cats = [makeCategory({ id: 1, name: '車', color: '#abcdef' })];

    const result = buildCategoryTrend([tpl], cats, NO_MAP, new Map(), ['2026-02', '2026-03', '2026-04'], 'expense');

    expect(result[0].categories).toEqual([]);
    expect(result[1].categories[0]).toMatchObject({ categoryId: 1, amount: 120_000 });
    expect(result[2].categories).toEqual([]);
  });

  it('still counts a recorded actual in a month the entry no longer falls in', () => {
    // The household paid it; the recurrence was corrected afterwards. The month
    // it was actually paid in must keep showing it.
    const tpl = makeTemplate({
      id: 1, type: 'expense', categoryId: 1, defaultAmount: 120_000, recurrence: yearlyOn(3, 20),
    });
    const cats = [makeCategory({ id: 1, name: '車', color: '#abcdef' })];

    const result = buildCategoryTrend(
      [tpl], cats, NO_MAP, actuals(['2026-08', [[1, 99_000]]]), ['2026-08'], 'expense',
    );

    expect(result[0].categories[0]).toMatchObject({ categoryId: 1, amount: 99_000 });
  });
});

describe('buildCompositionData', () => {
  it('returns an empty array when the total is zero', () => {
    expect(buildCompositionData([], [], NO_MAP, new Map(), '2026-01', 'expense')).toEqual([]);
  });

  it('aggregates by category, filters by type, and computes percentages', () => {
    const tpls = [
      makeTemplate({ id: 1, type: 'expense', categoryId: 1, defaultAmount: 750 }),
      makeTemplate({ id: 2, type: 'expense', categoryId: 2, defaultAmount: 250 }),
      makeTemplate({ id: 3, type: 'income', categoryId: 3, defaultAmount: 9999 }),
    ];
    const cats = [
      makeCategory({ id: 1, name: 'Food' }),
      makeCategory({ id: 2, name: 'Rent', color: '#0f0' }),
    ];
    const result = buildCompositionData(tpls, cats, NO_MAP, new Map(), '2026-01', 'expense');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: 'Food', amount: 750, percentage: 75 });
    expect(result[1]).toMatchObject({ name: 'Rent', amount: 250, percentage: 25 });
  });

  it('prefers recorded actuals when present', () => {
    const tpl = makeTemplate({ id: 1, type: 'expense', categoryId: 1, defaultAmount: 1000 });
    const result = buildCompositionData(
      [tpl], [makeCategory({ id: 1 })], NO_MAP, actuals(['2026-01', [[1, 400]]]), '2026-01', 'expense',
    );
    expect(result[0]).toMatchObject({ amount: 400, percentage: 100 });
  });

  it('groups null-category templates under その他', () => {
    const tpl = makeTemplate({ id: 1, categoryId: null, defaultAmount: 1000 });
    const result = buildCompositionData([tpl], [], NO_MAP, new Map(), '2026-01', 'expense');
    expect(result[0]).toMatchObject({ categoryId: null, name: 'その他', percentage: 100 });
  });
});

describe('buildComparisonData', () => {
  it('returns an empty array when the target month is absent', () => {
    const trend: CategoryTrendPoint[] = [{ yearMonth: '2026-01', categories: [] }];
    expect(buildComparisonData(trend, '2026-99')).toEqual([]);
  });

  it('computes prev-month and prev-year diffs and percents', () => {
    const trend: CategoryTrendPoint[] = [
      { yearMonth: '2025-03', categories: [{ categoryId: 1, name: 'Food', color: '#f00', amount: 100 }] },
      { yearMonth: '2026-02', categories: [{ categoryId: 1, name: 'Food', color: '#f00', amount: 200 }] },
      { yearMonth: '2026-03', categories: [{ categoryId: 1, name: 'Food', color: '#f00', amount: 300 }] },
    ];
    const rows = buildComparisonData(trend, '2026-03');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      categoryId: 1,
      currentAmount: 300,
      prevMonthDiff: 100,
      prevMonthPercent: 50,
      prevYearDiff: 200,
      prevYearPercent: 200,
    });
  });

  it('yields null diffs when prior periods lack the category', () => {
    const trend: CategoryTrendPoint[] = [
      { yearMonth: '2026-03', categories: [{ categoryId: 1, name: 'Food', color: '#f00', amount: 300 }] },
    ];
    const rows = buildComparisonData(trend, '2026-03');
    expect(rows[0]).toMatchObject({
      prevMonthDiff: null,
      prevMonthPercent: null,
      prevYearDiff: null,
      prevYearPercent: null,
    });
  });
});

describe('generateMonthRange', () => {
  it('produces an inclusive list across a year boundary', () => {
    expect(generateMonthRange('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('returns a single month when start equals end', () => {
    expect(generateMonthRange('2026-06', '2026-06')).toEqual(['2026-06']);
  });

  it('returns an empty array when start is after end', () => {
    expect(generateMonthRange('2026-06', '2026-05')).toEqual([]);
  });
});
