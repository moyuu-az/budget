import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EntriesView from './EntriesView';
import { Dialog } from '../ui/Dialog';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { useMonthlyStore } from '../../stores/useMonthlyStore';
import { makeTemplate, monthlyOn } from '../../test/factories';
import type { Category } from '../../types';

// ---------------------------------------------------------------------------
// Layout facts a JSDOM test can actually hold.
//
// It has no viewport and applies no media queries, so nothing here can prove
// "this looks right at 375px". What it CAN pin is the STRUCTURE the narrow
// layout depends on -- and each of these was a real, invisible-on-a-desktop
// failure before it was pinned:
//
//   - the entry row's fixed columns added up to 342px, leaving about one pixel
//     for the name inside a card on a 375px screen. Nothing overflowed (the
//     name is truncated), so every row simply read as two figures with no label
//   - a dialog taller than the screen was clipped with nothing to scroll, so
//     its 保存 button could not be reached at all
//
// Both are invisible on a laptop, which is exactly why they need a test rather
// than an eye.
// ---------------------------------------------------------------------------

const HOUSING: Category = {
  id: 1, name: '住居費', type: 'expense', color: '#f87171', sortOrder: 0, costType: 'fixed',
};

const RENT = makeTemplate({
  id: 1, name: 'クレジットカード引き落とし', type: 'expense', categoryId: 1,
  defaultAmount: 100_000, recurrence: monthlyOn(27),
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 5, 4));
  setApi(createMockApi());
  useCategoryStore.setState({ categories: [HOUSING] });
  useTemplateStore.setState({ templates: [RENT], status: 'ready' });
  useMonthlyStore.getState().reset();
});

afterEach(() => {
  setApi(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the entry row on a narrow screen', () => {
  it('puts the amounts on their own line, freeing the whole width for the name', () => {
    const { container } = render(<EntriesView />);

    // The wrapper is the ancestor that carries `sm:w-auto` -- `.w-full` alone
    // also matches the cell's own button.
    const amounts = container
      .querySelector('[data-entry-cell="planned"]')
      ?.closest('[class*="sm:w-auto"]');
    expect(amounts).not.toBeNull();
    expect(amounts?.className).toContain('w-full');
  });

  it('lets the row wrap at all', () => {
    // Without flex-wrap the amounts cannot move to a second line, and w-full
    // would squash the name to nothing instead.
    const { container } = render(<EntriesView />);
    const row = container.querySelector('[data-entry-cell="planned"]')?.closest('.flex-wrap');
    expect(row).not.toBeNull();
  });

  it('labels each amount, because the column headers are gone', () => {
    // A header row above a two-line list lines up with nothing, so it is hidden
    // and the cells say what they are. Without this the second line is two bare
    // figures.
    const { container } = render(<EntriesView />);

    // Scoped to the cells: 「実績」 is also the wide-screen column header, which
    // is present in the DOM (hidden by CSS, which JSDOM does not apply).
    const planned = container.querySelector('[data-entry-cell="planned"]');
    const actual = container.querySelector('[data-entry-cell="actual"]');
    expect(planned).toHaveTextContent('予定');
    expect(actual).toHaveTextContent('実績');
    // And each label is itself hidden above the breakpoint, where the header
    // takes over.
    expect(planned?.querySelector('.sm\\:hidden')).not.toBeNull();
  });

  it('hides the wide-screen column headers below the breakpoint', () => {
    const { container } = render(<EntriesView />);
    // Found by its 項目 cell rather than by the row's whole text: the header has
    // two empty spacer divs, so its textContent is not a plain concatenation of
    // the visible labels.
    const label = Array.from(container.querySelectorAll('div')).find(
      (d) => d.textContent === '項目',
    );
    const header = label?.parentElement;
    expect(header, 'the wide-screen column header').toBeTruthy();
    expect(header!.className).toContain('hidden');
    expect(header!.className).toContain('sm:flex');
  });

  it('keeps the entry name reachable and named', () => {
    render(<EntriesView />);
    expect(screen.getByText('クレジットカード引き落とし')).toBeInTheDocument();
  });

  it('gives the edit button an accessible name', () => {
    // It used to be an icon with only a `title`, which is a tooltip rather than
    // a name -- and on a touch screen there is no hover to reveal it.
    render(<EntriesView />);
    expect(
      screen.getByRole('button', { name: 'クレジットカード引き落としのテンプレートを編集' }),
    ).toBeInTheDocument();
  });
});

describe('a dialog taller than the screen', () => {
  it('scrolls inside the viewport instead of being clipped', () => {
    // The overlay centres the panel and nothing scrolls, so without this the
    // footer -- which holds 保存 -- is simply off-screen. 資産 dialogs grow by
    // one input per parameter definition, so a phone runs out of room long
    // before a laptop does.
    render(
      <Dialog open onClose={() => {}} title="長いダイアログ" footer={<button>保存</button>}>
        <div style={{ height: 4000 }} />
      </Dialog>,
    );

    const panel = screen.getByRole('dialog');
    expect(panel.className).toContain('overflow-y-auto');
    // dvh, not vh: the VISIBLE viewport, so the panel does not extend under a
    // mobile browser's chrome.
    expect(panel.className).toContain('max-h-[calc(100dvh-2rem)]');
  });

  it('still shows the footer’s action', () => {
    render(
      <Dialog open onClose={() => {}} title="長いダイアログ" footer={<button>保存</button>}>
        <div style={{ height: 4000 }} />
      </Dialog>,
    );

    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
  });
});
