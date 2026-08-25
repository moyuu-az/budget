/**
 * How a ledger-scoped store's data is doing.
 *
 * WHY AN ENUM AND NOT TWO BOOLEANS
 *   The pair `loading` / `loaded` can say things that are not true -- both
 *   false means "idle" in one reading and "failed" in another, and nothing
 *   stops both being set at once. That ambiguity had a cost: a fetch that
 *   failed was indistinguishable from one still in flight, so the dashboard
 *   showed its loading skeleton forever, with no error and no way to retry.
 *
 *   Four named states cannot be ambiguous, and every consumer is forced to say
 *   what it does about 'error' rather than defaulting it into "still waiting".
 */
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * The status of a view that needs SEVERAL stores before it can show anything.
 *
 * Pessimistic on purpose: one failure makes the whole view failed, because a
 * screen assembled from half its data is a screen that shows a wrong number
 * rather than an incomplete one. 'idle' folds into 'loading' -- every one of
 * these fetches is started at mount, so "not started" is a frame, not a state
 * a user can sit in.
 */
export function combineStatus(...statuses: readonly LoadStatus[]): LoadStatus {
  if (statuses.includes('error')) return 'error';
  return statuses.every((status) => status === 'ready') ? 'ready' : 'loading';
}
