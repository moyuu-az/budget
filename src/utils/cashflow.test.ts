import { describe, it, expect } from 'vitest';
import { buildCashFlowData } from './cashflow';
import type { EntryTemplate, Category, MonthlyAmountsMap } from '../types';

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
    costType: null,
    ...overrides,
  };
}

const YM = '2026-06';

describe('buildCashFlowData', () => {
  it('returns null when there are no enabled templates', () => {
    const tpls = [makeTemplate({ id: 1, enabled: false })];
    expect(buildCashFlowData(tpls, new Map(), [], YM)).toBeNull();
  });

  it('returns null when enabled templates all resolve to non-positive amounts', () => {
    const tpls = [makeTemplate({ id: 1, enabled: true, defaultAmount: 0 })];
    expect(buildCashFlowData(tpls, new Map(), [], YM)).toBeNull();
  });

  it('builds nodes, links, and summary for a surplus (income > expense)', () => {
    const tpls = [
      makeTemplate({ id: 1, name: 'Salary', type: 'income', categoryId: 1, defaultAmount: 300000 }),
      makeTemplate({ id: 2, name: 'Rent', type: 'expense', categoryId: 2, defaultAmount: 100000 }),
    ];
    const cats = [
      makeCategory({ id: 1, name: 'Salary', type: 'income', color: '#0000ff' }),
      makeCategory({ id: 2, name: 'Rent', type: 'expense', color: '#00ff00' }),
    ];
    const data = buildCashFlowData(tpls, new Map(), cats, YM);
    expect(data).not.toBeNull();
    expect(data!.summary).toEqual({ totalIncome: 300000, totalExpenses: 100000, net: 200000 });

    // income node, total node, expense node, savings node
    const types = data!.nodes.map((n) => n.type);
    expect(types).toEqual(['income', 'total', 'expense', 'savings']);

    const savings = data!.nodes.find((n) => n.type === 'savings')!;
    expect(savings).toMatchObject({ name: '貯蓄', value: 200000 });

    const total = data!.nodes.find((n) => n.type === 'total')!;
    expect(total).toMatchObject({ name: '総収入', value: 300000 });

    // links: income->total, total->expense, total->savings
    expect(data!.links).toHaveLength(3);
    const savingsLink = data!.links.find((l) => l.target === types.indexOf('savings'));
    expect(savingsLink!.value).toBe(200000);
  });

  it('adds a 不足分 deficit node and no savings node when expenses exceed income', () => {
    const tpls = [
      makeTemplate({ id: 1, name: 'Salary', type: 'income', categoryId: 1, defaultAmount: 100000 }),
      makeTemplate({ id: 2, name: 'Rent', type: 'expense', categoryId: 2, defaultAmount: 150000 }),
    ];
    const cats = [
      makeCategory({ id: 1, name: 'Salary', type: 'income', color: '#0000ff' }),
      makeCategory({ id: 2, name: 'Rent', type: 'expense', color: '#00ff00' }),
    ];
    const data = buildCashFlowData(tpls, new Map(), cats, YM)!;
    expect(data.summary.net).toBe(-50000);

    const deficit = data.nodes.find((n) => n.type === 'deficit');
    expect(deficit).toMatchObject({ name: '不足分', value: 50000 });
    expect(data.nodes.some((n) => n.type === 'savings')).toBe(false);

    // total node value is max(income, expenses) = 150000
    const total = data.nodes.find((n) => n.type === 'total')!;
    expect(total.value).toBe(150000);
  });

  it('groups templates with no category under その他 and respects monthly overrides', () => {
    const tpls = [
      makeTemplate({ id: 1, name: 'Salary', type: 'income', categoryId: null, defaultAmount: 200000 }),
      makeTemplate({ id: 2, name: 'Misc', type: 'expense', categoryId: null, defaultAmount: 1000 }),
    ];
    const map: MonthlyAmountsMap = new Map([[YM, new Map([[2, 50000]])]]);
    const data = buildCashFlowData(tpls, map, [], YM)!;

    const expenseNode = data.nodes.find((n) => n.type === 'expense')!;
    expect(expenseNode).toMatchObject({ name: 'その他', color: '#6b7280', value: 50000 });
    expect(data.summary.totalExpenses).toBe(50000);
  });

  it('merges multiple templates sharing a category into one node', () => {
    const tpls = [
      makeTemplate({ id: 1, name: 'Salary', type: 'income', categoryId: 1, defaultAmount: 100000 }),
      makeTemplate({ id: 2, name: 'Groceries', type: 'expense', categoryId: 2, defaultAmount: 30000 }),
      makeTemplate({ id: 3, name: 'Dining', type: 'expense', categoryId: 2, defaultAmount: 20000 }),
    ];
    const cats = [
      makeCategory({ id: 1, name: 'Pay', type: 'income', color: '#00f' }),
      makeCategory({ id: 2, name: 'Food', type: 'expense', color: '#0f0' }),
    ];
    const data = buildCashFlowData(tpls, new Map(), cats, YM)!;
    const foodNodes = data.nodes.filter((n) => n.type === 'expense');
    expect(foodNodes).toHaveLength(1);
    expect(foodNodes[0]).toMatchObject({ name: 'Food', value: 50000 });
  });

  it('sorts expense category nodes by descending total', () => {
    const tpls = [
      makeTemplate({ id: 1, name: 'Salary', type: 'income', categoryId: 1, defaultAmount: 500000 }),
      makeTemplate({ id: 2, name: 'Small', type: 'expense', categoryId: 2, defaultAmount: 10000 }),
      makeTemplate({ id: 3, name: 'Big', type: 'expense', categoryId: 3, defaultAmount: 90000 }),
    ];
    const cats = [
      makeCategory({ id: 1, name: 'Pay', type: 'income', color: '#00f' }),
      makeCategory({ id: 2, name: 'Small', type: 'expense', color: '#0f0' }),
      makeCategory({ id: 3, name: 'Big', type: 'expense', color: '#f00' }),
    ];
    const data = buildCashFlowData(tpls, new Map(), cats, YM)!;
    const expenseNodes = data.nodes.filter((n) => n.type === 'expense');
    expect(expenseNodes.map((n) => n.name)).toEqual(['Big', 'Small']);
  });
});
