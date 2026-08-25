// ---------------------------------------------------------------------------
// WHICH LEDGER A RESPONSE BELONGS TO.
//
// Switching ledgers clears every store and starts a fresh set of requests. What
// it cannot do is un-send the requests already in flight for the PREVIOUS
// ledger -- and when one of those answers, its store writes it without knowing
// the question is no longer being asked.
//
// The result is a household budget showing another household's figures under the
// right household's name: not a leak (the server answered the right person, for
// a ledger they are a member of) but wrong, silent, and sticky -- nothing
// refetches until the next switch or reload.
//
// The window is small and entirely reachable: switch back and forth quickly, or
// switch while one endpoint is slower than the rest. The browser's six-connection
// limit makes "one response arrives late" ordinary rather than exotic.
//
// WHY A COUNTER AND NOT A LEDGER ID
//   Comparing ledger ids would miss the switch-away-and-back case (A -> B -> A):
//   a stale response for the FIRST A still names A and would be accepted, even
//   though the data behind it has been reset twice since. A counter that only
//   ever increases is true for every sequence.
//
// WHY IT LIVES HERE AND NOT IN EACH STORE
//   The alternative is each store remembering the id it asked for -- six copies
//   of the same reasoning, and a seventh store added later with none. One
//   counter, one helper, and a store either uses it or visibly does not.
// ---------------------------------------------------------------------------

let generation = 0;

/**
 * Invalidates every request already in flight.
 *
 * Called by switchLedger, beside resetLedgerData: clearing what has arrived and
 * disowning what has not are two halves of the same act, and doing only the
 * first is what leaves the gap.
 */
export function invalidateInFlight(): void {
  generation += 1;
}

/** The generation a request should be tagged with. */
export function currentGeneration(): number {
  return generation;
}

/**
 * Runs `apply` only if no ledger switch has happened since `taggedAt`.
 *
 * Written as a guard around the WRITE rather than around the request, because
 * the request itself is harmless -- it is the store update that has to be
 * refused. Returning a boolean lets the caller also skip its own bookkeeping
 * (setting a status, raising an error toast) for an answer nobody is waiting
 * for.
 */
export function applyIfCurrent(taggedAt: number, apply: () => void): boolean {
  if (taggedAt !== generation) return false;
  apply();
  return true;
}
