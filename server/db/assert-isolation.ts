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
  // Checks INHERITED privileges, not just the role's own attributes.
  //
  // `SELECT rolsuper FROM pg_roles WHERE rolname = current_user` would miss the
  // realistic case: an ordinary-looking role that was granted membership of a
  // privileged one. pg_has_role(..., 'USAGE') is true when the current user can
  // actually exercise that role's privileges, which is the question that
  // matters -- a role inheriting BYPASSRLS bypasses row-level security just as
  // completely as one holding it directly.
  const { rows } = await pool.query<{
    role: string;
    via: string | null;
    is_superuser: boolean;
    bypasses_rls: boolean;
  }>(
    `SELECT current_user AS role,
            r.rolname    AS via,
            r.rolsuper   AS is_superuser,
            r.rolbypassrls AS bypasses_rls
       FROM pg_roles r
      WHERE pg_has_role(current_user, r.oid, 'USAGE')
        AND (r.rolsuper OR r.rolbypassrls)
      LIMIT 1`,
  );

  // No row means no reachable role carries either attribute -- the safe case.
  if (rows.length === 0) return;

  const { role, via, is_superuser } = rows[0];
  const attribute = is_superuser ? 'SUPERUSER' : 'BYPASSRLS';
  const how = via === role ? `is ${attribute}` : `inherits ${attribute} from "${via ?? '?'}"`;

  throw new Error(
    `Database role "${role}" ${how}, which bypasses row-level security. ` +
      "Ledger isolation would not apply and one ledger's data could be served for another. " +
      'Connect as a least-privilege role instead (see DATABASE_APP_ROLE in .env.example), ' +
      'and run migrations separately as the owner.',
  );
}
