import type {
  Category,
  EntryTemplate,
  MonthlyAmountsMap,
  MonthlyActualsMap,
  CategoryTrendPoint,
  CategoryTrendItem,
  CompositionItem,
  ComparisonRow,
} from '../types';
import { resolveAmount } from '../stores/useMonthlyStore';
import { occursInMonth } from '../../shared/recurrence';

const OTHER_NAME = 'その他';
const OTHER_COLOR = '#6b7280';

type CategoryAccumulator = Map<number | null, { name: string; color: string; amount: number }>;

// Add a single template's contribution to the running per-category totals.
// Non-positive contributions are dropped (a 0 actual means "nothing spent").
function addContribution(
  totals: CategoryAccumulator,
  template: EntryTemplate,
  categoryMap: Map<number, Category>,
  amount: number,
): void {
  if (amount <= 0) return;
  const key = template.categoryId;
  const existing = totals.get(key);
  if (existing) {
    existing.amount += amount;
  } else {
    const cat = key != null ? categoryMap.get(key) : undefined;
    totals.set(key, {
      name: cat?.name ?? OTHER_NAME,
      color: cat?.color ?? OTHER_COLOR,
      amount,
    });
  }
}

// Aggregate one month into per-category totals from two distinct sources:
//   1. Recorded actuals — facts; counted regardless of the template's current `enabled`
//      state so toggling a template never rewrites historical analytics.
//   2. Planned fallback — for ACTIVE templates with no recorded actual that month, using
//      the monthly override or the template default. This keeps past/current months
//      populated even when actuals were never entered (the original blank-chart bug).
// Keeping the two sources separate is what prevents disabling a template from erasing its
// past actuals, or a default from being synthesized in place of a real recorded value.
function aggregateMonthByCategory(
  templates: EntryTemplate[],
  templateById: Map<number, EntryTemplate>,
  categoryMap: Map<number, Category>,
  amountsMap: MonthlyAmountsMap,
  actualsMap: MonthlyActualsMap,
  yearMonth: string,
  type: 'income' | 'expense',
): CategoryAccumulator {
  const totals: CategoryAccumulator = new Map();
  const monthActuals = actualsMap.get(yearMonth);

  if (monthActuals) {
    for (const [templateId, actualAmount] of monthActuals) {
      const template = templateById.get(templateId);
      if (!template || template.type !== type) continue;
      addContribution(totals, template, categoryMap, actualAmount);
    }
  }

  for (const template of templates) {
    if (!template.enabled || template.type !== type) continue;
    if (monthActuals?.has(template.id)) continue;
    // Only if it actually falls in this month. Without this an annual premium
    // would be synthesised into all twelve, turning a trend chart into a
    // straight line that no month's own total agrees with.
    //
    // The ACTUALS loop above deliberately has no such filter: a recorded actual
    // is a fact about a month, and it stays counted even if the recurrence was
    // edited afterwards.
    if (!occursInMonth(template.recurrence, yearMonth)) continue;
    const planned = resolveAmount(template.id, yearMonth, amountsMap, templates);
    addContribution(totals, template, categoryMap, planned);
  }

  return totals;
}

export function buildCategoryTrend(
  templates: EntryTemplate[],
  categories: Category[],
  amountsMap: MonthlyAmountsMap,
  actualsMap: MonthlyActualsMap,
  months: string[],
  type: 'income' | 'expense',
): CategoryTrendPoint[] {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const templateById = new Map(templates.map((t) => [t.id, t]));

  return months.map((yearMonth) => {
    const totals = aggregateMonthByCategory(templates, templateById, categoryMap, amountsMap, actualsMap, yearMonth, type);
    const items: CategoryTrendItem[] = Array.from(totals.entries())
      .map(([categoryId, data]) => ({
        categoryId,
        name: data.name,
        color: data.color,
        amount: data.amount,
      }))
      .sort((a, b) => b.amount - a.amount);

    return { yearMonth, categories: items };
  });
}

export function buildCompositionData(
  templates: EntryTemplate[],
  categories: Category[],
  amountsMap: MonthlyAmountsMap,
  actualsMap: MonthlyActualsMap,
  yearMonth: string,
  type: 'income' | 'expense',
): CompositionItem[] {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const totals = aggregateMonthByCategory(templates, templateById, categoryMap, amountsMap, actualsMap, yearMonth, type);

  const totalAmount = Array.from(totals.values()).reduce((sum, v) => sum + v.amount, 0);
  if (totalAmount === 0) return [];

  return Array.from(totals.entries())
    .map(([categoryId, data]) => ({
      categoryId,
      name: data.name,
      color: data.color,
      amount: data.amount,
      percentage: Math.round((data.amount / totalAmount) * 1000) / 10,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function buildComparisonData(
  trendData: CategoryTrendPoint[],
  targetMonth: string,
): ComparisonRow[] {
  const target = trendData.find((t) => t.yearMonth === targetMonth);
  if (!target) return [];

  const [year, month] = targetMonth.split('-').map(Number);
  const prevMonthDate = new Date(year, month - 2, 1);
  const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const prevYearMonth = `${year - 1}-${String(month).padStart(2, '0')}`;

  const prev = trendData.find((t) => t.yearMonth === prevMonth);
  const prevYear = trendData.find((t) => t.yearMonth === prevYearMonth);

  const prevMap = new Map(prev?.categories.map((c) => [c.categoryId, c.amount]) ?? []);
  const prevYearMap = new Map(prevYear?.categories.map((c) => [c.categoryId, c.amount]) ?? []);

  return target.categories.map((cat) => {
    const prevAmt = prevMap.get(cat.categoryId) ?? null;
    const prevYearAmt = prevYearMap.get(cat.categoryId) ?? null;

    return {
      categoryId: cat.categoryId,
      name: cat.name,
      color: cat.color,
      currentAmount: cat.amount,
      prevMonthDiff: prevAmt != null ? cat.amount - prevAmt : null,
      prevMonthPercent: prevAmt != null && prevAmt > 0
        ? Math.round(((cat.amount - prevAmt) / prevAmt) * 1000) / 10
        : null,
      prevYearDiff: prevYearAmt != null ? cat.amount - prevYearAmt : null,
      prevYearPercent: prevYearAmt != null && prevYearAmt > 0
        ? Math.round(((cat.amount - prevYearAmt) / prevYearAmt) * 1000) / 10
        : null,
    };
  });
}

export function generateMonthRange(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  const [startY, startM] = startMonth.split('-').map(Number);
  const [endY, endM] = endMonth.split('-').map(Number);

  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}
