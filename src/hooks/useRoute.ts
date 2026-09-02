import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  getLocationSnapshot,
  getServerLocationSnapshot,
  setSearchParams,
  subscribeToLocation,
  type LocationSnapshot,
} from '../app/navigation';
import { matchView, type RouteMatch } from '../app/routes';

// ---------------------------------------------------------------------------
// READING THE URL FROM REACT.
//
// `useSyncExternalStore` rather than a `popstate` effect plus local state: the
// address is external state that can change between render and commit (a click
// handler pushes, then React renders), and the concurrent-safe subscription is
// exactly what this hook exists for. An effect would render one frame of the
// previous screen after every navigation.
// ---------------------------------------------------------------------------

export const useLocation = (): LocationSnapshot =>
  useSyncExternalStore(subscribeToLocation, getLocationSnapshot, getServerLocationSnapshot);

export interface Route extends RouteMatch {
  /** The current query, already parsed. Prefer `useSearchParam` for a single filter. */
  params: URLSearchParams;
}

export const useRoute = (): Route => {
  const { pathname, search } = useLocation();
  const match = useMemo(() => matchView(pathname), [pathname]);
  const params = useMemo(() => new URLSearchParams(search), [search]);
  return { ...match, params };
};

/**
 * How one filter is read from, and written to, the query.
 *
 * `parse` returns null for "absent or nonsense", which is what makes a
 * hand-edited URL harmless: the screen falls back instead of rendering a month
 * that does not exist. See parseYearMonthParam in src/app/routes.ts.
 *
 * `serialize` returning null REMOVES the parameter. That is how a filter goes
 * back to unset (分析 clearing its drilled-into month, for instance) instead of
 * leaving `?month=` behind.
 */
export interface SearchParamSpec<T> {
  name: string;
  parse: (raw: string | null) => T | null;
  fallback: T;
  serialize: (value: T) => string | null;
}

/**
 * A filter that lives in the query string, used like `useState`.
 *
 * The URL is the single source of truth for the value: there is no shadow copy
 * in component state, so the back button, a reload and a pasted link all agree
 * by construction. `fallback` supplies the value when the parameter is absent,
 * and may itself come from a persisted preference (分析 does this with its
 * span) -- the URL still wins whenever it says anything.
 *
 * The setter is referentially stable across renders even when the spec is
 * written inline, because it reads the spec through a ref. Several of the
 * controls it is handed to are `memo`ised.
 */
export function useSearchParam<T>(spec: SearchParamSpec<T>): [T, (value: T) => void] {
  const { search } = useLocation();

  // Written during render, which React documents as something not to do. It is
  // safe HERE because `set` reads only `name` and `serialize`, and both are
  // structurally the same in every render of a given call site (the specs are
  // literals over constants). If `serialize` ever closes over props or state,
  // this becomes a stale-closure bug on a render React threw away -- move the
  // assignment into an effect at that point.
  const specRef = useRef(spec);
  specRef.current = spec;

  // Parsed on every render rather than memoised: it is one URLSearchParams over
  // a query of a handful of characters, and a memo keyed on the spec's
  // functions would be invalidated by every inline arrow anyway.
  const value = spec.parse(new URLSearchParams(search).get(spec.name)) ?? spec.fallback;

  const set = useCallback((next: T) => {
    const current = specRef.current;
    setSearchParams({ [current.name]: current.serialize(next) });
  }, []);

  return [value, set];
}
