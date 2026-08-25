import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SankeyChart from './index';
import { setApi } from '../../../lib/api';
import { createMockApi } from '../../../test/mock-api';
import { useTemplateStore } from '../../../stores/useTemplateStore';
import { useCategoryStore } from '../../../stores/useCategoryStore';
import { useMonthlyStore } from '../../../stores/useMonthlyStore';
import { makeTemplate, monthlyOn } from '../../../test/factories';
import type { AppApi, Category } from '../../../types';

// ---------------------------------------------------------------------------
// The panel that was left ungated.
//
// Its empty state is 「データがありません」 -- a positive claim about the
// household's month, and a false one while the templates or that month's
// amounts are still in flight. The dashboard's shared readiness does not cover
// it, because this panel has its OWN month selector: the user can page back to a
// month nothing else on the screen ever fetched.
// ---------------------------------------------------------------------------

const FIXED_TODAY = new Date(2026, 5, 20); // 2026-06-20

const SALARY: Category = {
  id: 1, name: '給与', type: 'income', color: '#22c55e', sortOrder: 0, costType: null,
};
const HOUSING: Category = {
  id: 2, name: '住居費', type: 'expense', color: '#f87171', sortOrder: 1, costType: 'fixed',
};

let api: AppApi;

/**
 * Gives every element a measured width, which happy-dom otherwise reports as 0.
 *
 * SankeyCanvas sizes itself from the container, so without this the diagram is
 * never drawn in a test and every assertion about it passes vacuously -- which
 * is exactly what happened: the only test naming the diagram asserted on the
 * card's HEADING, so the graph could disappear entirely with nothing failing.
 * It disappeared twice before this helper existed.
 */
function givenContainerWidth(px: number): void {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => px,
  });
}

afterEach(() => {
  // Back to happy-dom's own answer, so this cannot leak into other files.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 0,
  });
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_TODAY);

  api = createMockApi();
  setApi(api);
  useCategoryStore.setState({ categories: [SALARY, HOUSING] });
  useTemplateStore.setState({
    templates: [
      makeTemplate({ id: 1, name: '給料', type: 'income', categoryId: 1, defaultAmount: 400_000, recurrence: monthlyOn(25) }),
      makeTemplate({ id: 2, name: '家賃', type: 'expense', categoryId: 2, defaultAmount: 100_000, recurrence: monthlyOn(27) }),
    ],
    status: 'ready',
  });
  useMonthlyStore.getState().reset();
});

