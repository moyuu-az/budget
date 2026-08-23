import type { Pool } from './pool';

// ---------------------------------------------------------------------------
// Least-privilege role for the application.
//
// WHY THIS EXISTS
//   Migration 002 turns on FORCE ROW LEVEL SECURITY, which already stops the
//   table owner from bypassing the policies. This adds the other half of the
//   same idea: the process serving requests connects as a role that can read
//   and write rows but cannot alter the schema, drop a policy, or read the
//   catalogue of another database.
//
//   Run migrations as the owner (the `postgres` user on Cloud SQL); run the
//   server as this role.
//
// The role name comes from configuration, never from source, so no deployment
// specific identifier is committed.
// ---------------------------------------------------------------------------

/**
 * Quotes a PostgreSQL identifier. GRANT cannot take bind parameters, so the
 * role name is interpolated -- which makes escaping mandatory rather than
 * stylistic. Doubling embedded quotes is exactly what quote_ident() does.
 */
function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) {
    // Reject anything that is not a plain identifier instead of trying to
    // escape it. A role name is operator-controlled configuration; if it needs
    // quoting to be safe, it is a typo or an injection attempt.
    throw new Error(`Invalid role name: ${name}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

export interface GrantOptions {
  /** Existing login role the server authenticates as. */
  role: string;
  /** Database whose CONNECT privilege is granted. */
  database: string;
}

/**
 * Idempotently grants the application role exactly what it needs.
 *
 * Deliberately NOT granted:
 *  - CREATE on the schema (no table or policy changes at runtime)
 *  - BYPASSRLS (would make migration 002 decorative)
 *  - ownership of any table (owners are exempt from RLS unless FORCE is set,
 *    and relying on FORCE alone is one `ALTER TABLE` away from a leak)
 */
export async function applyGrants(pool: Pool, { role, database }: GrantOptions): Promise<void> {
  const r = quoteIdent(role);
  const d = quoteIdent(database);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`GRANT CONNECT ON DATABASE ${d} TO ${r}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${r}`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${r}`,
    );
    // IDENTITY columns are backed by sequences; without USAGE every INSERT fails.
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${r}`);
    // Tables created by later migrations would otherwise need a manual re-grant.
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
         GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${r}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${r}`,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
