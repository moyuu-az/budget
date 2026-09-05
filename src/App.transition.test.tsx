import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { setApi } from './lib/api';
import { createMockApi } from './test/mock-api';
import { useSessionStore } from './stores/useSessionStore';
import { useUIStore } from './stores/useUIStore';

// ---------------------------------------------------------------------------
// A NAVIGATION ENDS ON THE SCREEN THE ADDRESS NAMES.
//
// WHAT THIS FILE IS FOR, AND WHY App.test.tsx WAS NOT ENOUGH
//   App.test.tsx already checks that the address and the screen agree. Every one
//   of its cases lets the screen ARRIVE before the next thing happens, though,
//   and that is the axis the bug lived on: a screen whose chunk is still in
//   flight WHILE the user moves again.
//
//   In that window the app rendered one screen at the address of another --
//   permanently. 英単語 was opened on a slow connection, the user gave up and
//   pressed 分析, and when the 英単語 chunk finally landed it took the page, at
//   `/analytics`, under a highlighted 分析 tab. Nothing errored and nothing
//   looked broken; the page was simply the wrong one, and stayed wrong until a
//   reload.
//
//   The cause was structural: ONE Suspense boundary above `AnimatePresence
//   mode="wait"`. A suspended screen is not mounted, so it cannot animate out,
//   so the "wait" never ends. See the comment in src/App.tsx.
//
// HOW THE SLOW CHUNK IS SIMULATED
//   `lazy()` resolves instantly under vitest -- every module is already in
//   memory -- so there is no window to test. The 英単語 module is replaced with a
//   component that throws a promise until the test releases it, which is exactly
//   what a not-yet-arrived chunk does to React, under the test's control.
//
// ParticleBackground is stubbed for the same reason as in App.test.tsx: it
// builds a THREE.WebGLRenderer and happy-dom has no WebGL context.
// ---------------------------------------------------------------------------
vi.mock('./components/ParticleBackground', () => ({ default: () => null }));

interface Gate {
  promise: Promise<void>;
  release: () => void;
  released: boolean;
  /** When true the screen throws an Error instead of suspending. */
  fail: boolean;
}

const makeGate = (): Gate => {
  let resolve!: () => void;
  const gate: Gate = {
    promise: new Promise<void>((r) => {
      resolve = r;
    }),
    release: () => {
      gate.released = true;
      resolve();
    },
    released: false,
    fail: false,
  };
  return gate;
};

let gate = makeGate();

vi.mock('./components/vocab/VocabView', () => ({
  default: () => {
    // A chunk whose request 404s -- what a deploy does to a tab that was open
    // when it happened. React turns the rejected import into a thrown error at
    // exactly this point.
    if (gate.fail) throw new Error('Failed to fetch dynamically imported module');
    if (!gate.released) throw gate.promise;
    return <h1>英単語</h1>;
  },
}));

const href = (): string => window.location.pathname + window.location.search;
const SCREEN_TIMEOUT = { timeout: 5_000 };

/** Lets timers and animation frames run, inside act so React settles. */
const settle = async (ms = 600): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

/** Present in the accessibility tree, i.e. actually on screen. */
const onScreen = (heading: string): boolean =>
  screen.queryByRole('heading', { name: heading }) !== null;

