import type { Pool, PoolClient } from './pool';
import { withTransaction } from './ledger-scope';

// ---------------------------------------------------------------------------
// The one place a USER scope is opened.
//
// The twin of withLedgerScope. Everything that touches user-scoped data --
// today, the English study record -- runs inside withUserScope, which wraps the
// work in a transaction and stamps the user onto that transaction for the
// row-level security policies added by migration 006 to read.
//
// WHY A SECOND MECHANISM AND NOT A REUSE OF THE FIRST
//   They answer different questions. `app.current_ledger_id` says which
//   household's books are open; `app.current_user_id` says whose study record
//   is open. Overloading one GUC to mean both would make the policies on the two
//   families of table indistinguishable in `pg_policies`, and a table given the
//   wrong one would still pass every ENABLE/FORCE check while filtering by
//   something unrelated.
// ---------------------------------------------------------------------------

/** PostgreSQL GUC name shared with the RLS policies. Change both or neither. */
const USER_GUC = 'app.current_user_id';

/**
 * Runs `fn` in a transaction scoped to one user.
 *
 * The same two details are load-bearing as in withLedgerScope:
 *
 *  - `set_config(..., is_local => true)` makes the setting last only until the
 *    transaction ends. Connections come from a pool and are reused across
 *    requests; a session-level SET would leak one person's identity into the
 *    next request that happened to get the same socket -- and here that means
 *    one person's answers being recorded against the other's name.
 *
 *  - The id is a bind parameter, not interpolated. `SET LOCAL` cannot take
 *    parameters, which is exactly why set_config() is used instead.
 */
export async function withUserScope<T>(
  pool: Pool,
  userId: number,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!Number.isInteger(userId) || userId <= 0) {
    // Guard rather than trust the caller: a NaN reaching set_config would leave
    // the GUC unset, and an unset GUC makes the policies fail *closed* -- an
    // empty study record that looks like "you have not started" instead of
    // "that request was malformed".
    throw new Error(`withUserScope: invalid userId ${String(userId)}`);
  }

  return withTransaction(pool, async (client) => {
    await client.query('SELECT set_config($1, $2, true)', [USER_GUC, String(userId)]);
    return fn(client);
  });
}
