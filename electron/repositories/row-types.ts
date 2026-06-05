// Raw DB row shapes (snake_case). These are the ONLY snake_case surface in the
// main process; mappers.ts translates them to camelCase domain types. Nothing
// outside repositories/ and mappers.ts should see a *Row type.

export interface CategoryRow {
  id: number;
  name: string;
  type: string;
  color: string | null;
  sort_order: number;
}

export interface TemplateRow {
  id: number;
  name: string;
  day_of_month: number;
  type: string;
  enabled: number;
  sort_order: number;
  category_id: number | null;
  default_amount: number;
  created_at: string;
  updated_at: string;
}

export interface MonthlyAmountRow {
  id: number;
  template_id: number;
  year_month: string;
  amount: number;
  created_at: string;
}

export interface MonthlyActualRow {
  id: number;
  template_id: number;
  year_month: string;
  actual_amount: number;
  created_at: string;
}

export interface SnapshotRow {
  id: number;
  date: string;
  balance: number;
  created_at: string;
}
