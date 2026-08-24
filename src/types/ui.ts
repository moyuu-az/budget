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

export const shiftYearMonth = (ym: string, delta: number): string => {
  const [y, m] = ym.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};
