import { describe, it, expect } from 'vitest';
import { costTypeLabel, parseCostType, summarizeExpenseByCostType } from './cost-type';
import type { Category, EntryTemplate } from '../types';

const category = (overrides: Partial<Category> = {}): Category => ({
  id: 1,
  name: '住居費',
  type: 'expense',
  color: null,
  sortOrder: 0,
  costType: 'fixed',
  ...overrides,
});

const template = (overrides: Partial<EntryTemplate> = {}): EntryTemplate => ({
  id: 1,
  name: '家賃',
  dayOfMonth: 27,
  type: 'expense',
  enabled: true,
  sortOrder: 0,
  categoryId: 1,
  defaultAmount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('parseCostType', () => {
  it('maps the select values back to the domain', () => {
    expect(parseCostType('fixed')).toBe('fixed');
    expect(parseCostType('variable')).toBe('variable');
  });

  it('treats the empty option -- and anything unknown -- as unclassified', () => {
    expect(parseCostType('')).toBeNull();
    expect(parseCostType('whatever')).toBeNull();
  });
});

describe('costTypeLabel', () => {
  it('names the unclassified case rather than showing nothing', () => {
    expect(costTypeLabel(null)).toBe('未分類');
    expect(costTypeLabel('fixed')).toBe('固定費');
  });
});

describe('summarizeExpenseByCostType', () => {
  const amounts = new Map<number, number>();
  const amountOf = (t: EntryTemplate): number => amounts.get(t.id) ?? 0;

  it('splits expenses by the classification of their category', () => {
    amounts.set(1, 100).set(2, 30);
    const result = summarizeExpenseByCostType(
      [template({ id: 1, categoryId: 1 }), template({ id: 2, categoryId: 2 })],
      [category({ id: 1, costType: 'fixed' }), category({ id: 2, costType: 'variable' })],
      amountOf,
    );
    expect(result).toEqual({ fixed: 100, variable: 30, unclassified: 0, total: 130 });
  });

  it('counts an unclassified category separately from 変動費', () => {
    // Folding it into 変動費 would make the fixed-cost ratio look better than it
    // is, with nothing on screen to say so.
    amounts.set(1, 100);
    const result = summarizeExpenseByCostType(
      [template({ id: 1, categoryId: 1 })],
      [category({ id: 1, costType: null })],
      amountOf,
    );
    expect(result.unclassified).toBe(100);
    expect(result.variable).toBe(0);
  });

  it('counts a template with no category as unclassified', () => {
    amounts.set(1, 40);
    const result = summarizeExpenseByCostType([template({ id: 1, categoryId: null })], [], amountOf);
    expect(result.unclassified).toBe(40);
  });

  it('counts a template whose category has vanished, so the parts still add up', () => {
    // The category list can be one render behind a deletion. Dropping the row
    // instead would make the parts disagree with the total beside them.
    amounts.set(1, 55);
    const result = summarizeExpenseByCostType([template({ id: 1, categoryId: 999 })], [], amountOf);
    expect(result.unclassified).toBe(55);
    expect(result.fixed + result.variable + result.unclassified).toBe(result.total);
  });

  it('ignores income and disabled templates', () => {
    amounts.set(1, 100).set(2, 500).set(3, 70);
    const result = summarizeExpenseByCostType(
      [
        template({ id: 1 }),
        template({ id: 2, type: 'income', categoryId: null }),
        template({ id: 3, enabled: false }),
      ],
      [category({ id: 1, costType: 'fixed' })],
      amountOf,
    );
    expect(result.total).toBe(100);
  });
});
