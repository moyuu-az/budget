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

/**
 * Answers last month's two requests with `pairs` as its recorded actuals.
 *
 * Seeding the store directly would not work and should not: the hook's own
 * effect fires both fetches on mount, which immediately marks the month
 * 'loading' and overwrites anything put there beforehand. Going through the API
 * is also the honest test -- it is the path the card actually takes.
 */
const answerWith = (pairs: Array<[number, number]> = []): void => {
  api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
  api.getMonthlyActuals = vi.fn().mockResolvedValue(
    pairs.map(([templateId, actualAmount]) => ({
      id: templateId,
      templateId,
      yearMonth: LAST_MONTH,
      actualAmount,
      createdAt: '2026-05-31T00:00:00Z',
    })),
  );
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_TODAY);

  api = createMockApi();
  setApi(api);
  useCategoryStore.setState({ categories: [HOUSING] });
  useTemplateStore.setState({ templates: [RENT, FOOD], status: 'ready' });
  useMonthlyStore.setState({
    monthlyAmountsMap: new Map(),
    monthlyActualsMap: new Map(),
    monthStatus: new Map(),
  });
});

afterEach(() => {
  setApi(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('when actuals have been recorded', () => {
  it('states the gap between plan and reality', async () => {
    answerWith([[1, 100_000], [2, 92_000]]);
    render(<VarianceCard />);

    expect(await screen.findByText('5月の予定と実績')).toBeInTheDocument();
    expect(screen.getByTestId('variance-total')).toHaveTextContent('+¥32,000');
    expect(screen.getByText('超過')).toBeInTheDocument();
  });

  it('names the largest overspend first', async () => {
    // The reader is looking for what went wrong. Sorting by amount would bury a
    // ¥32,000 overrun under a rent that landed exactly as planned.
    answerWith([[1, 100_000], [2, 92_000]]);
    render(<VarianceCard />);

    const rows = await screen.findAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('食費');
    expect(rows[0]).toHaveTextContent('+¥32,000');
  });

  it('says 予算内 when the month came in under plan', async () => {
    answerWith([[1, 95_000], [2, 55_000]]);
    render(<VarianceCard />);

    expect(await screen.findByText('予算内')).toBeInTheDocument();
    expect(screen.getByTestId('variance-total')).toHaveTextContent('-¥10,000');
  });

  it('reports what has NOT been recorded rather than folding it in', async () => {
    // A surplus with entries still unrecorded is a very different story from the
    // same surplus with none, and only one of them is good news.
    answerWith([[1, 95_000]]);
    render(<VarianceCard />);

    // 家賃 only: ¥100,000 planned, ¥95,000 actual. 食費's ¥60,000 plan is NOT
    // counted, which would otherwise show a ¥65,000 surplus.
    expect(await screen.findByTestId('variance-total')).toHaveTextContent('-¥5,000');
    expect(screen.getByText('未入力 1 件は比較に含まれていません')).toBeInTheDocument();
  });
});

describe('an actual whose plan cannot be reconstructed', () => {
  it('is reported as real money, with no verdict attached', async () => {
    // A schedule change deletes the per-month override with it, so what was
    // budgeted then is not recorded anywhere. Comparing against the entry's
    // CURRENT default would look like a comparison and be a fabrication:
    // ¥500,000 paid against a ¥500,000 plan, schedule moved, and the card would
    // report a confident 「+¥400,000 超過」 against a ¥100,000 default nobody
    // ever budgeted.
    useTemplateStore.setState({
      templates: [
        makeTemplate({
          id: 9, name: '年払い保険', categoryId: 1, defaultAmount: 100_000,
          recurrence: { kind: 'yearly', month: 3, dayOfMonth: 1 },
        }),
      ],
      status: 'ready',
    });
    answerWith([[9, 500_000]]);
    render(<VarianceCard />);

    expect(await screen.findByText(/当時の予定額が不明な実績 1 件/)).toBeInTheDocument();
    expect(screen.getByText(/¥500,000/)).toBeInTheDocument();
    // No verdict, and no headline figure: nothing was compared.
    expect(screen.queryByText('超過')).not.toBeInTheDocument();
    expect(screen.queryByText('予算内')).not.toBeInTheDocument();
    expect(screen.queryByTestId('variance-total')).not.toBeInTheDocument();
  });

  it('does not read as 「実績が記録されていません」', async () => {
    // The money is in the database; saying it is not there is the older bug.
    useTemplateStore.setState({
      templates: [
        makeTemplate({
          id: 9, name: '年払い保険', categoryId: 1, defaultAmount: 100_000,
          recurrence: { kind: 'yearly', month: 3, dayOfMonth: 1 },
        }),
      ],
      status: 'ready',
    });
    answerWith([[9, 500_000]]);
    render(<VarianceCard />);

    await screen.findByText(/当時の予定額が不明な実績/);
    expect(screen.queryByText(/実績が記録されていません/)).not.toBeInTheDocument();
  });
});

describe('when nothing has been recorded', () => {
  it('says so instead of reporting a perfect month', async () => {
    // Counting plans alone would report that every month went exactly as
    // planned -- the most misleading possible answer.
    answerWith();
    render(<VarianceCard />);

    expect(await screen.findByText(/5月の実績が記録されていません/)).toBeInTheDocument();
    expect(screen.queryByText('予算内')).not.toBeInTheDocument();
    expect(screen.queryByText('超過')).not.toBeInTheDocument();
  });

  it('says where to record them', async () => {
    answerWith();
    render(<VarianceCard />);
    expect(await screen.findByText(/収支管理の「実績」欄/)).toBeInTheDocument();
  });
});

describe('while the data is still in flight', () => {
  it('says it is loading rather than claiming nothing was recorded', () => {
    useTemplateStore.setState({ templates: [], status: 'loading' });
    render(<VarianceCard />);

    expect(screen.getByRole('status')).toHaveTextContent('先月の予実を読み込み中');
  });

  it('waits for LAST MONTH’s own fetch, not just the templates', () => {
    // The templates are loaded by the app shell and are ready long before this
    // card's month is. With only their status the card would state 「実績が
    // 記録されていません」 in the gap -- a positive claim, briefly false.
    //
    // A request that never settles is exactly that gap, held open.
    api.getMonthlyAmounts = vi.fn().mockReturnValue(new Promise(() => {}));
    api.getMonthlyActuals = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<VarianceCard />);

    expect(screen.getByRole('status')).toHaveTextContent('先月の予実を読み込み中');
    expect(screen.queryByText(/実績が記録されていません/)).not.toBeInTheDocument();
  });

  it('offers a retry when the templates failed', () => {
    useTemplateStore.setState({ templates: [], status: 'error' });
    render(<VarianceCard />);

    expect(screen.getByText('先月の予実を読み込めませんでした')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument();
  });

  it('offers a retry when LAST MONTH’s fetch failed', async () => {
    // Permanently false otherwise: a household whose actuals exist and simply
    // could not be fetched would be told, for as long as the page stays open,
    // that it recorded nothing.
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    api.getMonthlyActuals = vi.fn().mockRejectedValue(new Error('nope'));
    render(<VarianceCard />);

    expect(await screen.findByText('先月の予実を読み込めませんでした')).toBeInTheDocument();
    expect(screen.queryByText(/実績が記録されていません/)).not.toBeInTheDocument();
  });
});

describe('fetching', () => {
  it('asks for LAST month, which nothing else on the dashboard loads', () => {
    // The forecast range starts at THIS month, so without this the card would
    // silently compare an empty map and report nothing recorded.
    answerWith();
    render(<VarianceCard />);

    expect(api.getMonthlyActuals).toHaveBeenCalledWith(LAST_MONTH);
    expect(api.getMonthlyAmounts).toHaveBeenCalledWith(LAST_MONTH);
  });
});
