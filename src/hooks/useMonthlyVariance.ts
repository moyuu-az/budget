import { useMemo } from 'react';
import { useTemplateStore } from '../stores/useTemplateStore';
import { useCategoryStore } from '../stores/useCategoryStore';
import { useMonthlyStore } from '../stores/useMonthlyStore';
import { combineStatus, type LoadStatus } from '../stores/load-status';
import { previousMonth, summarizeVariance, type MonthlyVariance } from '../utils/variance';
import { useMonthLoaded } from './useMonthLoaded';

// ---------------------------------------------------------------------------
// Did last month go the way it was planned?
//
// The application has recorded actuals since before this change, and the only
// place they appeared was 分析. Anyone who reaches 分析 is already thinking
// about their spending; the household that needs to hear 「先月は予算より
// ¥32,000 多く使いました」 is the one that opens the dashboard and leaves.
//
// WHY IT FETCHES ITS OWN MONTH
//   The dashboard fetches monthly amounts from THIS month forward, for the
//   forecast. Last month is behind that range and behind the actuals range too,
//   so nothing else was going to load it. Fetching here keeps the card
//   self-contained: no other component has to know it exists in order for it to
//   work.
// ---------------------------------------------------------------------------

export interface MonthlyVarianceResult {
  variance: MonthlyVariance;
  status: LoadStatus;
  /**
   * Re-fetches THIS card's month.
   *
   * LoadGate's default retry runs `loadLedgerData`, which deliberately skips the
   * per-month data -- so without this the button would re-fetch everything
   * except the thing that failed, and the error would stay on screen looking
   * like a button that does not work.
   */
  retry: () => Promise<void>;
}

export function useMonthlyVariance(): MonthlyVarianceResult {
  const templates = useTemplateStore((s) => s.templates);
  const templatesStatus = useTemplateStore((s) => s.status);
  const categories = useCategoryStore((s) => s.categories);
  const amountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);
  const actualsMap = useMonthlyStore((s) => s.monthlyActualsMap);

  // Read once per render rather than per effect: two reads either side of
  // midnight would disagree about which month "last month" is, and the fetch
  // would then be for a month the summary does not read.
  const yearMonth = useMemo(() => previousMonth(new Date()), []);

  // The shared hook, not a local effect. Its dependencies include the active
  // ledger, which a `[yearMonth, <stable actions>]` list does not -- and after a
  // switch the status map is empty, so a card that never re-fetches gates on a
  // month nobody asked for and holds its skeleton forever.
  const { status: monthStatus, retry } = useMonthLoaded(yearMonth);

  // READINESS INCLUDES LAST MONTH'S OWN FETCH, and that is the whole reason the
  // store tracks it per month.
  //
  // Both maps are empty for three different reasons -- never asked for, in
  // flight, failed -- and for a fourth that is not a problem at all: a month the
  // household genuinely recorded nothing in. This card renders that fourth case
  // as 「実績が記録されていません」, a POSITIVE claim. Without a status it would
  // make that claim during the initial load (briefly false) and after a failed
  // request (false forever, for a household whose actuals exist and simply could
  // not be fetched).
  const status = combineStatus(templatesStatus, monthStatus);

  const variance = useMemo(
    () =>
      summarizeVariance(templates, categories, amountsMap, actualsMap, yearMonth, 'expense'),
    [templates, categories, amountsMap, actualsMap, yearMonth],
  );

  return { variance, status, retry };
}
