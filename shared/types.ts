// Single source of truth for the client <-> server data contract.
// Import/type-only: no node, http or react runtime imports, so this module is safe
// to pull into BOTH the server and the browser bundle.

import type { AssetFieldDef, AssetFieldValues } from './asset-fields';

export type { AssetFieldDef, AssetFieldType, AssetFieldValue, AssetFieldValues } from './asset-fields';

// --- Category ---

/**
 * How an expense behaves month to month.
 *
 *  - 'fixed'    (固定費) -- rent, insurance, subscriptions: roughly the same every
 *                month, and only a decision changes it.
 *  - 'variable' (変動費) -- groceries, leisure: driven by what actually happened.
 *
 * Only meaningful for `type: 'expense'`; income categories carry null, and the
 * database rejects any other combination (migration 003). The distinction is
 * what lets a household see how much of a month is already committed before
 * anyone spends anything.
 *
 * Null on an expense category means "not classified yet" rather than a third
 * kind. Making it non-nullable would force a wrong answer onto every category
 * that already exists.
 */
export type CostType = 'fixed' | 'variable';

export interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense';
  color: string | null;
  sortOrder: number;
  /** null for income categories, and for expense categories left unclassified. */
  costType: CostType | null;
}

export interface CategoryInput {
  name: string;
  type: 'income' | 'expense';
  // Nullable, not merely optional: `undefined` in a patch means "leave alone",
  // while `null` means "clear the colour". Collapsing the two would make
  // removing a colour impossible to express.
  color?: string | null;
  sortOrder?: number;
  /** Same nullable-vs-optional rule as `color`: null clears the classification. */
  costType?: CostType | null;
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

// --- BalanceSnapshot ---
export interface BalanceSnapshot {
  id: number;
  date: string;
  balance: number;
  createdAt: string;
}

// --- Assets ---
//
// Asset tracking is OPTIONAL: a ledger with no asset categories simply has an
// empty 資産 view, and nothing is created until the user asks for it. That is why
// nothing here is seeded on ledger creation -- the starting points live in
// shared/asset-templates.ts and are applied by an explicit action.

/**
 * One kind of asset holding (NISA, 現金, 定期預金, ...) together with the extra
 * parameters that kind needs.
 *
 * `fields` is the whole point of the type. Every asset has a name and a value,
 * but what else you must record depends entirely on the kind: a NISA position is
 * meaningless without its 銘柄, and recording a 銘柄 for cash is noise. Rather
 * than one table per kind (a migration every time the household starts tracking
 * something new), the category carries the SHAPE and each asset carries VALUES
 * matching it.
 */
export interface AssetCategory {
  id: number;
  name: string;
  color: string | null;
  sortOrder: number;
  /** Definitions of the extra parameters assets in this category must carry. */
  fields: AssetFieldDef[];
}

export interface AssetCategoryInput {
  name: string;
  color?: string | null;
  sortOrder?: number;
  fields?: AssetFieldDef[];
}

/** One holding. `fields` is keyed by AssetFieldDef.key of its category. */
export interface Asset {
  id: number;
  categoryId: number;
  name: string;
  /**
   * Current worth, in yen.
   *
   * Deliberately NOT constrained to be positive: a household that tracks a loan
   * balance as an asset category needs to enter it negative for the total to
   * mean anything.
   */
  value: number;
  fields: AssetFieldValues;
  createdAt: string;
  updatedAt: string;
}

export interface AssetInput {
  categoryId: number;
  name: string;
  value: number;
  fields?: AssetFieldValues;
}

// --- Identity ---

export interface AuthenticatedUser {
  id: number;
  email: string;
  displayName: string;
}

/** One self-contained forecast: its own balance, categories, templates, snapshots. */
export interface Ledger {
  id: number;
  /** Stable machine identifier used by provisioning. Not shown to the user. */
  slug: string;
  name: string;
  /**
   * Display hint for the ledger switcher (icon/grouping) ONLY.
   *
   * Never branch authorization on this. Whether a person may open a ledger is
   * answered solely by their membership -- which is what `ledgers` below lists.
   */
  kind: 'shared' | 'personal';
}

export interface Session {
  user: AuthenticatedUser;
  /**
   * Every ledger this user may open, and therefore also the authorization list:
   * the server rejects any request naming a ledger outside this set. The client
   * uses it to populate the switcher.
   */
  ledgers: Ledger[];
}

// --- AppApi: the SINGLE source of truth for the request surface ---
//
// The server's exhaustive handler table and the browser client are both derived
// from this interface, so a method added here fails to compile until both sides
// implement it.
//
// EVERY METHOD EXCEPT getSession IS LEDGER-SCOPED, yet none of them takes a
// ledger argument. Which ledger a call applies to travels in the request context
// (an X-Ledger-Id header) rather than in the signature.
//
// That is a deliberate choice. Threading a ledgerId through 25 signatures would
// push it into every store and every component that calls one, for a value none
// of them has any business deciding. Keeping it in the context means switching
// ledgers is one piece of client state, and this contract stays about data.
export interface AppApi {
  /**
   * Who is signed in and which ledgers they may open.
   *
   * The only method that is not ledger-scoped -- it is what tells the client
   * which ledgers exist in the first place.
   */
  getSession(): Promise<Session>;

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

  // Raw actuals for a month range; the renderer overlays them onto planned amounts
  // when building analytics trends (actual ?? planned).
  getMonthlyActualsRange(startMonth: string, endMonth: string): Promise<MonthlyActual[]>;
  getSnapshotsRange(startDate: string, endDate: string): Promise<BalanceSnapshot[]>;

  getSnapshots(): Promise<BalanceSnapshot[]>;
  addSnapshot(date: string, balance: number): Promise<BalanceSnapshot>;
  deleteSnapshot(id: number): Promise<void>;

  // --- Assets ---
  //
  // Categories and holdings are separate methods rather than one nested payload:
  // editing a category's field definitions and editing a holding are different
  // actions with different failure modes, and nesting would make every holding
  // edit rewrite the category.
  getAssetCategories(): Promise<AssetCategory[]>;
  addAssetCategory(input: AssetCategoryInput): Promise<AssetCategory>;
  updateAssetCategory(id: number, input: Partial<AssetCategoryInput>): Promise<void>;
  deleteAssetCategory(id: number): Promise<void>;

  getAssets(): Promise<Asset[]>;
  addAsset(input: AssetInput): Promise<Asset>;
  updateAsset(id: number, input: Partial<AssetInput>): Promise<void>;
  deleteAsset(id: number): Promise<void>;
}
