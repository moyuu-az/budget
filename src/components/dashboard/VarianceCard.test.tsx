import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import VarianceCard from './VarianceCard';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { useMonthlyStore } from '../../stores/useMonthlyStore';
import { makeTemplate } from '../../test/factories';
import type { AppApi, Category } from '../../types';

// ---------------------------------------------------------------------------
// 先月の予実, on the dashboard.
//
// The actuals have existed since before this change and appeared only in 分析 --
// and anyone who reaches 分析 is already thinking about their spending. The
// household that needs to hear 「先月は予算より ¥32,000 多く使いました」 is the
// one that opens the dashboard and leaves.
//
// The claim under test is what the card is allowed to CLAIM. An entry nobody has
// recorded is not an entry they spent ¥0 on, and a card that counted it would
// congratulate the household most loudly exactly when it knows least.
// ---------------------------------------------------------------------------

const FIXED_TODAY = new Date(2026, 5, 20); // 2026-06-20 -> last month is 2026-05
const LAST_MONTH = '2026-05';

const HOUSING: Category = {
  id: 1, name: '住居費', type: 'expense', color: '#f87171', sortOrder: 0, costType: 'fixed',
};

const RENT = makeTemplate({ id: 1, name: '家賃', categoryId: 1, defaultAmount: 100_000 });
const FOOD = makeTemplate({ id: 2, name: '食費', categoryId: 1, defaultAmount: 60_000 });

let api: AppApi;

const seedActuals = (pairs: Array<[number, number]>): void => {
  useMonthlyStore.setState({
    monthlyAmountsMap: new Map(),
    monthlyActualsMap: new Map([[LAST_MONTH, new Map(pairs)]]),
  });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_TODAY);

  api = createMockApi();
  setApi(api);
  useCategoryStore.setState({ categories: [HOUSING] });
  useTemplateStore.setState({ templates: [RENT, FOOD], status: 'ready' });
  useMonthlyStore.setState({ monthlyAmountsMap: new Map(), monthlyActualsMap: new Map() });
});

afterEach(() => {
  setApi(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('when actuals have been recorded', () => {
  it('states the gap between plan and reality', () => {
    seedActuals([[1, 100_000], [2, 92_000]]);
    render(<VarianceCard />);

    expect(screen.getByText('5月の予定と実績')).toBeInTheDocument();
    expect(screen.getByTestId('variance-total')).toHaveTextContent('+¥32,000');
    expect(screen.getByText('超過')).toBeInTheDocument();
  });

  it('names the largest overspend first', () => {
    // The reader is looking for what went wrong. Sorting by amount would bury a
    // ¥32,000 overrun under a rent that landed exactly as planned.
    seedActuals([[1, 100_000], [2, 92_000]]);
    render(<VarianceCard />);

    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('食費');
    expect(rows[0]).toHaveTextContent('+¥32,000');
  });

  it('says 予算内 when the month came in under plan', () => {
    seedActuals([[1, 95_000], [2, 55_000]]);
    render(<VarianceCard />);

    expect(screen.getByText('予算内')).toBeInTheDocument();
    expect(screen.getByTestId('variance-total')).toHaveTextContent('-¥10,000');
  });

  it('reports what has NOT been recorded rather than folding it in', () => {
    // A surplus with entries still unrecorded is a very different story from the
    // same surplus with none, and only one of them is good news.
    seedActuals([[1, 95_000]]);
    render(<VarianceCard />);

    // 家賃 only: ¥100,000 planned, ¥95,000 actual. 食費's ¥60,000 plan is NOT
    // counted, which would otherwise show a ¥65,000 surplus.
    expect(screen.getByTestId('variance-total')).toHaveTextContent('-¥5,000');
    expect(screen.getByText('未入力 1 件は比較に含まれていません')).toBeInTheDocument();
  });
});

describe('when nothing has been recorded', () => {
  it('says so instead of reporting a perfect month', () => {
    // Counting plans alone would report that every month went exactly as
    // planned -- the most misleading possible answer.
    render(<VarianceCard />);

    expect(screen.getByText(/5月の実績が記録されていません/)).toBeInTheDocument();
    expect(screen.queryByText('予算内')).not.toBeInTheDocument();
    expect(screen.queryByText('超過')).not.toBeInTheDocument();
  });

  it('says where to record them', () => {
    render(<VarianceCard />);
    expect(screen.getByText(/収支管理の「実績」欄/)).toBeInTheDocument();
  });
});

describe('while the templates are still in flight', () => {
  it('says it is loading rather than claiming nothing was recorded', () => {
    useTemplateStore.setState({ templates: [], status: 'loading' });
    render(<VarianceCard />);

    expect(screen.getByRole('status')).toHaveTextContent('先月の予実を読み込み中');
  });

  it('offers a retry when the fetch failed', () => {
    useTemplateStore.setState({ templates: [], status: 'error' });
    render(<VarianceCard />);

    expect(screen.getByText('先月の予実を読み込めませんでした')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument();
  });
});

describe('fetching', () => {
  it('asks for LAST month, which nothing else on the dashboard loads', () => {
    // The forecast range starts at THIS month, so without this the card would
    // silently compare an empty map and report nothing recorded.
    render(<VarianceCard />);

    expect(api.getMonthlyActuals).toHaveBeenCalledWith(LAST_MONTH);
    expect(api.getMonthlyAmounts).toHaveBeenCalledWith(LAST_MONTH);
  });
});
