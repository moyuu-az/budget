import { describe, it, expect } from 'vitest';
import { summarizeHoldings } from './net-worth';
import type { Asset, AssetCategory } from '../types';

const category = (overrides: Partial<AssetCategory> = {}): AssetCategory => ({
  id: 1,
  name: 'NISA',
  color: '#22c55e',
  sortOrder: 0,
  fields: [],
  ...overrides,
});

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 1,
  categoryId: 1,
  name: 'つみたて',
  value: 1_000_000,
  fields: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('summarizeHoldings', () => {
  it('keeps cash and assets separate, and reports the total alongside them', () => {
    // The parts have to survive into the result: the card shows them beside the
    // total so a double entry is visible instead of hidden inside one number.
    const result = summarizeHoldings(500_000, [category()], [asset({ value: 1_000_000 })]);
    expect(result).toMatchObject({ cash: 500_000, assets: 1_000_000, total: 1_500_000 });
  });

  it('sums a loan tracked as a negative asset', () => {
    const result = summarizeHoldings(
      500_000,
      [category({ id: 2, name: '住宅ローン' })],
      [asset({ id: 9, categoryId: 2, value: -28_000_000 })],
    );
    expect(result.assets).toBe(-28_000_000);
    expect(result.total).toBe(-27_500_000);
  });

  it('groups holdings by category in display order', () => {
    const result = summarizeHoldings(
      0,
      [category({ id: 1, sortOrder: 1, name: 'NISA' }), category({ id: 2, sortOrder: 0, name: '現金' })],
      [
        asset({ id: 1, categoryId: 1, value: 100 }),
        asset({ id: 2, categoryId: 1, value: 200 }),
        asset({ id: 3, categoryId: 2, value: 50 }),
      ],
    );
    expect(result.byCategory.map((c) => [c.name, c.value])).toEqual([
      ['現金', 50],
      ['NISA', 300],
    ]);
  });

  it('omits a category that holds nothing', () => {
    // ¥0 reads as a figure rather than as "nothing recorded here yet".
    const result = summarizeHoldings(0, [category({ id: 1 }), category({ id: 2, name: '現金' })], [
      asset({ categoryId: 1 }),
    ]);
    expect(result.byCategory.map((c) => c.name)).toEqual(['NISA']);
  });

  it('still counts a holding whose category has vanished from the list', () => {
    // The category list can be one render behind. Dropping the holding would
    // make the lines on screen disagree with the total above them.
    const result = summarizeHoldings(0, [], [asset({ categoryId: 999, value: 700 })]);
    expect(result.assets).toBe(700);
    expect(result.byCategory).toEqual([]);
  });

  it('reports cash alone when nothing is tracked', () => {
    const result = summarizeHoldings(500_000, [], []);
    expect(result).toMatchObject({ cash: 500_000, assets: 0, total: 500_000 });
  });
});

describe('the parts always add up', () => {
  it('does not round, so every screen showing the same data agrees', () => {
    // An earlier version rounded per holding here so the chips would sum
    // exactly. It made this card disagree with the 資産 screen, which rounds
    // only for display. Rounding lives at the edge (utils/currency.ts) and
    // whole-yen values are enforced at the input instead.
    const result = summarizeHoldings(0, [category()], [asset({ value: 100 })]);
    expect(result.assets).toBe(100);
    expect(result.total).toBe(100);
  });

  it('keeps the chips summing to the asset total', () => {
    const result = summarizeHoldings(
      0,
      [category()],
      [asset({ id: 1, value: 100 }), asset({ id: 2, value: 250 })],
    );
    const chips = result.byCategory.reduce((sum, line) => sum + line.value, 0);
    expect(chips + result.other).toBe(result.assets);
  });

  it('reports holdings whose category is not loaded as その他', () => {
    // Reachable: a shared ledger where the other member added a category this
    // client has not fetched. Dropping them would make the chips quietly fail
    // to reach the asset total.
    const result = summarizeHoldings(
      0,
      [category({ id: 1 })],
      [asset({ id: 1, categoryId: 1, value: 100 }), asset({ id: 2, categoryId: 99, value: 40 })],
    );
    expect(result.other).toBe(40);
    expect(result.byCategory.reduce((s, l) => s + l.value, 0) + result.other).toBe(result.assets);
  });

  it('reports nothing extra when every holding has its category', () => {
    const result = summarizeHoldings(0, [category()], [asset({ value: 100 })]);
    expect(result.other).toBe(0);
  });

  it('keeps 残高 ＋ 資産 ＝ 純資産 exact', () => {
    const result = summarizeHoldings(500_000, [category()], [asset({ value: 100 })]);
    expect(result.cash + result.assets).toBe(result.total);
  });
});
