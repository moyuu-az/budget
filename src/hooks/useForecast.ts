import { useMemo } from 'react';
import type { ForecastPoint } from '../types';
import { useCashBalance } from './useCashBalance';
import { useAssetStore } from '../stores/useAssetStore';
import { useTemplateStore } from '../stores/useTemplateStore';
import { useMonthlyStore } from '../stores/useMonthlyStore';
import { generateForecast } from '../utils/forecast';

// ---------------------------------------------------------------------------
// THE forecast. Every screen that projects a balance forward reads it here.
//
// WHY THIS HOOK EXISTS
//   The same projection was assembled in three places -- the dashboard chart,
//   the dashboard KPIs, and the analytics view -- from the same three stores,
//   differing only in how many days ahead they looked. Three copies is three
//   chances to disagree, and one of the things they have to agree on is not a
//   detail:
//
//     THE FORECAST IS CASH.
//
//   It projects the money at hand, and nothing else. Cash now lives in the asset
//   list like everything else (its category is the one with `kind: 'cash'`), but
//   the rest of 資産 stays deliberately absent: a NISA position cannot pay next
//   month's rent, so letting one lift the projected floor would silence the
//   minimum-balance warning this application exists to raise. The dashboard's
//   現金/純資産 toggle changes which figure is DISPLAYED beside the forecast; it
//   must never change the forecast itself.
//
//   Which is why the starting figure comes from useCashBalance() and not from a
//   total over the asset store: totalAssetValue(assets) would compile, would
//   look right, and would quietly forecast from net worth.
//
//   With three call sites that invariant had to be restated -- and re-tested --
//   three times, and in practice was tested once. Here there is one place to
//   state it, one place to break it, and one test that notices.
//
//   If you are adding a fourth screen that needs a projection: call this. If you
//   are about to add an argument that changes what goes INTO the projection,
//   read the paragraph above first.
//
// WHY THE RETURN TYPE CARRIES `ready`
//   A projection built from inputs that have not arrived is not a cautious
//   projection -- it is a WRONG one, and it is wrong in the alarming direction.
//   The templates and the balance land in separate responses, and the balance is
//   the later of the two often enough to matter (the browser caps concurrent
//   connections, and the balance now needs two requests where it used to need
//   one). In that window the dashboard has real expenses and a ¥0 balance, and
//   projects 残高不足 -- in red, with no indication that anything is still
//   loading. An app whose whole purpose is to warn about running out of money
//   cannot afford to cry wolf on every cold load.
//
//   So readiness is part of the answer rather than a flag beside it, and
//   `points` is EMPTY until it is true. A caller that ignores `ready` renders
//   "no data", which is honest; there is no arrangement of this API that renders
//   a fabricated warning.
// ---------------------------------------------------------------------------

export interface Forecast {
  /** True once every input has arrived. While false, `points` is empty. */
  ready: boolean;
  /** The projection, day by day. */
  points: ForecastPoint[];
}

export function useForecast(days: number): Forecast {
  const balance = useCashBalance();
  // Not `!loading`: a store that has never fetched is not loading either.
  const balanceLoaded = useAssetStore((s) => s.loaded);
  const templates = useTemplateStore((s) => s.templates);
  const templatesLoaded = useTemplateStore((s) => s.loaded);
  const monthlyAmountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);

  // Monthly amounts are deliberately NOT required. They are fetched per month as
  // the user navigates and refine amounts the templates already supply, so their
  // absence makes the projection approximate rather than false.
  const ready = balanceLoaded && templatesLoaded;

  return useMemo(
    () => ({
      ready,
      points: ready ? generateForecast(balance, templates, monthlyAmountsMap, days) : [],
    }),
    [ready, balance, templates, monthlyAmountsMap, days],
  );
}
