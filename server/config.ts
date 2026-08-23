import { z } from 'zod';

// ---------------------------------------------------------------------------
// Runtime configuration.
//
// Everything deployment-specific -- connection strings, role names, the list of
// people allowed to sign in -- is read from the environment and validated here.
// Nothing in this repository names a real account, project or database.
//
// Parsing happens once, eagerly, so a misconfigured deployment fails at start
// up with a precise message instead of at the first request with a confusing
// one.
// ---------------------------------------------------------------------------

const databaseSchema = z.object({
  /**
   * postgres://user:password@host:port/database
   *
   * On Cloud Run with the built-in Cloud SQL connector the host is the unix
   * socket path (/cloudsql/PROJECT:REGION:INSTANCE), which node-postgres accepts
   * in the `host` query parameter form.
   */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /** Set when the driver must negotiate TLS itself (a direct public IP). */
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  /**
   * Login role the *server* uses. Only the migration tooling needs to know it,
   * so it can grant that role privileges (server/db/grants.ts). Leave unset to
   * skip the grant step -- appropriate for local development, where the
   * developer's own role owns everything.
   */
  DATABASE_APP_ROLE: z.string().optional(),
});

export type DatabaseConfig = {
  url: string;
  ssl: boolean;
  appRole?: string;
};

export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const parsed = databaseSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid database configuration -- ${detail}`);
  }
  return {
    url: parsed.data.DATABASE_URL,
    ssl: parsed.data.DATABASE_SSL,
    appRole: parsed.data.DATABASE_APP_ROLE,
  };
}

/** Database name from a connection string, for the CONNECT grant. */
export function databaseNameFromUrl(url: string): string {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name) throw new Error(`DATABASE_URL has no database name: ${url}`);
  return name;
}
