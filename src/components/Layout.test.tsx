import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import Layout from './Layout';
import { setApi } from '../lib/api';
import { createMockApi } from '../test/mock-api';
import { useAssetStore } from '../stores/useAssetStore';
import { useTemplateStore } from '../stores/useTemplateStore';
import { useMonthlyStore } from '../stores/useMonthlyStore';
import { useSessionStore } from '../stores/useSessionStore';
import { useUIStore } from '../stores/useUIStore';
import { makeCashAsset, makeCashCategory } from '../test/factories';
import { VIEW_SEGMENT } from '../app/routes';

// ---------------------------------------------------------------------------
// The shell, on a phone as well as a desktop.
//
// The layout split is pure CSS (`md:` / `md:hidden`), so a JSDOM test cannot see
// WHICH half is visible -- it has no viewport and applies no media queries. What
// it CAN prove, and what actually matters, is that both halves exist and that
// neither is missing something the other has:
//
//   A control that exists only in the desktop shell is a control a phone user
//   cannot reach at all. That is the failure this file guards, and it is the one
//   a "does it look right" check would miss, because on a desktop it looks fine.
//
// The navigation items are LINKS, not buttons -- each one changes the address,
// and being a real `<a href>` is what makes middle-click, cmd-click and "copy
// link address" work. The queries below say `link` for that reason; see
// src/components/sidebar/Navigation.tsx.
// ---------------------------------------------------------------------------

const noop = (): void => {};

beforeEach(() => {
  setApi(createMockApi());
  useUIStore.setState({ sidebarCollapsed: false });
  useSessionStore.setState({
    session: {
      user: { id: 1, email: 'a@example.com', displayName: 'A' },
      ledgers: [
        { id: 1, slug: 'household', name: '家計', kind: 'shared' },
        { id: 2, slug: 'private', name: '個人', kind: 'personal' },
      ],
    },
    activeLedgerId: 1,
  });
  useAssetStore.setState({
    categories: [makeCashCategory()],
    assets: [makeCashAsset({ value: 500_000 })],
    status: 'ready',
  });
  useTemplateStore.setState({ templates: [], status: 'ready' });
  useMonthlyStore.getState().reset();
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('both shells', () => {
  it('offer the same set of screens', () => {
    // The list lives in ONE component with two orientations for exactly this
    // reason: a screen added to a hand-written phone bar and forgotten in the
    // sidebar (or the reverse) would exist on one device and not the other, and
    // nothing would catch it.
    render(
      <Layout currentView="dashboard" onNavigate={noop}>
        <div />
      </Layout>,
    );

    for (const label of ['ダッシュボード', '収支管理', '履歴', '分析', '資産', '設定']) {
      expect(screen.getAllByRole('link', { name: label })).toHaveLength(2);
    }
  });

  it('both reach the ledger switcher and the balance', async () => {
    // On a desktop these live in the sidebar. A phone has no sidebar, so
    // without a second copy the ledger's NAME -- the thing that says whose
    // figures these are -- would be invisible on the device most likely to be
    // handed to someone else.
    render(
      <Layout currentView="dashboard" onNavigate={noop}>
        <div />
      </Layout>,
    );

    expect(screen.getAllByText('現在の残高').length).toBeGreaterThanOrEqual(2);
    // `find`, not `get`: 今月のサマリー fetches its own month and shows a
    // loading gate until the figures land, so on the first frame the only
    // matching text is 「今月のサマリーを読み込み中」. Waiting for the real
    // heading also proves the fetch resolves in BOTH copies rather than one of
    // them being stuck.
    expect((await screen.findAllByText('今月のサマリー')).length).toBeGreaterThanOrEqual(2);
  });

  it('names the phone navigation for a screen reader', () => {
    render(
      <Layout currentView="dashboard" onNavigate={noop}>
        <div />
      </Layout>,
    );

    // BOTH navigations carry the name. JSDOM applies no stylesheet, so it sees
    // both -- in a browser exactly one is `display: none` and therefore absent
    // from the accessibility tree and the tab order.
    const navs = screen.getAllByRole('navigation', { name: 'メインナビゲーション' });
    expect(navs).toHaveLength(2);

    // Counted from VIEW_SEGMENT rather than written out. The point of this
    // assertion is that the two shells offer the SAME screens -- a screen added
    // to the sidebar and forgotten in the phone's tab bar exists on a desktop
    // and not on a phone. A hard-coded number turns that into a failure about
    // arithmetic, which the next person fixes by editing the number.
    const screens = Object.keys(VIEW_SEGMENT).length;
    for (const nav of navs) {
      expect(within(nav).getAllByRole('link')).toHaveLength(screens);
    }
  });
});

describe('the current screen', () => {
  it('is marked in both shells, not just the visible one', () => {
    // `aria-current` is what a screen reader announces. Setting it only on the
    // sidebar would leave a phone user with no indication of where they are.
    render(
      <Layout currentView="assets" onNavigate={noop}>
        <div />
      </Layout>,
    );

    const marked = screen
      .getAllByRole('link', { name: '資産' })
      .filter((b) => b.getAttribute('aria-current') === 'page');
    expect(marked).toHaveLength(2);
  });
});

describe('the desktop sidebar', () => {
  it('drops the labels when collapsed, keeping the accessible name', () => {
    // Collapsed, the links are icons. Without the aria-label they would be
    // unnamed to a screen reader -- and the phone bar has to keep its labels
    // regardless, which is why `collapsed` is ignored there.
    useUIStore.setState({ sidebarCollapsed: true });
    render(
      <Layout currentView="dashboard" onNavigate={noop}>
        <div />
      </Layout>,
    );

    expect(screen.getAllByRole('link', { name: '資産' })).toHaveLength(2);
    // The balance panel needs width, so it is the sidebar copy that disappears.
    expect(screen.getAllByText('現在の残高')).toHaveLength(1);
  });
});

describe('the content', () => {
  it('renders its children', () => {
    render(
      <Layout currentView="dashboard" onNavigate={noop}>
        <p>本文</p>
      </Layout>,
    );

    expect(screen.getByText('本文')).toBeInTheDocument();
  });
});
