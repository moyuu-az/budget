// The single boundary where snake_case DB rows become camelCase domain types.
// Repositories return DOMAIN types only; callers never touch a *Row.
//
// `ledger_id` is deliberately NOT mapped onto any domain type. The client is
// only ever looking at one ledger at a time -- which one is decided by the
// request context, not by a field on every row -- and putting it in the payload
// would invite client code to start making decisions with it.

import type {
  Category,
  EntryTemplate,
  MonthlyAmount,
  MonthlyActual,
  BalanceSnapshot,
} from '../shared/types';
import type {
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
  };
}

export function rowToTemplate(row: TemplateRow): EntryTemplate {
  return {
    id: row.id,
    name: row.name,
    dayOfMonth: row.day_of_month,
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
