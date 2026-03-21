// --- Category ---
export interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense';
  color: string | null;
  sortOrder: number;
}

export interface CategoryInput {
  name: string;
  type: 'income' | 'expense';
  color?: string;
  sortOrder?: number;
}

// --- EntryTemplate ---
export interface EntryTemplate {
  id: number;
  name: string;
  dayOfMonth: number;
  type: 'income' | 'expense';
  enabled: boolean;
  sortOrder: number;
  categoryId: number | null;
  defaultAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface EntryTemplateInput {
  name: string;
  dayOfMonth: number;
  type: 'income' | 'expense';
  categoryId?: number | null;
  defaultAmount?: number;
}

// --- MonthlyAmount ---
export interface MonthlyAmount {
  id: number;
  templateId: number;
  yearMonth: string;
  amount: number;
  createdAt: string;
}

// --- MonthlyActual ---
export interface MonthlyActual {
  id: number;
  templateId: number;
  yearMonth: string;
  actualAmount: number;
  createdAt: string;
}

// --- Maps ---
// yearMonth -> templateId -> amount
export type MonthlyAmountsMap = Map<string, Map<number, number>>;
// yearMonth -> templateId -> actualAmount
export type MonthlyActualsMap = Map<string, Map<number, number>>;

// --- Forecast ---
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

// --- BalanceSnapshot ---
export interface BalanceSnapshot {
  id: number;
  date: string;
  balance: number;
  createdAt: string;
}

// --- UpdateStatus ---
export interface UpdateStatus {
  status: 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

// --- View ---
export type ViewType = 'dashboard' | 'entries' | 'history' | 'settings' | 'analytics';

// --- ElectronAPI ---
export interface ElectronAPI {
  getBalance(): Promise<number>;
  setBalance(balance: number): Promise<void>;

  getCategories(): Promise<Category[]>;
  addCategory(category: CategoryInput): Promise<Category>;
  updateCategory(id: number, category: Partial<CategoryInput>): Promise<void>;
  deleteCategory(id: number): Promise<void>;

  getTemplates(): Promise<EntryTemplate[]>;
  addTemplate(template: EntryTemplateInput): Promise<EntryTemplate>;
  updateTemplate(id: number, template: Partial<EntryTemplateInput>): Promise<void>;
  toggleTemplate(id: number, enabled: boolean): Promise<void>;
  deleteTemplate(id: number): Promise<void>;

  getMonthlyAmounts(yearMonth: string): Promise<MonthlyAmount[]>;
  getMonthlyAmountsRange(startMonth: string, endMonth: string): Promise<MonthlyAmount[]>;
  setMonthlyAmount(templateId: number, yearMonth: string, amount: number): Promise<void>;
  deleteMonthlyAmount(templateId: number, yearMonth: string): Promise<void>;
  copyMonthlyAmounts(fromMonth: string, toMonth: string): Promise<void>;

  getMonthlyActuals(yearMonth: string): Promise<MonthlyActual[]>;
  setMonthlyActual(templateId: number, yearMonth: string, actualAmount: number): Promise<void>;
  deleteMonthlyActual(templateId: number, yearMonth: string): Promise<void>;

  getMonthlyActualsRange(startMonth: string, endMonth: string): Promise<ActualWithCategory[]>;
  getSnapshotsRange(startDate: string, endDate: string): Promise<BalanceSnapshot[]>;

  getSnapshots(): Promise<BalanceSnapshot[]>;
  addSnapshot(date: string, balance: number): Promise<BalanceSnapshot>;
  deleteSnapshot(id: number): Promise<void>;

  getAppVersion(): Promise<string>;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;
}

// --- Analytics ---
export type ForecastPeriod = '60d' | '3m' | '6m' | '1y';

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

export interface ActualWithCategory {
  templateId: number;
  yearMonth: string;
  actualAmount: number;
  templateName: string;
  templateType: 'income' | 'expense';
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
