import { describe, it, expect } from 'vitest';
import { cashTotal, findCashCategory, summarizeHoldings, totalAssetValue } from './net-worth';
import { makeAsset, makeAssetCategory, makeCashAsset, makeCashCategory } from '../test/factories';

describe('findCashCategory', () => {
  it('matches on kind, not on the name', () => {
    // The user may rename 現金 to their bank's name. If the balance were found by
    // name, doing so would silently forecast from zero.
    const renamed = makeCashCategory({ name: 'ゆうちょ' });
    const impostor = makeAssetCategory({ id: 2, name: '現金' });

    expect(findCashCategory([impostor, renamed])?.id).toBe(renamed.id);
  });

  it('is undefined only when the list has not loaded', () => {
    expect(findCashCategory([])).toBeUndefined();
  });
});

describe('cashTotal', () => {
  it('sums only the cash category', () => {
    const total = cashTotal(
      [makeCashCategory(), makeAssetCategory()],
      [
        makeCashAsset({ id: 1, name: '財布', value: 30_000 }),
        makeCashAsset({ id: 2, name: '銀行', value: 470_000 }),
        makeAsset({ id: 3, value: 1_000_000 }),
      ],
    );

    // The NISA holding is excluded: this figure is what the forecast spends, and
    // a NISA position cannot pay next month's rent.
    expect(total).toBe(500_000);
  });

  it('is zero before the categories have loaded', () => {
    // Not an error, and not the sum of everything: an unloaded list must not be
    // able to forecast from net worth.
    expect(cashTotal([], [makeAsset({ value: 1_000_000 })])).toBe(0);
  });
});

describe('summarizeHoldings', () => {
  it('counts cash INSIDE the total, never beside it', () => {
    // The whole point of the shape. cash + total would double count -- which is
    // exactly what the previous version did with a separate balance setting.
    const result = summarizeHoldings(
      [makeCashCategory(), makeAssetCategory()],
      [makeCashAsset({ value: 500_000 }), makeAsset({ value: 1_000_000 })],
    );

    expect(result).toMatchObject({ cash: 500_000, nonCash: 1_000_000, total: 1_500_000 });
  });

  it('sums a loan tracked as a negative asset', () => {
    const result = summarizeHoldings(
      [makeCashCategory(), makeAssetCategory({ id: 2, name: '住宅ローン' })],
      [makeCashAsset({ value: 500_000 }), makeAsset({ id: 9, categoryId: 2, value: -28_000_000 })],
    );

    expect(result.nonCash).toBe(-28_000_000);
    expect(result.total).toBe(-27_500_000);
    // The loan must not reach the balance: the forecast starts from cash.
    expect(result.cash).toBe(500_000);
  });

  it('lists the cash category even when it holds nothing', () => {
    // ¥0 at hand is a fact worth showing. Every OTHER empty category is hidden,
    // because there "¥0" reads as a figure rather than as "nothing recorded".
    const result = summarizeHoldings(
      [makeCashCategory(), makeAssetCategory()],
      [],
    );

    expect(result.byCategory.map((line) => line.name)).toEqual(['現金']);
    expect(result.byCategory[0]).toMatchObject({ value: 0, isCash: true });
  });

  it('orders lines by sortOrder, which puts cash first', () => {
    const result = summarizeHoldings(
      [makeAssetCategory({ id: 2, name: 'NISA', sortOrder: 0 }), makeCashCategory()],
      [makeCashAsset(), makeAsset({ categoryId: 2 })],
    );

    expect(result.byCategory.map((line) => line.name)).toEqual(['現金', 'NISA']);
  });

  it('reports holdings whose category is missing rather than dropping them', () => {
    // Happens on a shared ledger: updateAsset refetches the holdings but
    // deliberately not the categories. The chips must still add up to the total.
    const result = summarizeHoldings(
      [makeCashCategory()],
      [makeCashAsset({ value: 500_000 }), makeAsset({ id: 7, categoryId: 42, value: 250_000 })],
    );

    expect(result.total).toBe(750_000);
    expect(result.unlisted).toBe(250_000);
    const shown = result.byCategory.reduce((sum, line) => sum + line.value, 0);
    expect(shown + result.unlisted).toBe(result.total);
  });
});

describe('totalAssetValue', () => {
  it('is the sum of the values it is given', () => {
    expect(totalAssetValue([{ value: 1 }, { value: 2 }, { value: -3 }])).toBe(0);
  });
});
