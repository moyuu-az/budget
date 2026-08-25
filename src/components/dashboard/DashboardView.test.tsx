import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardView from './DashboardView';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useAssetStore } from '../../stores/useAssetStore';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useMonthlyStore } from '../../stores/useMonthlyStore';
import { makeCashAsset, makeCashCategory, monthlyOn } from '../../test/factories';
import type { EntryTemplate } from '../../types';

// ---------------------------------------------------------------------------
// This file exists because of a specific miss.
//
// The first version of the readiness guard covered the chart and the
// minimum-balance card and left 今後の予定 ungated. Since the forecast now
// returns an EMPTY array until its inputs arrive, that panel confidently
// announced 「14日以内の予定はありません」 on every cold load -- to a household
// with rent due in two days.
//
// The decision about which panels need gating lives entirely in DashboardView,
// and it had no tests at all, so nothing could have caught it. A panel with a
// POSITIVE empty state is the thing to watch: an empty list plus a sentence
// saying "there is nothing" is a false statement, not a blank.
// ---------------------------------------------------------------------------

const rent: EntryTemplate = {
  id: 1,
  name: '家賃',
  recurrence: monthlyOn(27),
  type: 'expense',
  enabled: true,
  sortOrder: 0,
  categoryId: null,
  defaultAmount: 120_000,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  setApi(createMockApi());
  useMonthlyStore.getState().reset();
  // The templates have landed; the balance has not -- the exact interval the
  // browser's connection limit makes routine.
  useTemplateStore.setState({ templates: [rent], status: 'ready' });
  useAssetStore.setState({ categories: [], assets: [], status: 'loading' });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('while the forecast inputs are still arriving', () => {
  it('claims nothing about the coming weeks', () => {
    render(<DashboardView />);

    // The false statement itself.
    expect(screen.queryByText(/予定はありません/)).not.toBeInTheDocument();
  });

  it('raises no shortfall warning', () => {
    render(<DashboardView />);
    expect(screen.queryByText('残高不足')).not.toBeInTheDocument();
  });

  it('says what it is waiting for, for each panel fed by the forecast', () => {
    render(<DashboardView />);

    // Named individually so a panel added later without a gate is visible as a
    // gap here rather than as a confident empty state in production.
    expect(screen.getByRole('status', { name: '残高予測を読み込み中' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '最低残高予測を読み込み中' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '今後の予定を読み込み中' })).toBeInTheDocument();
  });
});

describe('when the fetch failed', () => {
  it('offers a retry for each panel instead of waiting forever', () => {
    useAssetStore.setState({ categories: [], assets: [], status: 'error' });

    render(<DashboardView />);

    expect(screen.getByText('残高予測を読み込めませんでした')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '再読み込み' }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/予定はありません/)).not.toBeInTheDocument();
  });
});

describe('once everything has arrived', () => {
  it('lets the panels speak for themselves', () => {
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [makeCashAsset({ value: 3_000_000 })],
      status: 'ready',
    });

    render(<DashboardView />);

    // No gate left on screen: whatever the panels say now is about the data,
    // which is the only time an empty state is honest.
    expect(screen.queryByRole('status', { name: /読み込み中/ })).not.toBeInTheDocument();
    expect(screen.getByText('最小残高(90日)')).toBeInTheDocument();
  });
});
