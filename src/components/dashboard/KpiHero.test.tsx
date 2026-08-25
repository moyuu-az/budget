import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import KpiHero from './KpiHero';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useAssetStore } from '../../stores/useAssetStore';
import { useTemplateStore } from '../../stores/useTemplateStore';
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

    expect(screen.getByText('最小残高(90日)')).toBeInTheDocument();
    // 3,000,000 against 120,000/month of rent: comfortably safe, and nowhere
    // near the 残高不足 the same templates produced against an unloaded balance.
    expect(screen.getByText('安全')).toBeInTheDocument();
    expect(screen.queryByText('残高不足')).not.toBeInTheDocument();
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
