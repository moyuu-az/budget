import type { Pool } from './pool';

// ---------------------------------------------------------------------------
// Start-up guard: refuse to serve if row-level security cannot bind.
//
// WHY THIS EXISTS
//   Repository reads carry no `WHERE ledger_id` -- the predicate comes from the
//   policies in migration 002 (see server/repositories/index.ts for why). That
//   arrangement has one catastrophic failure mode: PostgreSQL exempts
//   SUPERUSERS and roles holding BYPASSRLS from row-level security
//   unconditionally. FORCE ROW LEVEL SECURITY does not change it.
//
//   Point the server at the `postgres` user and every policy silently stops
//   applying. Nothing errors. Queries keep returning rows -- just the wrong
//   ones, from whichever ledger the planner reached first. One household would
//   see the other's private ledger, and the only symptom would be numbers that
//   look slightly off.
//
//   This was not hypothetical: it happened during development, when the server
//   was started against a superuser connection for a smoke test. A request for
//   an empty private ledger cheerfully returned the shared household balance.
//
//   So the condition is checked once, loudly, before the first request. A
//   configuration mistake becomes a container that will not start instead of a
//   data leak nobody notices.
// ---------------------------------------------------------------------------

export async function assertIsolationEnforceable(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{
    role: string;
    is_superuser: boolean;
    bypasses_rls: boolean;
  }>(
    `SELECT current_user AS role,
            rolsuper     AS is_superuser,
            rolbypassrls AS bypasses_rls
       FROM pg_roles
      WHERE rolname = current_user`,
  );

  if (rows.length === 0) {
    // current_user has no pg_roles row: possible with some managed-service
    // proxies. Better to stop than to assume isolation holds.
    throw new Error(
      'Cannot determine the privileges of the connected database role; refusing to start',
    );
  }

  const { role, is_superuser, bypasses_rls } = rows[0];
  if (is_superuser || bypasses_rls) {
    const reason = is_superuser ? 'is a SUPERUSER' : 'holds BYPASSRLS';
    throw new Error(
      `Database role "${role}" ${reason}, which bypasses row-level security. ` +
        'Ledger isolation would not apply and one ledger\'s data could be served for another. ' +
        'Connect as a least-privilege role instead (see DATABASE_APP_ROLE in .env.example), ' +
        'and run migrations separately as the owner.',
    );
  }
}
