export type Theme = 'light' | 'dark';

export type AnalyticsPeriod = '3m' | '6m' | '1y';

export const shiftYearMonth = (ym: string, delta: number): string => {
  const [y, m] = ym.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};
