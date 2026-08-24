import type { Category, CostType, EntryTemplate } from '../types';

// ---------------------------------------------------------------------------
// 固定費 / 変動費.
//
// The classification lives on the category (see shared/types.ts), so everything
// that wants to know whether an expense is committed or discretionary has to go
// through the category list. That lookup, the labels, and the way an
// unclassified category is counted are written down once here -- three views
// each deciding for themselves what "unclassified" means is how a total ends up
// disagreeing with the rows above it.
// ---------------------------------------------------------------------------

export const COST_TYPE_LABELS: Record<CostType, string> = {
  fixed: '固定費',
  variable: '変動費',
};

/** Shown wherever an expense category has not been classified yet. */
export const UNCLASSIFIED_LABEL = '未分類';

/**
 * Options for a <Select>. The empty string is the wire form of null, because an
 * HTML select cannot carry null -- parseCostType is the inverse.
 */
export const COST_TYPE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '', label: UNCLASSIFIED_LABEL },
  { value: 'fixed', label: COST_TYPE_LABELS.fixed },
  { value: 'variable', label: COST_TYPE_LABELS.variable },
];

/** Select value -> domain value. Anything unrecognised is "not classified". */
export function parseCostType(value: string): CostType | null {
  return value === 'fixed' || value === 'variable' ? value : null;
}

export function costTypeLabel(costType: CostType | null): string {
  return costType === null ? UNCLASSIFIED_LABEL : COST_TYPE_LABELS[costType];
}

/**
 * Badge tone for a classification.
 *
 * The label already lived here; the colour did not, and was written out twice --
 * once as Badge tones in the settings list and once as raw Tailwind classes in
 * the entries view. Two screens disagreeing about what colour 固定費 is would be
 * a small bug that nobody files.
 *
 * Typed as the literal union rather than imported from Badge so this module
 * keeps no dependency on a component; the values ARE Badge tones.
 */
export function costTypeTone(costType: CostType | null): 'info' | 'accent' | 'neutral' {
  if (costType === 'fixed') return 'info';
  if (costType === 'variable') return 'accent';
  return 'neutral';
}

export interface CostTypeBreakdown {
  fixed: number;
  variable: number;
  /** Expenses in a category with no classification, or in no category at all. */
  unclassified: number;
  total: number;
}

/**
 * Splits a month's planned expenses into 固定費 / 変動費 / 未分類.
 *
 * `amountOf` is passed in rather than the map it reads, so the caller keeps
 * deciding what an amount is -- planned, actual, or actual-falling-back-to-
 * planned. Baking that choice in here would make this function wrong for the
 * next screen that needs the same split.
 *
 * Disabled templates are excluded for the same reason they are excluded from the
 * month's expense total: a paused subscription is not a commitment.
 */
export function summarizeExpenseByCostType(
  templates: readonly EntryTemplate[],
  categories: readonly Category[],
  amountOf: (template: EntryTemplate) => number,
): CostTypeBreakdown {
  const costTypeById = new Map<number, CostType | null>(
    categories.map((category) => [category.id, category.costType]),
  );

  const breakdown: CostTypeBreakdown = { fixed: 0, variable: 0, unclassified: 0, total: 0 };

  for (const template of templates) {
    if (template.type !== 'expense' || !template.enabled) continue;

    const amount = amountOf(template);
    breakdown.total += amount;

    // A template pointing at a category that is not in the list (deleted while
    // the page was open) counts as unclassified rather than being dropped: the
    // parts must always add up to the total shown beside them.
    const costType = template.categoryId === null ? null : costTypeById.get(template.categoryId) ?? null;
    if (costType === 'fixed') breakdown.fixed += amount;
    else if (costType === 'variable') breakdown.variable += amount;
    else breakdown.unclassified += amount;
  }

  return breakdown;
}
