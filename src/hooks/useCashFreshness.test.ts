import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { STALE_AFTER_DAYS, useCashFreshness } from './useCashFreshness';
import { useAssetStore } from '../stores/useAssetStore';
import { makeAsset, makeAssetCategory, makeCashAsset, makeCashCategory } from '../test/factories';

// ---------------------------------------------------------------------------
// 現在の残高 is typed in by hand, and every projection, warning and 使っていい額
// on the dashboard is computed from it. The moment somebody forgets to update
// it, all of them are confidently wrong -- and a stale balance and a current one
// render identically.
//
// This does not fix the staleness. It makes it visible, which turns a silent
// error into a prompt.
// ---------------------------------------------------------------------------

const NOW = new Date(2026, 5, 20, 12, 0, 0); // 2026-06-20

/** An ISO timestamp `days` before NOW. */
const daysAgo = (days: number): string =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - days, 9, 0, 0).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  useAssetStore.setState({ categories: [], assets: [], status: 'ready' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('when the ledger records cash', () => {
  it('reports how long ago the newest holding was edited', () => {
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [makeCashAsset({ updatedAt: daysAgo(3) })],
    });

    const { result } = renderHook(() => useCashFreshness());

    expect(result.current.daysSince).toBe(3);
    expect(result.current.isStale).toBe(false);
  });

  it('dates the caption from the NEWEST edit', () => {
    // 「N日前に更新」 is the honest answer to "when did anything last change".
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [
        makeCashAsset({ id: 1, name: '銀行', updatedAt: daysAgo(300) }),
        makeCashAsset({ id: 2, name: '財布', updatedAt: daysAgo(1) }),
      ],
    });

    expect(renderHook(() => useCashFreshness()).result.current.daysSince).toBe(1);
  });

  it('judges STALENESS on the oldest, because the balance is a SUM', () => {
    // The first version read only the newest, and that answered the wrong
    // question. A ¥1,000,000 bank balance from 300 days ago beside a ¥10,000
    // wallet updated today would report 「今日更新」 for a total that is 99% a
    // year out of date -- the reassurance strongest exactly where the error is
    // largest.
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [
        makeCashAsset({ id: 1, name: '銀行', value: 1_000_000, updatedAt: daysAgo(300) }),
        makeCashAsset({ id: 2, name: '財布', value: 10_000, updatedAt: daysAgo(1) }),
      ],
    });

    const { result } = renderHook(() => useCashFreshness());

    expect(result.current.isStale).toBe(true);
    expect(result.current.staleCount).toBe(1);
    expect(result.current.oldestDaysSince).toBe(300);
    // And the caption still dates from the latest edit.
    expect(result.current.daysSince).toBe(1);
  });

  it('is not stale when every holding is recent', () => {
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [
        makeCashAsset({ id: 1, updatedAt: daysAgo(3) }),
        makeCashAsset({ id: 2, updatedAt: daysAgo(1) }),
      ],
    });

    const { result } = renderHook(() => useCashFreshness());

    expect(result.current.isStale).toBe(false);
    expect(result.current.staleCount).toBe(0);
  });

  it('goes stale once the threshold passes, and not before', () => {
    const at = (days: number): boolean => {
      useAssetStore.setState({
        categories: [makeCashCategory()],
        assets: [makeCashAsset({ updatedAt: daysAgo(days) })],
      });
      return renderHook(() => useCashFreshness()).result.current.isStale;
    };

    expect(at(STALE_AFTER_DAYS - 1)).toBe(false);
    expect(at(STALE_AFTER_DAYS)).toBe(true);
    expect(at(STALE_AFTER_DAYS + 30)).toBe(true);
  });

  it('IGNORES holdings outside the cash category', () => {
    // A NISA position edited today says nothing about whether the balance is
    // current, and letting it count would silence the prompt for a household
    // that only ever touches its investments.
    useAssetStore.setState({
      categories: [makeCashCategory(), makeAssetCategory({ id: 1, name: 'NISA' })],
      assets: [
        makeCashAsset({ id: 1, updatedAt: daysAgo(60) }),
        makeAsset({ id: 2, categoryId: 1, updatedAt: daysAgo(0) }),
      ],
    });

    const { result } = renderHook(() => useCashFreshness());

    expect(result.current.daysSince).toBe(60);
    expect(result.current.isStale).toBe(true);
  });

  it('clamps a future timestamp to today rather than reporting -1日前', () => {
    // Clock skew between the server and the browser is ordinary; 「-1日前に更新」
    // reads as a bug rather than as the rounding artefact it is.
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [makeCashAsset({ updatedAt: daysAgo(-2) })],
    });

    expect(renderHook(() => useCashFreshness()).result.current.daysSince).toBe(0);
  });
});

describe('when there is nothing to measure', () => {
  it('reports null for a ledger with no cash holdings', () => {
    // A different situation from "recorded long ago", and one the caption
    // already covers by saying the balance comes from no holdings.
    useAssetStore.setState({ categories: [makeCashCategory()], assets: [] });

    const { result } = renderHook(() => useCashFreshness());

    expect(result.current.daysSince).toBeNull();
    expect(result.current.updatedAt).toBeNull();
    expect(result.current.isStale).toBe(false);
  });

  it('reports null before the categories have arrived', () => {
    // Not stale: unknown. Claiming staleness here would put a warning on every
    // cold load, which is exactly the cry-wolf the dashboard's LoadGate exists
    // to prevent elsewhere.
    useAssetStore.setState({ categories: [], assets: [], status: 'loading' });

    expect(renderHook(() => useCashFreshness()).result.current.isStale).toBe(false);
  });
});
