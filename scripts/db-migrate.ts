#!/usr/bin/env tsx
/**
 * Applies pending migrations, then (optionally) grants the application role.
 *
 *   npm run db:migrate
 *
 * Run this as the database OWNER -- it issues DDL and, on Cloud SQL, that means
 * the `postgres` user rather than the least-privilege role the server uses.
 */
import 'dotenv/config';
import { createPool } from '../server/db/pool';
import { migrate } from '../server/db/migrate';
import { applyGrants } from '../server/db/grants';
import { loadDatabaseConfig, databaseNameFromUrl } from '../server/config';

async function main(): Promise<void> {
  const config = loadDatabaseConfig();
  const pool = createPool({ connectionString: config.url, ssl: config.ssl });

  try {
    const { applied, skipped } = await migrate(pool);
    console.log(`skipped (already applied): ${skipped.length}`);
    if (applied.length === 0) {
      console.log('no pending migrations');
    } else {
      applied.forEach((file) => console.log(`applied: ${file}`));
    }

    if (config.appRole) {
      await applyGrants(pool, {
        role: config.appRole,
        database: databaseNameFromUrl(config.url),
      });
      console.log(`granted privileges to role: ${config.appRole}`);
    } else {
      console.log('DATABASE_APP_ROLE unset -- skipping grants');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
