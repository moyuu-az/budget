import { toYearMonth } from '../../shared/recurrence';

export type Theme = 'light' | 'dark';

export type AnalyticsPeriod = '3m' | '6m' | '1y';

/**
 * Which lens the dashboard's holdings card shows.
 *
 *  - 'cash'     … the account balance the forecast starts from
 *  - 'netWorth' … that balance plus everything in 資産
 *
 * A user preference rather than a computed choice, because only the household
 * knows whether its asset list overlaps the forecast account. See
 * src/utils/net-worth.ts.
 *
 * It never reaches the forecast: the projection and the minimum-balance warning
 * are always cash. Mixing holdings that cannot be spent into them would silence
 * exactly the warning this app exists to raise.
 */
export type HoldingsView = 'cash' | 'netWorth';

/**
 * `YYYY-MM` shifted by whole months. December rolls into January by
 * construction, because `new Date(y, 12, 1)` is next January.
 *
 * The single implementation of month stepping in the renderer: both month
 * selectors (収支管理 and the cash-flow diagram) used to do this arithmetic
 * inline, and the URL now stores the result, so a disagreement between them
 * would be a disagreement about which month the address names.
 *
 * The formatting is `toYearMonth`, not a local copy. It used to build the
 * string itself, which is exactly the duplication MonthNavigator's own comment
 * warns about: this application's date story rests on "local time throughout",
 * and a second implementation is a second place for that to stop being true --
 * silently, since both agree in JST.
 */
export const shiftYearMonth = (ym: string, delta: number): string => {
  const [y, m] = ym.split('-').map(Number);
  return toYearMonth(new Date(y, m - 1 + delta, 1));
};