afterEach(() => {
  setApi(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('while the month is still in flight', () => {
  it('does not claim the household has no data', () => {
    api.getMonthlyAmounts = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<SankeyChart />);

    expect(screen.queryByText('データがありません')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('キャッシュフローを読み込み中');
  });

  it('does not claim it while the TEMPLATES are still in flight either', () => {
    // Both inputs matter: the diagram is built from templates and amounts, and
    // an empty template list looks exactly like a household with no entries.
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    useTemplateStore.setState({ templates: [], status: 'loading' });
    render(<SankeyChart />);

    expect(screen.queryByText('データがありません')).not.toBeInTheDocument();
  });
});

describe('when the month could not be fetched', () => {
  it('offers a retry that re-runs THIS month, not the whole ledger load', async () => {
    // loadLedgerData deliberately skips per-month data, so the default retry
    // would re-fetch everything except what failed -- a button that visibly does
    // nothing.
    const user = userEvent.setup();
    api.getMonthlyAmounts = vi
      .fn()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValue([]);

    render(<SankeyChart />);

    await user.click(await screen.findByRole('button', { name: '再読み込み' }));

    expect(api.getMonthlyAmounts).toHaveBeenCalledTimes(2);
  });

  it('re-runs it even though that month was already asked for once', async () => {
    // The dedupe used to be a ref remembering which months had been REQUESTED,
    // which is the wrong memory: a month whose fetch failed was requested, so
    // the retry could never re-run it.
    const user = userEvent.setup();
    api.getMonthlyAmounts = vi.fn().mockRejectedValue(new Error('nope'));

    render(<SankeyChart />);
    await user.click(await screen.findByRole('button', { name: '再読み込み' }));

    expect(api.getMonthlyAmounts).toHaveBeenCalledTimes(2);
  });
});

describe('once everything has arrived', () => {
  it('draws the month', async () => {
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    render(<SankeyChart />);

    expect(await screen.findByText('今月のキャッシュフロー')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('actually draws the DIAGRAM, not just the card around it', async () => {
    // The heading and the 収入/支出/差引 footer render whatever the diagram
    // does, so asserting on them says nothing about whether a graph is on
    // screen. This is the assertion whose absence let the diagram vanish.
    givenContainerWidth(1000);
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    const { container } = render(<SankeyChart />);

    await screen.findByText('今月のキャッシュフロー');
    const svg = container.querySelector('svg:not([aria-hidden="true"])');
    expect(svg, 'the flow diagram').not.toBeNull();
    // Bands, not just an empty canvas.
    expect(svg!.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('still draws it in a dashboard column, not only across a whole row', async () => {
    // ~314px is what a third of the dashboard's row leaves inside the card.
    // With fixed 130px side margins that left 54px of diagram and rendered
    // nothing -- which is how adding a card beside this one deleted the graph.
    givenContainerWidth(314);
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    const { container } = render(<SankeyChart />);

    await screen.findByText('今月のキャッシュフロー');
    expect(container.querySelector('svg:not([aria-hidden="true"])')).not.toBeNull();
  });

  it('still draws it on a phone', async () => {
    // ~295px is the card's content width at 375px. The mobile release shipped
    // with this panel blank on every phone, and no test noticed.
    givenContainerWidth(295);
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    const { container } = render(<SankeyChart />);

    await screen.findByText('今月のキャッシュフロー');
    expect(container.querySelector('svg:not([aria-hidden="true"])')).not.toBeNull();
  });

  it('says why it cannot draw, rather than leaving a hole', async () => {
    // A panel that renders its heading, its totals, and nothing in between is
    // the same class of mistake as an empty state that makes a false claim: the
    // screen stops telling the truth about what it knows.
    givenContainerWidth(140);
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    const { container } = render(<SankeyChart />);

    await screen.findByText('今月のキャッシュフロー');
    expect(container.querySelector('svg:not([aria-hidden="true"])')).toBeNull();
    expect(screen.getByText(/この幅ではフロー図を表示できません/)).toBeInTheDocument();
  });

  it('says so honestly when the month really is empty', async () => {
    // The claim is only false while loading. A household with nothing enabled
    // should still be told there is nothing.
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    useTemplateStore.setState({ templates: [], status: 'ready' });
    render(<SankeyChart />);

    expect(await screen.findByText('データがありません')).toBeInTheDocument();
  });
});

describe('paging to another month', () => {
  it('fetches the month it moves to', async () => {
    const user = userEvent.setup();
    api.getMonthlyAmounts = vi.fn().mockResolvedValue([]);
    render(<SankeyChart />);

    await screen.findByText('今月のキャッシュフロー');
    await user.click(screen.getByRole('button', { name: '前の月' }));

    expect(api.getMonthlyAmounts).toHaveBeenCalledWith('2026-05');
  });

  it('gates the new month until ITS data lands', async () => {
    // The whole reason this panel cannot use the dashboard's shared readiness:
    // the user can page to a month nothing else on the screen fetched.
    const user = userEvent.setup();
    api.getMonthlyAmounts = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockReturnValue(new Promise(() => {}));

    render(<SankeyChart />);
    await screen.findByText('今月のキャッシュフロー');

    await user.click(screen.getByRole('button', { name: '前の月' }));

    expect(screen.getByRole('status')).toHaveTextContent('キャッシュフローを読み込み中');
    expect(screen.queryByText('データがありません')).not.toBeInTheDocument();
  });
});
