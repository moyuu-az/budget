import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRoute, useSearchParam } from './useRoute';
import { navigate, navigateToView } from '../app/navigation';
import { parseEnumParam, parseYearMonthParam } from '../app/routes';

// ---------------------------------------------------------------------------
// The React side of the address bar. What matters here is that a component
// re-renders on every way the URL can move -- a click, the back button, a
// filter change -- because the alternative is an address bar that says one
// thing and a screen that shows another.
// ---------------------------------------------------------------------------

/**
 * The back button.
 *
 * happy-dom does not run a real session history, so `history.back()` cannot be
 * relied on. Rewinding the address and firing `popstate` is what the browser
 * does to the page, and it is exactly what the store subscribes to.
 */
const goBackTo = (href: string): void => {
  window.history.replaceState(null, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('useRoute', () => {
  it('reads the screen out of the address', () => {
    window.history.replaceState(null, '', '/analytics?period=1y');
    const { result } = renderHook(() => useRoute());

    expect(result.current.view).toBe('analytics');
    expect(result.current.params.get('period')).toBe('1y');
    // Canonical: the QUERY has no bearing on it. If it did, App's rewrite would
    // strip every filter on load -- the reload it exists to survive.
    expect(result.current.canonical).toBe(true);
  });

  it('re-renders when something navigates', () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current.view).toBe('dashboard');

    act(() => {
      navigateToView('assets');
    });

    expect(result.current.view).toBe('assets');
  });

  it('re-renders on the back button', () => {
    // The failure this catches is the loudest one available: the address bar
    // moves and the screen does not, so the user is on 資産 with 設定 in the URL.
    const { result } = renderHook(() => useRoute());
    act(() => {
      navigateToView('settings');
    });
    expect(result.current.view).toBe('settings');

    act(() => {
      goBackTo('/entries');
    });

    expect(result.current.view).toBe('entries');
  });

  it('marks a canonical path as canonical', () => {
    window.history.replaceState(null, '', '/entries');
    const { result } = renderHook(() => useRoute());
    expect(result.current).toMatchObject({ view: 'entries', canonical: true });
  });
});

describe('useSearchParam', () => {
  const monthSpec = {
    name: 'month',
    parse: parseYearMonthParam,
    fallback: '2026-09',
    serialize: (value: string): string => value,
  };

  it('falls back when the parameter is absent', () => {
    const { result } = renderHook(() => useSearchParam(monthSpec));
    expect(result.current[0]).toBe('2026-09');
  });

  it('falls back when the parameter is nonsense', () => {
    // A hand-edited URL is user input. Without this the value reaches month
    // arithmetic and the screen asks for a month that does not exist.
    window.history.replaceState(null, '', '/entries?month=banana');
    const { result } = renderHook(() => useSearchParam(monthSpec));
    expect(result.current[0]).toBe('2026-09');
  });

  it('reads the parameter when it is valid', () => {
    window.history.replaceState(null, '', '/entries?month=2026-01');
    const { result } = renderHook(() => useSearchParam(monthSpec));
    expect(result.current[0]).toBe('2026-01');
  });

  it('writes the parameter into the address', () => {
    window.history.replaceState(null, '', '/entries');
    const { result } = renderHook(() => useSearchParam(monthSpec));

    act(() => {
      result.current[1]('2026-02');
    });

    expect(window.location.search).toBe('?month=2026-02');
    expect(result.current[0]).toBe('2026-02');
  });

  it('removes the parameter when the value serialises to null', () => {
    window.history.replaceState(null, '', '/analytics?month=2026-02');
    const { result } = renderHook(() =>
      useSearchParam<string | null>({
        name: 'month',
        parse: parseYearMonthParam,
        fallback: null,
        serialize: (value) => value,
      }),
    );

    act(() => {
      result.current[1](null);
    });

    expect(window.location.search).toBe('');
    expect(result.current[0]).toBeNull();
  });

  it('keeps the setter stable across renders', () => {
    // Several of the controls it is handed to are memoised; a new function
    // every render would defeat that and re-render every chart on the screen.
    const { result, rerender } = renderHook(() => useSearchParam(monthSpec));
    const first = result.current[1];
    rerender();
    expect(result.current[1]).toBe(first);
  });

  it('follows the back button', () => {
    window.history.replaceState(null, '', '/entries?month=2026-01');
    const { result } = renderHook(() => useSearchParam(monthSpec));

    act(() => {
      goBackTo('/entries?month=2026-05');
    });

    expect(result.current[0]).toBe('2026-05');
  });

  it('does not disturb another screen\'s parameter of the same name', () => {
    // 収支管理 and 分析 both use `month`; navigation is what keeps them apart.
    window.history.replaceState(null, '', '/entries?month=2026-01');
    const { result } = renderHook(() => useSearchParam(monthSpec));
    act(() => {
      result.current[1]('2026-04');
    });
    act(() => {
      navigate('/analytics');
    });
    expect(window.location.search).toBe('');
  });

  it('accepts only values the parser knows', () => {
    window.history.replaceState(null, '', '/dashboard?period=42y');
    const { result } = renderHook(() =>
      useSearchParam({
        name: 'period',
        parse: parseEnumParam(['60d', '3m'] as const),
        fallback: '60d' as const,
        serialize: (value: string): string => value,
      }),
    );
    expect(result.current[0]).toBe('60d');
  });
});
