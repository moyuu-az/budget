// Single source of truth for the client <-> server data contract.
// Import/type-only: no node, http or react runtime imports, so this module is safe
// to pull into BOTH the server and the browser bundle.

import type { AssetFieldDef, AssetFieldValues } from './asset-fields';
import type { Recurrence } from './recurrence';

export type { AssetFieldDef, AssetFieldType, AssetFieldValue, AssetFieldValues } from './asset-fields';
export type { Recurrence, RecurrenceKind, YearMonth, IsoDate } from './recurrence';

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
//
// WHEN AN ENTRY HAPPENS IS A `Recurrence`, NOT A DAY NUMBER.
//
// This carried `dayOfMonth: number` until migration 005, which made every
// planned entry implicitly monthly. The expenses a household is actually caught
// out by are the ones that skip months -- 車検, 固定資産税, a year-paid premium,
// a trip -- and they had nowhere to live.
//
// Replacing the field rather than adding beside it is deliberate. Two ways to
// say "the 25th" would mean every reader choosing one, and the five places that
// total a month would drift apart over which. Removing it makes each of those a
// compile error, which is how they were all found.
//
// See shared/recurrence.ts for the variants and for the ONE predicate that
// answers whether an entry falls in a given month.
export interface EntryTemplate {
  id: number;
  name: string;
  recurrence: Recurrence;
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
  recurrence: Recurrence;
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
// CASH IS AN ASSET, AND THE BALANCE IS THE SUM OF IT.
//
// Every ledger has exactly one category with `kind: 'cash'`, and 「現在の残高」 --
// the figure the forecast starts from -- is the total of its holdings. There is
// no separate balance field anywhere in this contract, which is the point: two
// places to record the same money is what let the dashboard count it twice.
//
// Everything else about asset tracking stays optional. A household that ignores
// 資産 sees one category holding one row, which is what it had before under
// another name; the starting points for the rest live in
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
  /**
   * `'cash'` marks the one category whose holdings ARE the account balance.
   *
   * Exactly one per ledger, guaranteed by a partial unique index and provisioned
   * by the server -- so `categories.find(c => c.kind === 'cash')` is a total
   * function in practice, and a client that finds none is looking at a list it
   * has not finished loading.
   *
   * It is a separate field rather than a name match ON PURPOSE: the user may
   * rename 現金 to their bank's name, and the forecast must not start reading
   * zero because of it.
   *
   * The cash category cannot be deleted (the server refuses) and cannot be
   * created (`AssetCategoryInput` has no `kind`). Its name, colour and parameter
   * definitions are ordinary editable fields.
   */
  kind: 'cash' | null;
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

  // There is deliberately no getBalance/setBalance. The balance is the sum of
  // the cash category's holdings (see the Assets note above), so a method
  // returning it would be a second source for a figure that already has one --
  // and a method setting it would have no way to say WHICH holding changed.
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
  /**
   * Copies last month's per-month amounts forward.
   *
   * Only the entries that occur in the TARGET month are copied, and the server
   * decides which those are -- an override for a month its entry skips is
   * invisible on every screen and silently in force the day the recurrence
   * changes to cover that month.
   *
   * An earlier revision took the id list as an argument. That looked like it
   * kept the occurrence rule in one place, and actually moved the ENFORCEMENT to
   * the client, where a stale tab or another member's concurrent edit makes the
   * list wrong. The rule still has one definition (shared/recurrence.ts); the
   * server imports it. See server/repositories/occurrence-guard.ts.
   */
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
  /**
   * Every asset category, cash first.
   *
   * Provisions the ledger's cash category if it is somehow missing, so this is
   * the call that makes `kind: 'cash'` a guarantee rather than a hope. See
   * server/repositories/asset-category.repository.ts for why the guarantee is
   * enforced on read rather than at ledger creation.
   */
  getAssetCategories(): Promise<AssetCategory[]>;
  addAssetCategory(input: AssetCategoryInput): Promise<AssetCategory>;
  updateAssetCategory(id: number, input: Partial<AssetCategoryInput>): Promise<void>;
  deleteAssetCategory(id: number): Promise<void>;

  getAssets(): Promise<Asset[]>;
  addAsset(input: AssetInput): Promise<Asset>;
  updateAsset(id: number, input: Partial<AssetInput>): Promise<void>;
  deleteAsset(id: number): Promise<void>;
}
