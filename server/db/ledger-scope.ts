import type { Pool, PoolClient } from './pool';

// ---------------------------------------------------------------------------
// The one place a ledger scope is opened.
//
// Everything that touches ledger-scoped data runs inside withLedgerScope. It
// wraps the work in a transaction and stamps the ledger onto that transaction,
// which is what the row-level security policies in migration 002 read.
// ---------------------------------------------------------------------------

/** PostgreSQL GUC name shared with the RLS policies. Change both or neither. */
const LEDGER_GUC = 'app.current_ledger_id';

/**
 * Runs `fn` in a transaction scoped to one ledger.
 *
 * Two details are load-bearing:
 *
 *  - `set_config(..., is_local => true)` makes the setting last only until the
 *    transaction ends. Connections come from a pool and are reused across
 *    requests; a session-level SET would leak one person's ledger into the next
 *    request that happened to get the same socket.
 *
 *  - The ledger id is passed as a bind parameter, not interpolated. `SET LOCAL`
 *    cannot take parameters, which is exactly why set_config() is used instead
 *    -- it is a normal function call and therefore parameterisable.
 *
 * The transaction also gives every handler atomicity for free, which
 * copyMonthlyAmounts (a multi-row insert) previously had to arrange itself.
 */
export async function withLedgerScope<T>(
  pool: Pool,
  ledgerId: number,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!Number.isInteger(ledgerId) || ledgerId <= 0) {
    // Guard rather than trust the caller: a NaN reaching set_config would make
    // the GUC unset, and an unset GUC means the policies fail *closed* -- an
    // empty result that looks like "no data" instead of "bad request".
    throw new Error(`withLedgerScope: invalid ledgerId ${String(ledgerId)}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', [LEDGER_GUC, String(ledgerId)]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {
      // A rollback failure means the connection is already broken; surface the
      // original error, which is the one that explains what went wrong.
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Runs `fn` on a pooled connection with NO ledger scope.
 *
 * Only server/auth/ may use this, and only against users / ledgers /
 * ledger_members -- the tables that must be readable before a ledger has been
 * chosen. Reaching for it from a domain repository defeats both isolation
 * layers at once.
 */
export async function withoutLedgerScope<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
