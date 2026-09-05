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
const OWNER_ROLE = 'schema_owner';
const OWNER_PASSWORD = 'owner_password';

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

/**
 * Tables holding USER-scoped data -- one person's, not one household's.
 *
 * Separate from LEDGER_SCOPED_TABLES because the two are protected by different
 * predicates (`app_current_user_id()` vs `app_current_ledger_id()`), and a table
 * checked against the wrong one would still look guarded in every ENABLE/FORCE
 * assertion. Keeping the lists apart is what lets each drift guard demand its
 * OWN predicate.
 *
 * `resetDb` already truncates `users` with CASCADE, which would take these with
 * it. They are named anyway: a table that is only cleared as a side effect of a
 * foreign key stops being cleared the day someone drops the key, and the failure
 * would show up as tests that pass alone and fail together.
 */
export const USER_SCOPED_TABLES = ['vocab_attempts'] as const;

export interface TestDb {
  /** Connects as a non-superuser, non-owner role: row-level security applies. */
  pool: Pool;
  /** Connects as the superuser: bypasses RLS, for fixtures and cross-ledger assertions. */
  adminPool: Pool;
  /**
   * Connects as the role that OWNS the schema -- the stand-in for the role that
   * runs migrations in production.
   *
   * Only distinct from `adminPool` when `nonSuperuserOwner` was set; otherwise
   * it is the same superuser pool, which bypasses RLS. A test that applies a
   * migration and means to exercise the policies must ask for the option.
   */
  ownerPool: Pool;
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

  /**
   * Own the schema with a role that is NOT a superuser, and expose a pool
   * connected as it (`ownerPool`).
   *
   * WHY THIS OPTION HAS TO EXIST
   *   The container's default user is a real superuser, and PostgreSQL exempts
   *   superusers from row-level security UNCONDITIONALLY -- FORCE ROW LEVEL
   *   SECURITY does not change that. Migrations applied through it therefore run
   *   with the policies switched off.
   *
   *   Cloud SQL's `postgres` is NOT a real superuser (it is a member of
   *   cloudsqlsuperuser, with rolsuper = false), so in production the policies
   *   DO apply to the role running migrations. A migration that writes rows must
   *   set `app.current_ledger_id` per ledger or its INSERTs are rejected -- and
   *   a test running as a true superuser would pass whether or not it did.
   *
   *   That asymmetry is the worst kind: green here, broken only in production.
   *   Any test covering a migration that moves DATA should set this.
   */
  nonSuperuserOwner?: boolean;
}

export function migrationsDir(): string {
  return path.join(process.cwd(), 'server', 'db', 'migrations');
}

export async function startTestDb(options: StartTestDbOptions = {}): Promise<TestDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(IMAGE).start();

  const connect = (user: string, password: string): Pool =>
    createPool({
      connectionString: `postgres://${user}:${password}@${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
      max: 4,
    });

  const adminPool = createPool({ connectionString: container.getConnectionUri(), max: 4 });

  // The role that owns the schema. NOSUPERUSER/NOBYPASSRLS mirror Cloud SQL's
  // `postgres`, which is not a real superuser -- see the option's note.
  let ownerPool = adminPool;
  if (options.nonSuperuserOwner) {
    await adminPool.query(
      `CREATE ROLE ${OWNER_ROLE} LOGIN PASSWORD '${OWNER_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
    );
    // CREATE on the schema so it can create the tables it will then own; the
    // objects it creates belong to it, which is what makes FORCE RLS meaningful.
    await adminPool.query(`GRANT CREATE, USAGE ON SCHEMA public TO ${OWNER_ROLE}`);
    // And the DATABASE, which is not decoration: applyGrants issues
    // `GRANT CONNECT ON DATABASE` and `GRANT USAGE ON SCHEMA`, and a non-owner
    // running those gets `WARNING: no privileges were granted` rather than an
    // error. The app role would still connect -- through PUBLIC's defaults, not
    // through anything applyGrants did -- so the harness would be quietly
    // weaker than production, where Cloud SQL's `postgres` owns the database.
    await adminPool.query(
      `ALTER DATABASE ${container.getDatabase()} OWNER TO ${OWNER_ROLE}`,
    );
    ownerPool = connect(OWNER_ROLE, OWNER_PASSWORD);
  }

  await migrate(ownerPool, options.migrationsDir ?? migrationsDir());

  // The role the "application" uses. NOSUPERUSER/NOBYPASSRLS are the defaults
  // for CREATE ROLE and are spelled out here because they are the entire point.
  await adminPool.query(
    `CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
  );
  // Granted by the owner: only the owner can hand out privileges on its tables.
  await applyGrants(ownerPool, { role: APP_ROLE, database: container.getDatabase() });

  const pool = connect(APP_ROLE, APP_PASSWORD);

  return {
    pool,
    adminPool,
    ownerPool,
    async stop() {
      await pool.end();
      if (ownerPool !== adminPool) await ownerPool.end();
      await adminPool.end();
      await container.stop();
    },
  };
}

/** Removes all ledger data and the ledgers/users themselves. Admin-only. */
export async function resetDb(adminPool: Pool): Promise<void> {
  await adminPool.query(
    `TRUNCATE ${LEDGER_SCOPED_TABLES.join(', ')}, ${USER_SCOPED_TABLES.join(', ')}, ledger_members, ledgers, users RESTART IDENTITY CASCADE`,
  );
}

/** Creates a user directly, standing in for the auth layer's provisioning. */
export async function createUser(adminPool: Pool, email: string): Promise<number> {
  const { rows } = await adminPool.query<{ id: number }>(
    'INSERT INTO users (google_sub, email, display_name) VALUES ($1, $2, $3) RETURNING id',
    [`sub:${email}`, email, email.split('@')[0]],
  );
  return rows[0].id;
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
