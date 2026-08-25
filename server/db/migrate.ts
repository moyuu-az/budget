import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from './pool';

// ---------------------------------------------------------------------------
// Forward-only migration runner.
//
// Each .sql file in migrations/ is applied once, in filename order, inside its
// own transaction, and recorded in schema_migrations. Adding a schema change
// means adding a numbered file -- never editing an applied one, since applied
// files are skipped and the edit would only ever reach a fresh database.
// ---------------------------------------------------------------------------

/**
 * Advisory lock key, so two processes starting at once cannot apply the same
 * migration twice. The number is arbitrary but must never change: it is the
 * identity of the lock, and a different value would let an old and a new
 * deployment run migrations concurrently.
 *
 * Cloud Run can start several instances of a new revision simultaneously, which
 * makes this a real scenario rather than a theoretical one.
 */
const MIGRATION_LOCK_KEY = 4_027_316_501;

const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

/**
 * Default location, resolved from the working directory rather than from this
 * module's own path so it behaves the same whether run through tsx (source) or
 * from a bundle. Both the npm scripts and the container image run with the
 * project root as the working directory.
 */
export function defaultMigrationsDir(): string {
  return path.join(process.cwd(), 'server', 'db', 'migrations');
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

export async function migrate(
  pool: Pool,
  migrationsDir: string = defaultMigrationsDir(),
): Promise<MigrateResult> {
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];

  // PostgreSQL notices -- RAISE WARNING and friends -- reach node-postgres as an
  // event on the connection and are DISCARDED unless something listens. They do
  // not appear in the result object.
  //
  // That silence is not acceptable here. A migration that moves data cannot
  // abort on one bad row (it would block the whole deployment for one ledger),
  // so it warns and carries on -- 004 does exactly that when a stored balance
  // will not parse or overflows the column. Without this listener the operator
  // is never told that a figure was rewritten, which turns "reported rather than
  // thrown" into "swallowed".
  const onNotice = (notice: { severity?: string; message?: string }): void => {
    console.warn(`[migration] ${notice.severity ?? 'NOTICE'}: ${notice.message ?? ''}`);
  };
  client.on('notice', onNotice);

  try {
    // Blocks until any other migrating process finishes; released with the
    // session when the client is returned to the pool.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(MIGRATIONS_TABLE);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort();

    const { rows } = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations',
    );
    const done = new Set(rows.map((row) => row.version));

    for (const file of files) {
      if (done.has(file)) {
        skipped.push(file);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      // DDL is transactional in PostgreSQL, so a failure half way through a file
      // leaves nothing behind and the version is not recorded.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {
      // Losing the connection releases the lock anyway.
    });
    // Removed before the connection goes back to the pool: it is a shared
    // connection, and a listener left behind would narrate every later query.
    client.off('notice', onNotice);
    client.release();
  }

  return { applied, skipped };
}
