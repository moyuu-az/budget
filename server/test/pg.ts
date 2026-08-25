import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createPool, type Pool, type PoolClient } from '../db/pool';
import { migrate } from '../db/migrate';
import { applyGrants } from '../db/grants';

// ---------------------------------------------------------------------------
// A real PostgreSQL for the tests that need one.
//
// Row-level security, composite foreign keys and ON DELETE SET NULL (col) are
// database behaviour. An in-memory fake would happily agree with whatever the
// repositories claim, which is the opposite of what these tests exist to check,
// so they run against the major version the deployment targets.
//
// PostgreSQL 16 is not incidental: the ON DELETE SET NULL column list in
// migration 001 requires 15 or newer.
//
// TWO ROLES, AND WHY IT MATTERS
//   PostgreSQL exempts SUPERUSERS and roles holding BYPASSRLS from row-level
//   security *unconditionally* -- FORCE ROW LEVEL SECURITY does not change that.
//   The container's default user is a superuser, so testing isolation through it
//   would prove nothing: every policy would appear to do nothing.
//
//   So the harness mirrors the production split. Migrations run as the
//   superuser/owner. Everything that stands in for the application connects as
//   APP_ROLE, an ordinary LOGIN role. If the deployment ever points the server
//   at the `postgres` user, isolation silently disappears -- which is precisely
//   what these two pools keep honest.
// ---------------------------------------------------------------------------

const IMAGE = 'postgres:16-alpine';
const APP_ROLE = 'app_user';
const APP_PASSWORD = 'app_password';

/** Tables holding ledger-scoped data, in an order safe to truncate together. */
export const LEDGER_SCOPED_TABLES = [
  'monthly_amounts',
  'monthly_actuals',
  'balance_snapshots',
  'entry_templates',
  'categories',
  'settings',
  // Assets before their categories: TRUNCATE ... CASCADE would cope either way,
  // but the order is also what the isolation sweep compares, and a dependent
  // table listed after its parent reads as an oversight.
  'assets',
  'asset_categories',
] as const;

export interface TestDb {
  /** Connects as a non-superuser, non-owner role: row-level security applies. */
  pool: Pool;
  /** Connects as the superuser: bypasses RLS, for fixtures and cross-ledger assertions. */
  adminPool: Pool;
  stop(): Promise<void>;
}

export interface StartTestDbOptions {
  /**
   * Where to read migrations from. Defaults to the real directory.
   *
   * A test that needs the schema as it stood at some earlier version points this
   * at a directory holding only the migrations up to that point, then applies
   * the rest itself -- which is the only way to exercise a migration that MOVES
   * DATA rather than only changing shapes.
   */
  migrationsDir?: string;
}

export function migrationsDir(): string {
  return path.join(process.cwd(), 'server', 'db', 'migrations');
}

export async function startTestDb(options: StartTestDbOptions = {}): Promise<TestDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(IMAGE).start();

  const adminPool = createPool({ connectionString: container.getConnectionUri(), max: 4 });
  await migrate(adminPool, options.migrationsDir ?? migrationsDir());

  // The role the "application" uses. NOSUPERUSER/NOBYPASSRLS are the defaults
  // for CREATE ROLE and are spelled out here because they are the entire point.
  await adminPool.query(
    `CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
  );
  await applyGrants(adminPool, { role: APP_ROLE, database: container.getDatabase() });

  const pool = createPool({
    connectionString: `postgres://${APP_ROLE}:${APP_PASSWORD}@${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    max: 4,
  });

  return {
    pool,
    adminPool,
    async stop() {
      await pool.end();
      await adminPool.end();
      await container.stop();
    },
  };
}

/** Removes all ledger data and the ledgers/users themselves. Admin-only. */
export async function resetDb(adminPool: Pool): Promise<void> {
  await adminPool.query(
    `TRUNCATE ${LEDGER_SCOPED_TABLES.join(', ')}, ledger_members, ledgers, users RESTART IDENTITY CASCADE`,
  );
}

/** Creates a ledger directly, standing in for the auth layer's provisioning. */
export async function createLedger(
  adminPool: Pool,
  slug: string,
  kind: 'shared' | 'personal' = 'personal',
): Promise<number> {
  const { rows } = await adminPool.query<{ id: number }>(
    'INSERT INTO ledgers (slug, name, kind) VALUES ($1, $2, $3) RETURNING id',
    [slug, slug, kind],
  );
  return rows[0].id;
}

/**
 * Runs a query as the superuser, unfiltered by row-level security.
 *
 * This is how a test asserts what is REALLY stored, independent of what a
 * ledger-scoped read is willing to show.
 */
export async function raw<T extends Record<string, unknown>>(
  adminPool: Pool,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client: PoolClient = await adminPool.connect();
  try {
    const { rows } = await client.query<T>(sql, params);
    return rows;
  } finally {
    client.release();
  }
}
