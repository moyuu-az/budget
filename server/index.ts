import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createPool } from './db/pool';
import { migrate } from './db/migrate';
import { assertIsolationEnforceable } from './db/assert-isolation';
import { loadDatabaseConfig, loadServerConfig } from './config';
import { createIapVerifier } from './auth/iap';
import { createDevVerifier } from './auth/dev-verifier';
import { createSessionService } from './auth/session';
import { createApp } from './http/app';
import type { IdentityVerifier } from './auth/identity';

// ---------------------------------------------------------------------------
// Process entry point: read configuration, wire the pieces, listen.
//
// Everything above this file takes its collaborators as arguments, so this is
// the only module that reads the environment or opens a socket -- and therefore
// the only one the tests have to work around.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dbConfig = loadDatabaseConfig();
  const config = loadServerConfig();

  const pool = createPool({ connectionString: dbConfig.url, ssl: dbConfig.ssl });

  // Before anything else: a role that bypasses row-level security would serve
  // one ledger's rows for another, silently. Fail here instead.
  await assertIsolationEnforceable(pool);

  if (config.migrateOnStart) {
    const { applied } = await migrate(pool);
    console.log(
      applied.length > 0 ? `migrations applied: ${applied.join(', ')}` : 'migrations up to date',
    );
  }

  const verifier: IdentityVerifier =
    config.authMode === 'iap'
      ? // loadServerConfig already refused to return an 'iap' mode without one.
        createIapVerifier({ audience: config.iapAudience as string })
      : createDevVerifier(config.nodeEnv);

  const app = createApp({
    pool,
    verifier,
    sessions: createSessionService(pool, {
      allowedEmails: config.allowedEmails,
      sharedLedgerName: config.sharedLedgerName,
    }),
    // Internal error text stays on the server outside development.
    exposeInternals: !config.isProduction,
    logError: ({ method, error }) => {
      const level = error.code === 'PERSISTENCE' || error.code === 'UNKNOWN' ? 'error' : 'warn';
      console[level](`${method} failed [${error.code}]: ${error.message}`);
    },
  });

  // --- Static client -------------------------------------------------------
  // Registered AFTER /api so a method name can never be shadowed by a file.
  const staticRoot = path.resolve(process.cwd(), config.staticDir);
  const indexHtml = path.join(staticRoot, 'index.html');

  if (fs.existsSync(indexHtml)) {
    app.use('/*', serveStatic({ root: path.relative(process.cwd(), staticRoot) }));
    // Single-page app fallback: any unmatched GET renders the shell and lets the
    // client router take over.
    app.get('*', (c) => c.html(fs.readFileSync(indexHtml, 'utf8')));
  } else {
    console.warn(`no client build at ${staticRoot} -- serving the API only`);
  }

  serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
    console.log(`listening on :${port} (auth=${config.authMode}, env=${config.nodeEnv})`);
  });
}

main().catch((error: unknown) => {
  // A configuration or connection failure at start-up should stop the container,
  // not leave it serving errors.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
