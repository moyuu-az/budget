import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { setApi } from './lib/api';
import { createMockApi } from './test/mock-api';
import { useSessionStore } from './stores/useSessionStore';
import { useUIStore } from './stores/useUIStore';

// ---------------------------------------------------------------------------
// THE ADDRESS BAR AND THE SCREEN SAY THE SAME THING.
//
// This is the whole point of the routing change, and it is the one thing no
// unit test of the router can prove on its own: App has to READ the address on
// mount (so a reload and a pasted link land on the right screen) and WRITE it
// on every navigation (so the reload has something to land on).
//
// The failure being guarded is silent and mundane: the user is on 収支管理,
// their phone reclaims the tab, the browser reloads, and the app opens on the
// dashboard with the January figures they were entering gone.
//
// ParticleBackground is stubbed: it builds a THREE.WebGLRenderer, and happy-dom
// has no WebGL context. It is decoration and has nothing to do with routing.
// ---------------------------------------------------------------------------
vi.mock('./components/ParticleBackground', () => ({ default: () => null }));

const href = (): string => window.location.pathname + window.location.search;

beforeEach(() => {
  setApi(createMockApi());
  window.history.replaceState(null, '', '/');
  useUIStore.setState({ sidebarCollapsed: false, theme: 'dark' });
  useSessionStore.setState({
    session: {
      user: { id: 1, email: 'a@example.com', displayName: 'A' },
      ledgers: [{ id: 1, slug: 'household', name: '家計', kind: 'shared' }],
    },
    activeLedgerId: 1,
  });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('opening an address', () => {
  it('renders the screen the path names', async () => {
    window.history.replaceState(null, '', '/history');
    render(<App />);

    // The screens below the dashboard are lazy, so this waits for the chunk.
    expect(await screen.findByRole('heading', { name: '残高履歴' })).toBeInTheDocument();
  });

  it('rewrites the root to the dashboard, so one screen has one address', async () => {
    render(<App />);
    await waitFor(() => expect(href()).toBe('/dashboard'));
  });

  it('rewrites an address that names no screen', async () => {
    // A stale link or a typo lands somewhere real rather than on a blank page.
    window.history.replaceState(null, '', '/nope');
    render(<App />);
    await waitFor(() => expect(href()).toBe('/dashboard'));
  });

  it('keeps a filter while rewriting the path', async () => {
    // The rewrite is about the PATH. Stripping the query here would throw away
    // the filter on exactly the reload this feature exists to survive.
    window.history.replaceState(null, '', '/entries/?month=2026-01');
    render(<App />);

    await waitFor(() => expect(href()).toBe('/entries?month=2026-01'));
    // And the month actually reached the screen -- 収支管理 has no heading, its
    // month navigator is what says which month is being edited.
    expect(await screen.findByText('2026年1月')).toBeInTheDocument();
  });
});

describe('switching screens', () => {
  it('puts the screen in the address bar', async () => {
    render(<App />);
    await waitFor(() => expect(href()).toBe('/dashboard'));

    // Two navigations exist (desktop sidebar and phone bar); either one is the
    // same control. In JSDOM both are in the tree -- see Layout.test.tsx.
    await userEvent.click(screen.getAllByRole('link', { name: '分析' })[0]);

    expect(await screen.findByRole('heading', { name: '分析' })).toBeInTheDocument();
    expect(href()).toBe('/analytics');
  });

  it('follows the back button', async () => {
    render(<App />);
    await waitFor(() => expect(href()).toBe('/dashboard'));
    await userEvent.click(screen.getAllByRole('link', { name: '資産' })[0]);
    expect(await screen.findByRole('heading', { name: '資産' })).toBeInTheDocument();

    // happy-dom keeps no real session history, so the browser's half of the
    // back button is performed here; what is under test is that the app follows
    // it instead of leaving the previous screen on display.
    window.history.replaceState(null, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: '資産' })).not.toBeInTheDocument(),
    );
  });

  it('drops the previous screen\'s filter', async () => {
    // `month` means one thing on 収支管理 and another on 分析. Carrying it over
    // would drill 分析 into a month the user never picked.
    window.history.replaceState(null, '', '/entries?month=2026-01');
    render(<App />);
    await screen.findByText('2026年1月');

    await userEvent.click(screen.getAllByRole('link', { name: '分析' })[0]);

    expect(href()).toBe('/analytics');
  });
});
