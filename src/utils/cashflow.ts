import type { EntryTemplate, Category, MonthlyAmountsMap } from '../types';
import { resolveAmount } from '../stores/useMonthlyStore';

export interface CashFlowNode {
  name: string;
  color: string;
  value: number;
  type: 'income' | 'total' | 'expense' | 'savings' | 'deficit';
}

export interface CashFlowLink {
  source: number;
  target: number;
  value: number;
  sourceColor: string;
  targetColor: string;
}

export interface CashFlowSummary {
  totalIncome: number;
  totalExpenses: number;
  net: number;
}

export interface CashFlowData {
  nodes: CashFlowNode[];
  links: CashFlowLink[];
  summary: CashFlowSummary;
}

const TOTAL_NODE_COLOR = '#60a5fa';
const SAVINGS_COLOR = '#34d399';
const DEFICIT_COLOR = '#f87171';

export function buildCashFlowData(
  templates: EntryTemplate[],
  monthlyAmountsMap: MonthlyAmountsMap,
  categories: Category[],
  yearMonth: string,
): CashFlowData | null {
  const enabled = templates.filter((t) => t.enabled);
  if (enabled.length === 0) return null;

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const incomeByCategory = new Map<
    number | 'uncategorized',
    { name: string; color: string; total: number }
  >();
  const expenseByCategory = new Map<
    number | 'uncategorized',
    { name: string; color: string; total: number }
  >();

  for (const template of enabled) {
    const amount = resolveAmount(template.id, yearMonth, monthlyAmountsMap, templates);
    if (amount <= 0) continue;

    const catKey = template.categoryId ?? 'uncategorized';
    const cat = template.categoryId != null ? categoryMap.get(template.categoryId) : null;
    const catName = cat?.name ?? 'その他';
    const catColor = cat?.color ?? '#6b7280';

    const targetMap = template.type === 'income' ? incomeByCategory : expenseByCategory;

    if (targetMap.has(catKey)) {
      targetMap.get(catKey)!.total += amount;
    } else {
      targetMap.set(catKey, { name: catName, color: catColor, total: amount });
    }
  }

  if (incomeByCategory.size === 0 && expenseByCategory.size === 0) return null;

  const incomeEntries = Array.from(incomeByCategory.values());
  const expenseEntries = Array.from(expenseByCategory.values());
  expenseEntries.sort((a, b) => b.total - a.total);

  const totalIncome = incomeEntries.reduce((sum, e) => sum + e.total, 0);
  const totalExpenses = expenseEntries.reduce((sum, e) => sum + e.total, 0);
  const net = totalIncome - totalExpenses;

  const nodes: CashFlowNode[] = [];
  const links: CashFlowLink[] = [];

  // Column 0 (left): Income source nodes
  for (const entry of incomeEntries) {
    nodes.push({ name: entry.name, color: entry.color, value: entry.total, type: 'income' });
  }

  // If deficit, add "不足分" source node on the left
  if (net < 0) {
    nodes.push({
      name: '不足分',
      color: DEFICIT_COLOR,
      value: Math.abs(net),
      type: 'deficit',
    });
  }

  // Column 1 (center): Total node
  const totalNodeValue = Math.max(totalIncome, totalExpenses);
  const totalNodeIndex = nodes.length;
  nodes.push({
    name: '総収入',
    color: TOTAL_NODE_COLOR,
    value: totalNodeValue,
    type: 'total',
  });

  // Column 2 (right): Expense category nodes
  const expenseStartIndex = nodes.length;
  for (const entry of expenseEntries) {
    nodes.push({ name: entry.name, color: entry.color, value: entry.total, type: 'expense' });
  }

  // Links: Income sources → Total node
  for (let i = 0; i < incomeEntries.length; i++) {
    links.push({
      source: i,
      target: totalNodeIndex,
      value: incomeEntries[i].total,
      sourceColor: incomeEntries[i].color,
      targetColor: TOTAL_NODE_COLOR,
    });
  }

  // Link: Deficit source → Total node (if deficit)
  if (net < 0) {
    const deficitNodeIndex = incomeEntries.length;
    links.push({
      source: deficitNodeIndex,
      target: totalNodeIndex,
      value: Math.abs(net),
      sourceColor: DEFICIT_COLOR,
      targetColor: TOTAL_NODE_COLOR,
    });
  }

  // Links: Total node → Expense categories
  for (let j = 0; j < expenseEntries.length; j++) {
    links.push({
      source: totalNodeIndex,
      target: expenseStartIndex + j,
      value: expenseEntries[j].total,
      sourceColor: TOTAL_NODE_COLOR,
      targetColor: expenseEntries[j].color,
    });
  }

  // If surplus, add "貯蓄" node and link together
  if (net > 0) {
    const savingsNodeIndex = nodes.length;
    nodes.push({ name: '貯蓄', color: SAVINGS_COLOR, value: net, type: 'savings' });
    links.push({
      source: totalNodeIndex,
      target: savingsNodeIndex,
      value: net,
      sourceColor: TOTAL_NODE_COLOR,
      targetColor: SAVINGS_COLOR,
    });
  }

  return {
    nodes,
    links,
    summary: { totalIncome, totalExpenses, net },
  };
}
