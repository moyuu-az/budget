// Raw PostgreSQL row shapes (snake_case). These are the ONLY snake_case surface
// in the server; mappers.ts translates them to the camelCase domain types in
// shared/types.ts. Nothing outside repositories/ and mappers.ts sees a *Row.
//
// The types here describe what node-postgres hands back AFTER the parsers in
// db/pool.ts have run -- so NUMERIC is already a number, DATE is already a
// 'YYYY-MM-DD' string, and TIMESTAMPTZ is already an ISO 8601 string.

export interface CategoryRow {
  id: number;
  ledger_id: number;
  name: string;
  type: string;
  color: string | null;
  sort_order: number;
}

export interface TemplateRow {
  id: number;
  ledger_id: number;
  name: string;
  day_of_month: number;
  type: string;
  /** BOOLEAN in PostgreSQL; the SQLite schema stored 0/1 in an INTEGER. */
  enabled: boolean;
  sort_order: number;
  category_id: number | null;
  default_amount: number;
  created_at: string;
  updated_at: string;
}

export interface MonthlyAmountRow {
  id: number;
  ledger_id: number;
  template_id: number;
  year_month: string;
  amount: number;
  created_at: string;
}

export interface MonthlyActualRow {
  id: number;
  ledger_id: number;
  template_id: number;
  year_month: string;
  actual_amount: number;
  created_at: string;
}

export interface SnapshotRow {
  id: number;
  ledger_id: number;
  date: string;
  balance: number;
  created_at: string;
}
