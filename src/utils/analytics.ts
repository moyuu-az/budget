import type {
  ActualWithCategory,
  Category,
  EntryTemplate,
  MonthlyAmountsMap,
  CategoryTrendPoint,
  CompositionItem,
  ComparisonRow,
} from '../types';
import { resolveAmount } from '../stores/useMonthlyStore';

export function buildCategoryTrend(
  actuals: ActualWithCategory[],
  templates: EntryTemplate[],
  categories: Category[],
  monthlyAmountsMap: MonthlyAmountsMap,
  months: string[],
  todayYearMonth: string,
): CategoryTrendPoint[] {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return months.map((ym) => {
    const categoryTotals = new Map<number | null, { name: string; color: string; amount: number }>();

    if (ym <= todayYearMonth) {
      const monthActuals = actuals.filter((a) => a.yearMonth === ym);
      for (const a of monthActuals) {
        const key = a.categoryId;
        const existing = categoryTotals.get(key);
        if (existing) {
          existing.amount += a.actualAmount;
        } else {
          categoryTotals.set(key, {
            name: a.categoryName ?? 'その他',
            color: a.categoryColor ?? '#6b7280',
            amount: a.actualAmount,
          });
        }
      }
    } else {
      const enabled = templates.filter((t) => t.enabled);
      for (const t of enabled) {
        const amount = resolveAmount(t.id, ym, monthlyAmountsMap, templates);
        if (amount <= 0) continue;
        const key = t.categoryId;
        const cat = key != null ? categoryMap.get(key) : null;
        const existing = categoryTotals.get(key);
        if (existing) {
          existing.amount += amount;
        } else {
          categoryTotals.set(key, {
            name: cat?.name ?? 'その他',
            color: cat?.color ?? '#6b7280',
            amount,
          });
        }
      }
    }

    const items = Array.from(categoryTotals.entries()).map(([categoryId, data]) => ({
      categoryId,
      name: data.name,
      color: data.color,
      amount: data.amount,
    }));
    items.sort((a, b) => b.amount - a.amount);

    return { yearMonth: ym, categories: items };
  });
}

export function buildCompositionData(
  actuals: ActualWithCategory[],
  templates: EntryTemplate[],
  categories: Category[],
  monthlyAmountsMap: MonthlyAmountsMap,
  yearMonth: string,
  todayYearMonth: string,
  type: 'expense' | 'income' = 'expense',
): CompositionItem[] {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<number | null, { name: string; color: string; amount: number }>();

  if (yearMonth <= todayYearMonth) {
    const monthActuals = actuals.filter((a) => a.yearMonth === yearMonth && a.templateType === type);
    for (const a of monthActuals) {
      const key = a.categoryId;
      const existing = totals.get(key);
      if (existing) {
        existing.amount += a.actualAmount;
      } else {
        totals.set(key, {
          name: a.categoryName ?? 'その他',
          color: a.categoryColor ?? '#6b7280',
          amount: a.actualAmount,
        });
      }
    }
  } else {
    const enabled = templates.filter((t) => t.enabled && t.type === type);
    for (const t of enabled) {
      const amount = resolveAmount(t.id, yearMonth, monthlyAmountsMap, templates);
      if (amount <= 0) continue;
      const key = t.categoryId;
      const cat = key != null ? categoryMap.get(key) : null;
      const existing = totals.get(key);
      if (existing) {
        existing.amount += amount;
      } else {
        totals.set(key, {
          name: cat?.name ?? 'その他',
          color: cat?.color ?? '#6b7280',
          amount,
        });
      }
    }
  }

  const totalAmount = Array.from(totals.values()).reduce((sum, v) => sum + v.amount, 0);
  if (totalAmount === 0) return [];

  const items = Array.from(totals.entries()).map(([categoryId, data]) => ({
    categoryId,
    name: data.name,
    color: data.color,
    amount: data.amount,
    percentage: Math.round((data.amount / totalAmount) * 1000) / 10,
  }));
  items.sort((a, b) => b.amount - a.amount);

  return items;
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
