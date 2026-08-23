// ---------------------------------------------------------------------------
// Shared SQL fragments.
//
// The category and template repositories both accept a partial patch and have
// to turn it into `SET col = $n, ...`. Written out by hand that is the same
// twenty lines twice, and adding a column means remembering to touch both --
// the sort of duplication that quietly grows a third copy.
// ---------------------------------------------------------------------------

export interface SetClause {
  /** e.g. ['name = $1', 'color = $2'] -- empty when the patch changed nothing. */
  sets: string[];
  params: unknown[];
}

/**
 * Turns a partial domain patch into an assignment list.
 *
 * `columns` maps a domain field to its column name and is the single place that
 * knows the correspondence, so a renamed column is a one-line change.
 *
 * Only `undefined` means "not supplied". `null` is a real value -- clearing a
 * category colour or detaching a template from its category both travel as
 * null, and treating them as absent would silently drop the edit.
 */
export function buildSetClause<T extends object>(
  patch: Partial<T>,
  columns: Partial<Record<keyof T, string>>,
  startIndex = 1,
): SetClause {
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [field, column] of Object.entries(columns) as [keyof T, string][]) {
    const value = patch[field];
    if (value === undefined) continue;
    params.push(value);
    sets.push(`${column} = $${startIndex + params.length - 1}`);
  }

  return { sets, params };
}
