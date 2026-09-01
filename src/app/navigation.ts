import type { ViewType } from '../types';
import { pathForView } from './routes';

// ---------------------------------------------------------------------------
// THE HISTORY API, EXPOSED AS SOMETHING REACT CAN SUBSCRIBE TO.
//
// `window.location` changes without telling anybody: `pushState` fires no event
// at all, and `popstate` fires only for the back/forward buttons. React cannot
// re-render on something it is not subscribed to, so this module is the one
// place that writes history and the one place that announces it.
//
// EVERY navigation goes through `navigate` here. A stray `history.pushState`
// elsewhere would change the address bar and leave the screen behind it
// unchanged -- the most confusing failure this design can produce, because the
// URL would be right and the app would be wrong.
//
// The store shape (subscribe / getSnapshot) is what `useSyncExternalStore`
// wants; see src/hooks/useRoute.ts for the React side.
// ---------------------------------------------------------------------------

export interface LocationSnapshot {
  readonly pathname: string;
  readonly search: string;
}

/**
 * What a non-browser render would see. This app has no SSR, but
 * `useSyncExternalStore` demands a server snapshot and a *stable* one -- a fresh
 * object per call makes React loop.
 */
const SERVER_SNAPSHOT: LocationSnapshot = { pathname: '/', search: '' };

const listeners = new Set<() => void>();

let snapshot: LocationSnapshot = SERVER_SNAPSHOT;
// The snapshot's identity may only change when the address actually changed:
// React compares snapshots by reference and re-renders forever if a new object
// comes back every time it looks.
let snapshotHref = '/';

const currentHref = (): string => window.location.pathname + window.location.search;

/** Re-reads the address. Returns whether it moved. */
const refresh = (): boolean => {
  const href = currentHref();
  if (href === snapshotHref) return false;
  snapshotHref = href;
  snapshot = { pathname: window.location.pathname, search: window.location.search };
  return true;
};

const emit = (): void => {
  for (const listener of listeners) listener();
};

if (typeof window !== 'undefined') {
  refresh();
  // The back and forward buttons. Without this the address bar would move and
  // the screen would stay -- see the header comment.
  window.addEventListener('popstate', () => {
    if (refresh()) emit();
  });
}

export const subscribeToLocation = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * The current address.
 *
 * Re-reads `window.location` rather than trusting the cache, so that history
 * moved by something outside this module (a test setting up a deep link, an
 * extension) is still seen. The cached object is returned unchanged when the
 * address has not moved, which is what keeps `useSyncExternalStore` stable.
 */
export const getLocationSnapshot = (): LocationSnapshot => {
  if (typeof window !== 'undefined') refresh();
  return snapshot;
};

export const getServerLocationSnapshot = (): LocationSnapshot => SERVER_SNAPSHOT;

export interface NavigateOptions {
  /**
   * Replace the current history entry instead of adding one.
   *
   * Used for filters: paging through months with `pushState` would put one
   * entry in the history per click, so the back button would walk backwards
   * through months instead of leaving the screen.
   */
  replace?: boolean;
}

/**
 * Move to an address within this app.
 *
 * A no-op when the address is already the current one -- clicking the tab you
 * are already on must not stack a duplicate history entry that the back button
 * then has to be pressed twice to escape.
 */
export const navigate = (href: string, { replace = false }: NavigateOptions = {}): void => {
  if (typeof window === 'undefined') return;
  if (href === currentHref()) return;
  if (replace) window.history.replaceState(null, '', href);
  else window.history.pushState(null, '', href);
  if (refresh()) emit();
};

/**
 * Switch screens.
 *
 * The query is deliberately DROPPED: a query parameter belongs to the screen
 * that defined it, and carrying `?month=2026-01` from 収支管理 into 分析 would
 * hand the next screen a filter its user never chose. Screens that share a
 * parameter name rely on this (see SEARCH_PARAMS).
 */
export const navigateToView = (view: ViewType, options?: NavigateOptions): void => {
  navigate(pathForView(view), options);
};

/**
 * Change filters on the current screen, keeping the path.
 *
 * A `null` value removes the parameter, which is how a filter goes back to
 * "unset" rather than being pinned to its default in the URL.
 *
 * `replace` defaults to true; see NavigateOptions for why.
 */
export const setSearchParams = (
  updates: Readonly<Record<string, string | null>>,
  { replace = true }: NavigateOptions = {},
): void => {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  navigate(`${window.location.pathname}${query ? `?${query}` : ''}`, { replace });
};
