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

// ---------------------------------------------------------------------------
// Server configuration
// ---------------------------------------------------------------------------

const serverSchema = z.object({
  /** Cloud Run supplies this; 8080 is its default contract. */
  PORT: z.coerce.number().int().positive().default(8080),

  NODE_ENV: z.string().default('development'),

  /**
   * 'iap'  -- verify Identity-Aware Proxy's signed assertion (deployed).
   * 'dev'  -- trust an X-Dev-User-Email header (local only; refuses to start
   *           when NODE_ENV is production).
   */
  AUTH_MODE: z.enum(['iap', 'dev']).default('iap'),

  /**
   * The `aud` claim IAP mints for THIS service; copy it from the service's IAP
   * settings. Checking it is what prevents an assertion issued for a different
   * IAP-protected service from being replayed here, so it has no default.
   */
  IAP_AUDIENCE: z.string().optional(),

  /**
   * Comma-separated addresses permitted to create an account on first sign-in.
   * Not a revocation list -- see the note on SessionServiceOptions.
   */
  ALLOWED_EMAILS: z.string().min(1, 'ALLOWED_EMAILS is required'),

  /** Display name of the ledger both members share. */
  SHARED_LEDGER_NAME: z.string().default('家計'),

  /** Built client assets. Relative paths resolve from the working directory. */
  STATIC_DIR: z.string().default('dist/client'),

  /** Apply pending migrations at start-up (guarded by an advisory lock). */
  MIGRATE_ON_START: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  authMode: 'iap' | 'dev';
  iapAudience?: string;
  allowedEmails: string[];
  sharedLedgerName: string;
  staticDir: string;
  migrateOnStart: boolean;
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = serverSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid server configuration -- ${detail}`);
  }
  const data = parsed.data;

  // Checked here rather than at the verifier, so a deployment missing its
  // audience fails at start-up instead of on the first request -- when it would
  // look like an authentication outage instead of a configuration mistake.
  if (data.AUTH_MODE === 'iap' && !data.IAP_AUDIENCE) {
    throw new Error('IAP_AUDIENCE is required when AUTH_MODE=iap');
  }

  const allowedEmails = data.ALLOWED_EMAILS.split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
  if (allowedEmails.length === 0) {
    throw new Error('ALLOWED_EMAILS must list at least one address');
  }

  return {
    port: data.PORT,
    nodeEnv: data.NODE_ENV,
    isProduction: data.NODE_ENV === 'production',
    authMode: data.AUTH_MODE,
    iapAudience: data.IAP_AUDIENCE,
    allowedEmails,
    sharedLedgerName: data.SHARED_LEDGER_NAME,
    staticDir: data.STATIC_DIR,
    migrateOnStart: data.MIGRATE_ON_START,
  };
}
