import { describe, it, expect } from 'vitest';
import {
  buildCategoryTrend,
  buildCompositionData,
  buildComparisonData,
  generateMonthRange,
} from './analytics';
import type {
  ActualWithCategory,
  Category,
  EntryTemplate,
  MonthlyAmountsMap,
  CategoryTrendPoint,
} from '../types';

function makeTemplate(overrides: Partial<EntryTemplate> = {}): EntryTemplate {
  return {
    id: 1,
    name: 'Template',
    dayOfMonth: 1,
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
    ...overrides,
  };
}

function makeActual(overrides: Partial<ActualWithCategory> = {}): ActualWithCategory {
  return {
    templateId: 1,
    yearMonth: '2026-01',
    actualAmount: 1000,
    templateName: 'Template',
    templateType: 'expense',
    categoryId: 1,
    categoryName: 'Food',
    categoryColor: '#ff0000',
    ...overrides,
  };
}

const TODAY = '2026-06';

describe('buildCategoryTrend', () => {
  it('returns one entry per requested month with empty categories on no data', () => {
    const result = buildCategoryTrend([], [], [], new Map(), ['2026-01', '2026-02'], TODAY);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ yearMonth: '2026-01', categories: [] });
    expect(result[1].categories).toEqual([]);
  });

  it('aggregates actuals by category for past months and sorts descending', () => {
    const actuals = [
      makeActual({ templateId: 1, categoryId: 1, categoryName: 'Food', actualAmount: 300 }),
      makeActual({ templateId: 2, categoryId: 1, categoryName: 'Food', actualAmount: 200 }),
      makeActual({ templateId: 3, categoryId: 2, categoryName: 'Rent', categoryColor: '#00ff00', actualAmount: 800 }),
    ];
    const result = buildCategoryTrend(actuals, [], [], new Map(), ['2026-01'], TODAY);
    const cats = result[0].categories;
    expect(cats).toHaveLength(2);
    expect(cats[0]).toMatchObject({ categoryId: 2, name: 'Rent', amount: 800 });
    expect(cats[1]).toMatchObject({ categoryId: 1, name: 'Food', amount: 500 });
  });

  it('falls back to その他 / default color for a null category in actuals', () => {
    const actuals = [
      makeActual({ categoryId: null, categoryName: null, categoryColor: null, actualAmount: 400 }),
    ];
    const result = buildCategoryTrend(actuals, [], [], new Map(), ['2026-01'], TODAY);
    expect(result[0].categories[0]).toMatchObject({
      categoryId: null,
      name: 'その他',
      color: '#6b7280',
      amount: 400,
    });
  });

  it('uses templates (forecast) for months after today', () => {
    const tpl = makeTemplate({ id: 10, categoryId: 1, defaultAmount: 1234 });
    const cats = [makeCategory({ id: 1, name: 'Food', color: '#abcdef' })];
    const result = buildCategoryTrend([], [tpl], cats, new Map(), ['2026-12'], TODAY);
    expect(result[0].categories[0]).toMatchObject({
      categoryId: 1,
      name: 'Food',
      color: '#abcdef',
      amount: 1234,
    });
  });

  it('applies a monthly override for future months', () => {
    const tpl = makeTemplate({ id: 11, categoryId: 1, defaultAmount: 1000 });
    const cats = [makeCategory({ id: 1 })];
    const map: MonthlyAmountsMap = new Map([['2026-12', new Map([[11, 7777]])]]);
    const result = buildCategoryTrend([], [tpl], cats, map, ['2026-12'], TODAY);
    expect(result[0].categories[0].amount).toBe(7777);
  });

  it('ignores disabled templates and non-positive amounts in future months', () => {
    const tpls = [
      makeTemplate({ id: 12, enabled: false, categoryId: 1, defaultAmount: 5000 }),
      makeTemplate({ id: 13, enabled: true, categoryId: 2, defaultAmount: 0 }),
    ];
    const result = buildCategoryTrend([], tpls, [], new Map(), ['2026-12'], TODAY);
    expect(result[0].categories).toEqual([]);
  });
});

describe('buildCompositionData', () => {
  it('returns an empty array when the total is zero', () => {
    expect(buildCompositionData([], [], [], new Map(), '2026-01', TODAY, 'expense')).toEqual([]);
  });

  it('aggregates past-month actuals filtered by type and computes percentages', () => {
    const actuals = [
      makeActual({ templateId: 1, templateType: 'expense', categoryId: 1, categoryName: 'Food', actualAmount: 750 }),
      makeActual({ templateId: 2, templateType: 'expense', categoryId: 2, categoryName: 'Rent', categoryColor: '#0f0', actualAmount: 250 }),
      makeActual({ templateId: 3, templateType: 'income', categoryId: 3, categoryName: 'Pay', actualAmount: 9999 }),
    ];
    const result = buildCompositionData(actuals, [], [], new Map(), '2026-01', TODAY, 'expense');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: 'Food', amount: 750, percentage: 75 });
    expect(result[1]).toMatchObject({ name: 'Rent', amount: 250, percentage: 25 });
  });

  it('groups null-category actuals under その他', () => {
    const actuals = [
      makeActual({ categoryId: null, categoryName: null, categoryColor: null, actualAmount: 1000 }),
    ];
    const result = buildCompositionData(actuals, [], [], new Map(), '2026-01', TODAY, 'expense');
    expect(result[0]).toMatchObject({ categoryId: null, name: 'その他', percentage: 100 });
  });

  it('uses enabled templates of the matching type for future months', () => {
    const tpls = [
      makeTemplate({ id: 1, type: 'income', categoryId: 1, defaultAmount: 5000 }),
      makeTemplate({ id: 2, type: 'expense', categoryId: 2, defaultAmount: 999 }),
    ];
    const cats = [makeCategory({ id: 1, name: 'Salary', type: 'income', color: '#111' })];
    const result = buildCompositionData([], tpls, cats, new Map(), '2026-12', TODAY, 'income');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'Salary', amount: 5000, percentage: 100 });
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
