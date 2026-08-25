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
  /** 'fixed' | 'variable' | null -- narrowed by the mapper, constrained by the schema. */
  cost_type: string | null;
}

export interface TemplateRow {
  id: number;
  ledger_id: number;
  name: string;
  // --- Recurrence (migration 005) ---
  //
  // Five columns, one shape at a time. Which of them are populated is decided by
  // `recurrence_kind` and enforced by entry_templates_recurrence_shape_chk, so
  // the combinations these nullable types admit are far wider than the ones the
  // database will actually store. rowToTemplate is where they become the single
  // `Recurrence` union the rest of the system sees.
  /** NULL only for 'once', which carries its day inside `on_date`. */
  day_of_month: number | null;
  /** 'monthly' | 'yearly' | 'interval' | 'once' -- narrowed by the mapper. */
  recurrence_kind: string;
  /** 1-12, calendar style. Populated for 'yearly' only. */
  month_of_year: number | null;
  /** 2-60. Populated for 'interval' only. */
  interval_months: number | null;
  /** 'YYYY-MM'. Populated for 'interval' only. */
  anchor_month: string | null;
  /** 'YYYY-MM-DD' (DATE, already stringified by the parsers in db/pool.ts). */
  on_date: string | null;
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

// JSONB columns come back already parsed, but parsed is not the same as valid:
// the schema's CHECK proves only 'is an array' / 'is an object'. They are typed
// `unknown` here so nothing can read a field off them without going through the
// coercion in mappers.ts.

export interface AssetCategoryRow {
  id: number;
  ledger_id: number;
  name: string;
  color: string | null;
  sort_order: number;
  fields: unknown;
  /** 'cash' on the one category whose holdings are the balance; see migration 004. */
  kind: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetRow {
  id: number;
  ledger_id: number;
  category_id: number;
  name: string;
  value: number;
  fields: unknown;
  created_at: string;
  updated_at: string;
}
