import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW,
  SEARCH_PARAMS,
  VIEW_SEGMENT,
  matchView,
  parseEnumParam,
  parseYearMonthParam,
  pathForView,
} from './routes';
import type { ViewType } from '../types';

// ---------------------------------------------------------------------------
// The URL is the only description of what is on screen, so these tests are
// about the two ways that can go wrong:
//
//   1. A screen that has no address, or two addresses for one screen.
//   2. An address the user typed or edited being taken at face value and
//      reaching arithmetic that produces NaN months.
// ---------------------------------------------------------------------------

const ALL_VIEWS = Object.keys(VIEW_SEGMENT) as ViewType[];

describe('every screen has exactly one address', () => {
  it('round-trips each view through its path', () => {
    // The guard against a screen being added to the app but not to the URL
    // table: if VIEW_SEGMENT gained a key with a segment nothing matches, this
    // fails rather than the screen quietly becoming unreachable by link.
    for (const view of ALL_VIEWS) {
      expect(matchView(pathForView(view))).toEqual({ view, matched: true, canonical: true });
    }
  });

  it('gives no two screens the same segment', () => {
    const segments = ALL_VIEWS.map((view) => VIEW_SEGMENT[view]);
    expect(new Set(segments).size).toBe(segments.length);
  });
});

describe('addresses that are not canonical', () => {
  it('sends the root to the default view, marked for rewriting', () => {
    // `/` and `/dashboard` must not both stay as addresses for one screen:
    // whichever the user happens to be on would decide what a shared link says.
    expect(matchView('/')).toEqual({ view: DEFAULT_VIEW, matched: false, canonical: false });
  });

  it('accepts a trailing slash but does not consider it canonical', () => {
    expect(matchView('/entries/')).toEqual({ view: 'entries', matched: true, canonical: false });
  });

  it('falls back to the default view for an unknown path', () => {
    expect(matchView('/nope')).toEqual({ view: DEFAULT_VIEW, matched: false, canonical: false });
  });

  it('does not treat a nested path as its first segment', () => {
    // This app has no nested routes. Honouring `/entries/2026-01` would invent
    // a URL shape nothing produces and hide the typo instead of correcting it.
    expect(matchView('/entries/2026-01')).toEqual({
      view: DEFAULT_VIEW,
      matched: false,
      canonical: false,
    });
  });
});

describe('parseYearMonthParam', () => {
  it('accepts a well-formed month', () => {
    expect(parseYearMonthParam('2026-01')).toBe('2026-01');
    expect(parseYearMonthParam('2026-12')).toBe('2026-12');
  });

  it('rejects a missing parameter', () => {
    expect(parseYearMonthParam(null)).toBeNull();
  });

  it('rejects a month outside 01-12', () => {
    // `?month=2026-13` would otherwise become new Date(2026, 12) -- January of
    // the next year -- and the screen would show a month it does not name.
    expect(parseYearMonthParam('2026-13')).toBeNull();
    expect(parseYearMonthParam('2026-00')).toBeNull();
  });

  it('rejects anything that is not YYYY-MM', () => {
    for (const raw of ['banana', '2026', '2026-1', '26-01', '2026-01-15', '', ' 2026-01']) {
      expect(parseYearMonthParam(raw)).toBeNull();
    }
  });
});

describe('parseEnumParam', () => {
  const parse = parseEnumParam(['3m', '6m', '1y'] as const);

  it('accepts a member of the set', () => {
    expect(parse('1y')).toBe('1y');
  });

  it('rejects anything else, including a missing parameter', () => {
    expect(parse('2y')).toBeNull();
    expect(parse(null)).toBeNull();
    expect(parse('')).toBeNull();
  });
});

describe('the query-parameter table', () => {
  it('names each parameter once per screen', () => {
    // Two filters on ONE screen sharing a name would silently overwrite each
    // other. Across screens a repeat is fine -- navigation drops the query.
    for (const view of ALL_VIEWS) {
      const names = Object.values(SEARCH_PARAMS[view] as Record<string, string>);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
