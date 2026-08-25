import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardView from './DashboardView';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useAssetStore } from '../../stores/useAssetStore';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useMonthlyStore } from '../../stores/useMonthlyStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { makeCashAsset, makeCashCategory, monthlyOn } from '../../test/factories';
import { markForecastMonthsFetched } from '../../test/helpers';
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
  // The floor every 安全/注意 judgement is measured against. Its own readiness
  // now gates the KPI row: the default is only known to be right once the server
  // has confirmed nothing was configured.
  useSettingsStore.setState({ settings: { minBalanceThreshold: 50_000 }, status: 'ready' });
  // Covers both the default 60-day period and the 90 the KPI row asks for.
  markForecastMonthsFetched(90);
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
  it('lets the forecast panels speak for themselves', async () => {
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [makeCashAsset({ value: 3_000_000 })],
      status: 'ready',
    });

    render(<DashboardView />);

    // 先月の予実 fetches its own month and is legitimately still loading for a
    // tick, so this asserts about the FORECAST panels rather than about every
    // gate on the page -- and waits for that one to settle before checking that
    // nothing else is left waiting.
    expect(await screen.findByText('最小残高(90日)')).toBeInTheDocument();
    await screen.findByText(/実績が記録されていません/);
    expect(screen.queryByRole('status', { name: /読み込み中/ })).not.toBeInTheDocument();
  });

  it('gates the KPI row until the household’s floor is known', () => {
    // The default is only trustworthy once the server has confirmed nothing was
    // configured. A ledger whose floor is 300,000 and whose settings request is
    // in flight would otherwise have 使っていい額 computed against 50,000.
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [makeCashAsset({ value: 3_000_000 })],
      status: 'ready',
    });
    useSettingsStore.setState({ settings: { minBalanceThreshold: 50_000 }, status: 'loading' });

    render(<DashboardView />);

    expect(screen.queryByText('最小残高(90日)')).not.toBeInTheDocument();
    expect(screen.queryByText('使っていい額')).not.toBeInTheDocument();
  });
});
