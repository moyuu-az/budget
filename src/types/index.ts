export interface EntryTemplate {
  id: number;
  name: string;
  dayOfMonth: number;
  type: 'income' | 'expense';
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface EntryTemplateInput {
  name: string;
  dayOfMonth: number;
  type: 'income' | 'expense';
}

export interface MonthlyAmount {
  id: number;
  templateId: number;
  yearMonth: string;
  amount: number;
  createdAt: string;
}

export type MonthlyAmountsMap = Map<string, Map<number, number>>;

export interface BalanceSnapshot {
  id: number;
  date: string;
  balance: number;
  createdAt: string;
}

export interface BalanceSnapshotInput {
  date: string;
  balance: number;
}

export interface ForecastPoint {
  date: string;
  balance: number;
  events: string[];
  isMinimum?: boolean;
}

export interface ElectronAPI {
  getBalance: () => Promise<number>;
  setBalance: (balance: number) => Promise<void>;
  getTemplates: () => Promise<EntryTemplate[]>;
  addTemplate: (template: EntryTemplateInput) => Promise<EntryTemplate>;
  updateTemplate: (id: number, template: EntryTemplateInput) => Promise<EntryTemplate>;
  deleteTemplate: (id: number) => Promise<void>;
  toggleTemplate: (id: number, enabled: boolean) => Promise<void>;
  getMonthlyAmounts: (yearMonth: string) => Promise<MonthlyAmount[]>;
  getMonthlyAmountsRange: (startMonth: string, endMonth: string) => Promise<MonthlyAmount[]>;
  setMonthlyAmount: (templateId: number, yearMonth: string, amount: number) => Promise<MonthlyAmount>;
  deleteMonthlyAmount: (templateId: number, yearMonth: string) => Promise<void>;
  copyMonthlyAmounts: (fromMonth: string, toMonth: string) => Promise<MonthlyAmount[]>;
  getSnapshots: () => Promise<BalanceSnapshot[]>;
  addSnapshot: (snapshot: BalanceSnapshotInput) => Promise<BalanceSnapshot>;
  deleteSnapshot: (id: number) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
