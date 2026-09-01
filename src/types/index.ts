// Re-export the shared client/server contract (single source of truth in shared/).
// Renderer-only types that never travel over the wire stay declared below.
export * from '../../shared/types';

// --- Maps (renderer-built, never sent to the server) ---
// yearMonth -> templateId -> amount
export type MonthlyAmountsMap = Map<string, Map<number, number>>;
// yearMonth -> templateId -> actualAmount
export type MonthlyActualsMap = Map<string, Map<number, number>>;

// --- Forecast (renderer-computed) ---
export interface ForecastEventDetail {
  name: string;
  amount: number;
  type: 'income' | 'expense';
  categoryId: number | null;
}

export interface ForecastPoint {
  date: string;
  balance: number;
  events: string[];
  eventDetails: ForecastEventDetail[];
  isMinimum?: boolean;
  isToday?: boolean;
}

// --- View ---
export type ViewType = 'dashboard' | 'entries' | 'history' | 'settings' | 'analytics' | 'assets';

// --- Analytics (renderer-computed, never cross IPC) ---
/**
 * The spans the balance forecast can be drawn over, as VALUES.
 *
 * A tuple rather than a bare union because the list is needed at runtime in
 * three places -- the tab strip, `periodToDays`, and the validator that decides
 * whether `?period=` in the address is meaningful. Deriving the type from the
 * tuple keeps those from drifting: a span added here appears in the tabs and is
 * accepted from the URL, and one removed becomes a compile error at every use.
 */
export const FORECAST_PERIODS = ['60d', '3m', '6m', '1y'] as const;
export type ForecastPeriod = (typeof FORECAST_PERIODS)[number];

export interface MonthSummary {
  yearMonth: string;
  endBalance: number;
  totalIncome: number;
  totalExpense: number;
  minBalance: number;
}

export interface CategoryTrendPoint {
  yearMonth: string;
  categories: CategoryTrendItem[];
}

export interface CategoryTrendItem {
  categoryId: number | null;
  name: string;
  color: string;
  amount: number;
}

export interface CompositionItem {
  categoryId: number | null;
  name: string;
  color: string;
  amount: number;
  percentage: number;
}

export interface ComparisonRow {
  categoryId: number | null;
  name: string;
  color: string;
  currentAmount: number;
  prevMonthDiff: number | null;
  prevMonthPercent: number | null;
  prevYearDiff: number | null;
  prevYearPercent: number | null;
}
