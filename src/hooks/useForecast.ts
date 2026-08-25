import { useMemo } from 'react';
import type { ForecastPoint } from '../types';
import { useCashBalance } from './useCashBalance';
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
// ---------------------------------------------------------------------------

export function useForecast(days: number): ForecastPoint[] {
  const balance = useCashBalance();
  const templates = useTemplateStore((s) => s.templates);
  const monthlyAmountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);

  return useMemo(
    () => generateForecast(balance, templates, monthlyAmountsMap, days),
    [balance, templates, monthlyAmountsMap, days],
  );
}
