import type { ViewType } from '../types';

// ---------------------------------------------------------------------------
// THE URL IS PART OF THE STATE, AND THIS FILE IS THE ONLY DESCRIPTION OF IT.
//
// WHY THIS EXISTS
//   The screen used to live in `useState` inside App. Reloading -- which a phone
//   does on its own, whenever the browser reclaims the tab -- threw the screen
//   away and dropped the user back on the dashboard, together with whichever
//   month or period they were looking at. A link to "our January entries" could
//   not be sent to the other member of the household at all.
//
// WHAT GOES IN THE URL AND WHAT DOES NOT
//   The path plus the query answers ONE question: *what is on screen*. Which
//   screen, which month, which span. That is what has to survive a reload and
//   what is worth pasting into a message.
//
//   Presentation preferences that belong to the DEVICE rather than to the thing
//   on screen -- theme, whether the sidebar is collapsed, the 現金/純資産 lens --
//   stay in the persisted UI store (src/stores/useUIStore.ts). They already
//   survive a reload, and putting them in a link would mean sharing a screen
//   also imposes your theme on the other person.
//
// WHY A HAND-WRITTEN MATCHER AND NOT A ROUTER LIBRARY
//   Six flat routes with no nesting, no loaders and no code-split boundaries of
//   their own (App already lazy-loads the screens). A router would add a
//   dependency and its own idea of how navigation works in exchange for a Map
//   lookup. If nested routes ever appear, THIS is the file to replace.
// ---------------------------------------------------------------------------

/**
 * The screen -> the path segment that names it.
 *
 * `satisfies Record<ViewType, string>` rather than a plain type annotation: the
 * mapped type turns a NEW screen into a compile error right here (you must give
 * it a segment), while every value keeps its literal type so `pathForView`
 * returns a known string rather than `string`.
 *
 * A screen without an entry would be reachable only by clicking -- which is the
 * exact failure this module exists to remove.
 */
export const VIEW_SEGMENT = {
  dashboard: 'dashboard',
  entries: 'entries',
  history: 'history',
  analytics: 'analytics',
  assets: 'assets',
  settings: 'settings',
} as const satisfies Record<ViewType, string>;

/**
 * Where `/`, an unknown path, and a link to a screen that no longer exists all
 * land. The dashboard, because it is the screen the app opens on and the only
 * one that states nothing about a *particular* month.
 */
export const DEFAULT_VIEW: ViewType = 'dashboard';

const SEGMENT_TO_VIEW: ReadonlyMap<string, ViewType> = new Map(
  (Object.entries(VIEW_SEGMENT) as Array<[ViewType, string]>).map(([view, segment]) => [
    segment,
    view,
  ]),
);

/** The canonical path for a screen. One screen, one address. */
export const pathForView = (view: ViewType): string => `/${VIEW_SEGMENT[view]}`;

export interface RouteMatch {
  view: ViewType;
  /**
   * Whether the path actually NAMED this screen, as opposed to falling back to
   * it.
   *
   * The caller uses this to decide what to do with the query when it rewrites
   * the address: `/entries/?month=2026-01` is 収支管理 with a filter and the
   * filter must survive, while `/nope?month=2026-01` is a stale link whose
   * query belongs to no screen and would be a filter nobody chose.
   */
  matched: boolean;
  /**
   * Whether the address bar already holds `pathForView(view)`.
   *
   * False for `/`, for a trailing slash, and for anything unrecognised. App
   * rewrites those with `replaceState` so that every screen has exactly one
   * address -- otherwise `/` and `/dashboard` are two URLs for one screen and
   * a shared link is a coin toss between them.
   */
  canonical: boolean;
}

/**
 * Which screen a pathname names.
 *
 * Deliberately strict: only a single known segment matches. `/entries/foo` is
 * NOT treated as 収支管理 with something after it, because this app has no
 * nested routes and quietly honouring a path it does not understand would hide
 * the typo instead of correcting it. Unknown paths fall back to the dashboard
 * and are marked non-canonical, so the caller replaces the address.
 */
export const matchView = (pathname: string): RouteMatch => {
  // '/entries/' -> '/entries', '/' -> ''. A trailing slash is the same screen,
  // but it is not the canonical address for it.
  const trimmed = pathname.replace(/\/+$/, '');
  const view = SEGMENT_TO_VIEW.get(trimmed.slice(1));
  if (view === undefined) return { view: DEFAULT_VIEW, matched: false, canonical: false };
  return { view, matched: true, canonical: pathname === pathForView(view) };
};

/**
 * The query-parameter names each screen understands.
 *
 * Collected here rather than spelled as literals at the use sites, because the
 * set of names IS the public shape of a link somebody may have bookmarked.
 * Renaming one is a breaking change to those links and should be visible as a
 * change to this table.
 *
 * Two screens may reuse a name (`month`, `period`): navigating to a screen
 * drops the previous screen's query entirely (see navigateToView), so the names
 * only ever have to be unique WITHIN a screen.
 *
 *  - dashboard.period … the forecast span (ForecastPeriod)
 *  - dashboard.flow   … the month the cash-flow diagram is showing
 *  - entries.month    … the month being edited
 *  - analytics.period … the analysis span (AnalyticsPeriod)
 *  - analytics.month  … the month drilled into from a trend chart
 */
export const SEARCH_PARAMS = {
  dashboard: { period: 'period', flow: 'flow' },
  entries: { month: 'month' },
  history: {},
  analytics: { period: 'period', month: 'month' },
  assets: {},
  settings: {},
} as const satisfies Record<ViewType, Readonly<Record<string, string>>>;

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * A `YYYY-MM` query parameter, or null when it is absent or malformed.
 *
 * The validation is not decoration. Every month-keyed lookup in this app splits
 * the string and does arithmetic on the halves, so `?month=banana` would reach
 * `new Date(NaN, NaN)` and the screen would ask the server for a month that
 * does not exist -- with no error, just empty figures under a nonsense heading.
 * A URL is user input like any other.
 */
export const parseYearMonthParam = (raw: string | null): string | null =>
  raw !== null && YEAR_MONTH.test(raw) ? raw : null;

/**
 * A query parameter restricted to a known set of strings.
 *
 * Returns null for anything else, so the caller falls back to its default
 * instead of rendering a period nothing knows how to size.
 */
export const parseEnumParam =
  <T extends string>(allowed: readonly T[]) =>
  (raw: string | null): T | null =>
    raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
