import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import KpiHero from './KpiHero';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useAssetStore } from '../../stores/useAssetStore';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { makeCashAsset, makeCashCategory, monthlyOn } from '../../test/factories';
import type { EntryTemplate } from '../../types';

// ---------------------------------------------------------------------------
// The false 残高不足, tested where the user would have seen it.
//
// The balance and the expense templates arrive in separate responses, and the
// balance is the later of the two often enough to matter. In that window this
// component held real expenses and a not-yet-loaded ¥0 balance -- and rendered
// 「最小残高(90日) ¥0 / 残高不足」 in red, on every cold load, with nothing on
// screen saying anything was still loading.
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
  // The templates have landed; the balance has not. This is the exact interval
  // that produced the false alarm.
  useTemplateStore.setState({ templates: [rent], status: 'ready' });
  useAssetStore.setState({ categories: [], assets: [], status: 'idle' });
  useSettingsStore.setState({ settings: { minBalanceThreshold: 50_000 }, status: 'ready' });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('while the balance is still in flight', () => {
  it('raises no shortfall warning', () => {
    render(<KpiHero />);

    expect(screen.queryByText('残高不足')).not.toBeInTheDocument();
    expect(screen.queryByText('注意')).not.toBeInTheDocument();
  });

  it('shows no figures at all, and says it is loading', () => {
    render(<KpiHero />);

    expect(screen.queryByText('最小残高(90日)')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: '残高を読み込み中' })).toBeInTheDocument();
  });
});

describe('when the fetch failed', () => {
  it('says so and offers to try again, instead of pulsing forever', () => {
    // A failure folded into "not ready yet" is a skeleton with no end and no
    // explanation: the error toast has already faded, the page looks like it is
    // still working, and reloading is the only way out -- which nothing says.
    useAssetStore.setState({ categories: [], assets: [], status: 'error' });

    render(<KpiHero />);

    expect(screen.getByText('残高を読み込めませんでした')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument();
    // And still no fabricated warning.
    expect(screen.queryByText('残高不足')).not.toBeInTheDocument();
  });
});

describe('once the balance lands', () => {
  it('shows the KPIs computed from it', () => {
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [makeCashAsset({ value: 3_000_000 })],
      status: 'ready',
    });

    render(<KpiHero />);

    // Scoped to the card, because 安全 is now a badge on two of them -- 最小残高
    // and 残高がもつ期間 both say it when there is nothing to warn about.
    const minCard = screen.getByText('最小残高(90日)').closest('div')!.parentElement!;
    expect(minCard).toHaveTextContent('安全');
    expect(screen.queryByText('残高不足')).not.toBeInTheDocument();
  });

  it('says what is free to spend, and when the next income arrives', () => {
    // The figure this row was missing. 「90日後の最小残高」 is true and
    // unactionable; this is the same projection asked as a question the
    // household can answer today.
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [makeCashAsset({ value: 3_000_000 })],
      status: 'ready',
    });
    useTemplateStore.setState({
      templates: [
        rent,
        {
          ...rent, id: 2, name: '給料', type: 'income',
          recurrence: monthlyOn(25), defaultAmount: 400_000,
        },
      ],
      status: 'ready',
    });

    render(<KpiHero />);

    expect(screen.getByText('使っていい額')).toBeInTheDocument();
    expect(screen.getByText(/給料まであと\d+日/)).toBeInTheDocument();
  });

  it('reports a SHORTFALL rather than a negative allowance', () => {
    // 「-¥12,000 使えます」 is not a sentence.
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [makeCashAsset({ value: 55_000 })],
      status: 'ready',
    });

    render(<KpiHero />);

    expect(screen.getByText('不足額')).toBeInTheDocument();
    expect(screen.queryByText('使っていい額')).not.toBeInTheDocument();
  });

  it('measures 安全/注意 against the HOUSEHOLD’s floor, not a constant', () => {
    // 50,000 was hard-coded here, which made 「安全」 mean the same thing for
    // every household -- and nothing on screen said where it came from.
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [makeCashAsset({ value: 3_000_000 })],
      status: 'ready',
    });
    // A household that wants to keep three million on hand is NOT safe at
    // 3,000,000 minus a month of rent.
    useSettingsStore.setState({ settings: { minBalanceThreshold: 3_000_000 }, status: 'ready' });

    render(<KpiHero />);

    const minCard = screen.getByText('最小残高(90日)').closest('div')!.parentElement!;
    expect(minCard).toHaveTextContent('注意');
  });

  it('says the floor is ALREADY below, rather than 「あと0日」 or 「安全」', () => {
    // The pair that used to contradict each other: 使っていい額 correctly
    // reported a shortfall while 残高がもつ期間 said 「90日以上・安全」, in the
    // same row. 「あと0日」 would be no better -- it reads as a forecast about
    // tomorrow rather than a fact about today.
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [makeCashAsset({ value: 10_000 })],
      status: 'ready',
    });

    render(<KpiHero />);

    expect(screen.getByText('すでに下回っています')).toBeInTheDocument();
    expect(screen.getByText('不足額')).toBeInTheDocument();
    expect(screen.queryByText('90日以上')).not.toBeInTheDocument();
    expect(screen.queryByText('あと0日')).not.toBeInTheDocument();
  });

  it('says 90日以上 rather than claiming the balance never runs out', () => {
    // Null from `runway` means "not within the window this KPI looks at". Saying
    // 「割りません」 would be a claim the projection cannot support.
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [makeCashAsset({ value: 10_000_000 })],
      status: 'ready',
    });

    render(<KpiHero />);

    expect(screen.getByText('90日以上')).toBeInTheDocument();
  });

  it('does raise the warning when the balance really is too low', () => {
    // The other half: the guard must not have turned the alarm off.
    useAssetStore.setState({
      categories: [makeCashCategory()],
      assets: [makeCashAsset({ value: 1_000 })],
      status: 'ready',
    });

    render(<KpiHero />);

    expect(screen.getByText('残高不足')).toBeInTheDocument();
  });
});
