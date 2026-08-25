// The single boundary where snake_case DB rows become camelCase domain types.
// Repositories return DOMAIN types only; callers never touch a *Row.
//
// `ledger_id` is deliberately NOT mapped onto any domain type. The client is
// only ever looking at one ledger at a time -- which one is decided by the
// request context, not by a field on every row -- and putting it in the payload
// would invite client code to start making decisions with it.

import type {
  Asset,
  AssetCategory,
  Category,
  CostType,
  EntryTemplate,
  MonthlyAmount,
  MonthlyActual,
  BalanceSnapshot,
  Recurrence,
} from '../shared/types';
import { coerceFieldDefs, coerceFieldValues } from '../shared/asset-fields';
import type {
  AssetCategoryRow,
  AssetRow,
  CategoryRow,
  TemplateRow,
  MonthlyAmountRow,
  MonthlyActualRow,
  SnapshotRow,
} from './repositories/row-types';

export function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    type: row.type as 'income' | 'expense',
    color: row.color,
    sortOrder: row.sort_order,
    // The CHECK constraint in migration 003 admits only these two values on
    // expense categories, so anything else is a row that predates it.
    costType: row.cost_type === 'fixed' || row.cost_type === 'variable'
      ? (row.cost_type as CostType)
      : null,
  };
}

/**
 * Rebuilds the `Recurrence` union from the five columns migration 005 spread it
 * across.
 *
 * WHY THIS THROWS INSTEAD OF FALLING BACK
 *   Every other narrowing in this file picks the safe reading when a value is
 *   unexpected -- an unknown `cost_type` reads as "unclassified", an unknown
 *   asset `kind` reads as "an ordinary category". Timing has no safe reading.
 *   Every fallback available here (monthly on the 1st, monthly on whatever day
 *   happens to be stored) INVENTS a date for real money, and the forecast would
 *   then state it with the same confidence as a correct one. A household acting
 *   on a rent payment moved to a day it does not happen is worse off than one
 *   told its data is broken.
 *
 *   It is unreachable by construction: entry_templates_recurrence_shape_chk
 *   rejects every combination this function cannot read, so reaching the throw
 *   means the row was written around the schema (a hand-edited database, a
 *   restore from a dump predating the constraint). Loud is the right answer to
 *   that.
 */
function rowToRecurrence(row: TemplateRow): Recurrence {
  const broken = (reason: string): never => {
    // The template id, not the ledger id: this message goes to a server log the
    // operator reads, and the id is what they need to fix the row.
    throw new Error(`entry_templates.id=${row.id}: ${reason}`);
  };

  switch (row.recurrence_kind) {
    case 'monthly':
      if (row.day_of_month === null) broken('monthly recurrence without day_of_month');
      return { kind: 'monthly', dayOfMonth: row.day_of_month as number };

    case 'yearly':
      if (row.day_of_month === null || row.month_of_year === null) {
        broken('yearly recurrence without day_of_month or month_of_year');
      }
      return {
        kind: 'yearly',
        month: row.month_of_year as number,
        dayOfMonth: row.day_of_month as number,
      };

    case 'interval':
      if (row.day_of_month === null || row.interval_months === null || row.anchor_month === null) {
        broken('interval recurrence without day_of_month, interval_months or anchor_month');
      }
      return {
        kind: 'interval',
        everyMonths: row.interval_months as number,
        anchorMonth: row.anchor_month as string,
        dayOfMonth: row.day_of_month as number,
      };

    case 'once':
      if (row.on_date === null) broken('once recurrence without on_date');
      // Sliced rather than passed through: the DATE parser in db/pool.ts already
      // yields 'YYYY-MM-DD', and slicing keeps that true even if a future parser
      // change starts appending a time.
      return { kind: 'once', date: (row.on_date as string).slice(0, 10) };

    default:
      return broken(`unknown recurrence_kind ${JSON.stringify(row.recurrence_kind)}`);
  }
}

/**
 * The inverse: a `Recurrence` becomes the five column values to write.
 *
 * Every field is listed in every branch, NULL included. Leaving the irrelevant
 * ones out would make an UPDATE carry over the previous shape's values -- a
 * template changed from yearly to monthly would keep its `month_of_year`, and
 * entry_templates_recurrence_shape_chk would reject the row with a CONFLICT that
 * names a column the user never touched.
 */
export function recurrenceToColumns(recurrence: Recurrence): {
  recurrence_kind: string;
  day_of_month: number | null;
  month_of_year: number | null;
  interval_months: number | null;
  anchor_month: string | null;
  on_date: string | null;
} {
  const empty = {
    day_of_month: null,
    month_of_year: null,
    interval_months: null,
    anchor_month: null,
    on_date: null,
  };

  switch (recurrence.kind) {
    case 'monthly':
      return { ...empty, recurrence_kind: 'monthly', day_of_month: recurrence.dayOfMonth };
    case 'yearly':
      return {
        ...empty,
        recurrence_kind: 'yearly',
        day_of_month: recurrence.dayOfMonth,
        month_of_year: recurrence.month,
      };
    case 'interval':
      return {
        ...empty,
        recurrence_kind: 'interval',
        day_of_month: recurrence.dayOfMonth,
        interval_months: recurrence.everyMonths,
        anchor_month: recurrence.anchorMonth,
      };
    case 'once':
      return { ...empty, recurrence_kind: 'once', on_date: recurrence.date };
  }
}

export function rowToTemplate(row: TemplateRow): EntryTemplate {
  return {
    id: row.id,
    name: row.name,
    recurrence: rowToRecurrence(row),
    type: row.type as 'income' | 'expense',
    // Already a boolean: the column is BOOLEAN, not the SQLite 0/1 INTEGER.
    enabled: row.enabled,
    sortOrder: row.sort_order,
    categoryId: row.category_id,
    defaultAmount: row.default_amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToMonthlyAmount(row: MonthlyAmountRow): MonthlyAmount {
  return {
    id: row.id,
    templateId: row.template_id,
    yearMonth: row.year_month,
    amount: row.amount,
    createdAt: row.created_at,
  };
}

export function rowToMonthlyActual(row: MonthlyActualRow): MonthlyActual {
  return {
    id: row.id,
    templateId: row.template_id,
    yearMonth: row.year_month,
    actualAmount: row.actual_amount,
    createdAt: row.created_at,
  };
}

export function rowToSnapshot(row: SnapshotRow): BalanceSnapshot {
  return {
    id: row.id,
    date: row.date,
    balance: row.balance,
    createdAt: row.created_at,
  };
}

export function rowToAssetCategory(row: AssetCategoryRow): AssetCategory {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    // JSONB guarantees only that this is an array; coerceFieldDefs is what makes
    // it an array of definitions the UI can render.
    fields: coerceFieldDefs(row.fields),
    // Narrowed rather than cast: the column is TEXT with a CHECK, and the CHECK
    // is the thing that could be relaxed by a future migration without anyone
    // revisiting this line. Anything unexpected reads as "an ordinary category",
    // which is the safe answer -- the alternative is a second category claiming
    // to be the balance.
    kind: row.kind === 'cash' ? 'cash' : null,
  };
}

export function rowToAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    value: row.value,
    fields: coerceFieldValues(row.fields),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
