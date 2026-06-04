// The single boundary where snake_case DB rows become camelCase domain types.
// Repositories return DOMAIN types only; callers never touch a *Row.

import type {
  Category,
  EntryTemplate,
  MonthlyAmount,
  MonthlyActual,
  ActualWithCategory,
  BalanceSnapshot,
} from '../shared/types';
import type {
  CategoryRow,
  TemplateRow,
  MonthlyAmountRow,
  MonthlyActualRow,
  ActualWithCategoryRow,
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
    enabled: row.enabled === 1,
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

export function rowToActualWithCategory(row: ActualWithCategoryRow): ActualWithCategory {
  return {
    templateId: row.template_id,
    yearMonth: row.year_month,
    actualAmount: row.actual_amount,
    templateName: row.template_name,
    templateType: row.template_type as 'income' | 'expense',
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryColor: row.category_color,
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
