import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getLocationSnapshot,
  navigate,
  navigateToView,
  setSearchParams,
  subscribeToLocation,
} from './navigation';

// ---------------------------------------------------------------------------
// The one module allowed to write history. What is proved here is what React
// depends on and cannot check for itself:
//
//   - subscribers are told when the address moves, and only then;
//   - the snapshot's IDENTITY is stable while the address is not moving
//     (a fresh object every read makes useSyncExternalStore loop forever);
//   - a redundant navigation does not stack a history entry the back button
//     then has to be pressed twice to escape.
// ---------------------------------------------------------------------------

const href = (): string => window.location.pathname + window.location.search;

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('the location snapshot', () => {
  it('reports the current path and query', () => {
    window.history.replaceState(null, '', '/entries?month=2026-01');
    expect(getLocationSnapshot()).toEqual({ pathname: '/entries', search: '?month=2026-01' });
  });

  it('keeps the same object while the address does not move', () => {
    const first = getLocationSnapshot();
    expect(getLocationSnapshot()).toBe(first);
  });

  it('returns a new object once the address moves', () => {
    const before = getLocationSnapshot();
    navigate('/analytics');
    expect(getLocationSnapshot()).not.toBe(before);
    expect(getLocationSnapshot().pathname).toBe('/analytics');
  });
});

describe('navigate', () => {
  it('notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToLocation(listener);
    navigate('/history');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    subscribeToLocation(listener)();
    navigate('/history');
    expect(listener).not.toHaveBeenCalled();
  });

  it('does nothing when already at the address', () => {
    navigate('/assets');
    const listener = vi.fn();
    const unsubscribe = subscribeToLocation(listener);
    const pushState = vi.spyOn(window.history, 'pushState');

    navigate('/assets');

    expect(pushState).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    pushState.mockRestore();
    unsubscribe();
  });

  it('replaces rather than pushes when asked', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    navigate('/settings', { replace: true });
    expect(pushState).not.toHaveBeenCalled();
    expect(href()).toBe('/settings');
    pushState.mockRestore();
  });
});

describe('navigateToView', () => {
  it('goes to the screen\'s canonical path', () => {
    navigateToView('analytics');
    expect(href()).toBe('/analytics');
  });

  it('drops the previous screen\'s filters', () => {
    // A filter belongs to the screen that defined it. Carrying `?month=` from
    // 収支管理 into 分析 would hand the next screen a filter nobody chose -- and
    // the two screens deliberately reuse the name.
    window.history.replaceState(null, '', '/entries?month=2026-01');
    navigateToView('analytics');
    expect(href()).toBe('/analytics');
  });
});

describe('setSearchParams', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/entries');
  });

  it('adds a parameter, keeping the path', () => {
    setSearchParams({ month: '2026-03' });
    expect(href()).toBe('/entries?month=2026-03');
  });

  it('removes a parameter when given null', () => {
    setSearchParams({ month: '2026-03' });
    setSearchParams({ month: null });
    // Not `/entries?` -- an empty query string would be a second address for
    // the same screen.
    expect(href()).toBe('/entries');
  });

  it('leaves other parameters alone', () => {
    window.history.replaceState(null, '', '/dashboard?period=1y');
    setSearchParams({ flow: '2026-02' });
    expect(href()).toBe('/dashboard?period=1y&flow=2026-02');
  });

  it('composes when called twice in a row', () => {
    // 分析 writes its span and clears its month in one handler, as two calls.
    // Each has to read the address the previous one just left.
    window.history.replaceState(null, '', '/analytics?month=2026-02');
    setSearchParams({ period: '1y' });
    setSearchParams({ month: null });
    expect(href()).toBe('/analytics?period=1y');
  });

  it('replaces by default, so the back button leaves the screen', () => {
    // Paging months with pushState would put one entry in the history per
    // click, and the back button would walk months instead of going back.
    const pushState = vi.spyOn(window.history, 'pushState');
    setSearchParams({ month: '2026-03' });
    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });
});