beforeEach(() => {
  gate = makeGate();
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

const openApp = async (): Promise<ReturnType<typeof userEvent.setup>> => {
  render(<App />);
  await waitFor(() => expect(href()).toBe('/dashboard'));
  return userEvent.setup();
};

const clickNav = async (
  user: ReturnType<typeof userEvent.setup>,
  label: string,
): Promise<void> => {
  // Two navigations are in the tree at once (desktop sidebar and phone bar);
  // either is the same control. See Layout.test.tsx.
  await user.click(screen.getAllByRole('link', { name: label })[0]);
};

describe('a screen that is still loading', () => {
  it('does not take the page once the user has moved on', async () => {
    const user = await openApp();

    await clickNav(user, '英単語');
    expect(href()).toBe('/vocab');

    // WAIT FOR THE LOADING STATE FIRST. This is not politeness -- it is the
    // condition. The defect needed the outgoing screen to have finished
    // animating away and the incoming one to be actually SUSPENDED; pressing
    // the next tab before that reproduces nothing.
    await screen.findByRole('status', { name: '画面を読み込み中' }, SCREEN_TIMEOUT);
    expect(onScreen('英単語')).toBe(false);

    // The user gives up on the slow screen and presses another tab.
    await clickNav(user, '分析');
    expect(
      await screen.findByRole('heading', { name: '分析' }, SCREEN_TIMEOUT),
    ).toBeInTheDocument();

    // The abandoned chunk finally lands. It must not become the page.
    gate.release();
    await settle();

    expect(href()).toBe('/analytics');
    expect(onScreen('分析')).toBe(true);
    expect(onScreen('英単語')).toBe(false);
  });

  it('does not take the page once the back button has moved on', async () => {
    const user = await openApp();
    await clickNav(user, '英単語');
    // See above: the screen has to be suspended before the move for this to be
    // the case that was broken.
    await screen.findByRole('status', { name: '画面を読み込み中' }, SCREEN_TIMEOUT);

    // happy-dom keeps no real session history, so the browser's half of the
    // back button is performed here.
    await act(async () => {
      window.history.replaceState(null, '', '/history');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(
      await screen.findByRole('heading', { name: '残高履歴' }, SCREEN_TIMEOUT),
    ).toBeInTheDocument();

    gate.release();
    await settle();

    expect(href()).toBe('/history');
    expect(onScreen('残高履歴')).toBe(true);
    expect(onScreen('英単語')).toBe(false);
  });

  it('still arrives when nobody moved away', async () => {
    // The other half of the guard above: "the late chunk never wins" must not be
    // implemented by never showing it.
    const user = await openApp();
    await clickNav(user, '英単語');

    // `find`, not `get`: the outgoing screen animates away first (mode="wait"),
    // so the skeleton appears a beat after the click rather than with it.
    expect(
      await screen.findByRole('status', { name: '画面を読み込み中' }, SCREEN_TIMEOUT),
    ).toBeInTheDocument();

    gate.release();
    expect(
      await screen.findByRole('heading', { name: '英単語' }, SCREEN_TIMEOUT),
    ).toBeInTheDocument();
    expect(href()).toBe('/vocab');
  });
});

describe('rapid navigation', () => {
  it('ends on the last screen asked for', async () => {
    const user = await openApp();
    gate.release();

    // Three tabs in a row, each pressed before the previous screen settled.
    await clickNav(user, '資産');
    await clickNav(user, '英単語');
    await clickNav(user, '履歴');

    expect(href()).toBe('/history');
    expect(
      await screen.findByRole('heading', { name: '残高履歴' }, SCREEN_TIMEOUT),
    ).toBeInTheDocument();
    expect(onScreen('資産')).toBe(false);
    expect(onScreen('英単語')).toBe(false);
  });
});

describe('a screen whose chunk cannot be fetched', () => {
  it('says so instead of blanking the app', async () => {
    // A deploy renames every chunk. A tab that was open when it happened asks
    // for a file that no longer exists, and `lazy()` rejects. Without a boundary
    // that rejection unmounts the whole tree: a white page, at an address that
    // looks perfectly normal.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    gate.fail = true;

    const user = await openApp();
    await clickNav(user, '英単語');

    expect(
      await screen.findByRole('alert', undefined, SCREEN_TIMEOUT),
    ).toHaveTextContent('画面を表示できませんでした');
    // The shell is still there, which is what makes it recoverable.
    expect(screen.getAllByRole('link', { name: '分析' })[0]).toBeInTheDocument();
  });

  it('is cleared by opening a different screen', async () => {
    // The boundary belongs to the screen, not to the app. One missing chunk must
    // not latch an error over every navigation that follows.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    gate.fail = true;

    const user = await openApp();
    await clickNav(user, '英単語');
    await screen.findByRole('alert', undefined, SCREEN_TIMEOUT);

    await clickNav(user, '分析');
    expect(
      await screen.findByRole('heading', { name: '分析' }, SCREEN_TIMEOUT),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
