#!/usr/bin/env tsx
/**
 * One-time import of the desktop app's local SQLite database into a PostgreSQL
 * ledger.
 *
 *   npm run db:import -- --sqlite "/path/to/balance-forecast.db" --ledger shared
 *
 * The desktop app kept exactly one dataset, so everything it holds belongs to a
 * single ledger -- the shared household one by default.
 *
 * Safe to point at a live file: the source is opened read-only, and WAL content
 * is visible to readers.
 *
 * Uses node:sqlite (built into Node 22+) rather than better-sqlite3 on purpose.
 * The project's better-sqlite3 binary is compiled against Electron's ABI by
 * `electron-builder install-app-deps` and cannot be loaded by a plain node
 * process -- and the whole point of this migration is that Electron is going
 * away.
 */
import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import { createPool } from '../server/db/pool';
import { withLedgerScope, withoutLedgerScope } from '../server/db/ledger-scope';
import { loadDatabaseConfig } from '../server/config';
import { createRepositories } from '../server/repositories';
import type { PoolClient } from '../server/db/pool';

interface Args {
  sqlitePath: string;
  ledgerSlug: string;
  ledgerName: string;
  ledgerKind: 'shared' | 'personal';
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const sqlitePath = get('--sqlite');
  if (!sqlitePath) {
    throw new Error(
      'Missing --sqlite <path>. On macOS the desktop app stored it at\n' +
        '  ~/Library/Application Support/balance-forecast/balance-forecast.db',
    );
  }

  const kind = (get('--kind') ?? 'shared') as 'shared' | 'personal';
  if (kind !== 'shared' && kind !== 'personal') {
    throw new Error(`--kind must be "shared" or "personal", got ${kind}`);
  }

  return {
    sqlitePath,
    ledgerSlug: get('--ledger') ?? 'shared',
    ledgerName: get('--name') ?? '家計',
    ledgerKind: kind,
    force: argv.includes('--force'),
  };
}

/** SQLite row shapes, exactly as the old schema defined them. */
interface OldCategory { id: number; name: string; type: string; color: string | null; sort_order: number }
interface OldTemplate {
  id: number; name: string; day_of_month: number; type: string; enabled: number;
  sort_order: number; category_id: number | null; default_amount: number;
  created_at: string; updated_at: string;
}
interface OldMonthly { template_id: number; year_month: string; amount: number; created_at: string }
interface OldActual { template_id: number; year_month: string; actual_amount: number; created_at: string }
interface OldSnapshot { date: string; balance: number; created_at: string }
interface OldSetting { key: string; value: string }

/**
 * SQLite's datetime('now') writes UTC without a zone marker. Casting the bare
 * string to timestamptz would make PostgreSQL read it in the *server's* zone
 * and shift every timestamp. `AT TIME ZONE 'UTC'` states the origin explicitly.
 */
const TS = (param: string) => `(${param}::timestamp AT TIME ZONE 'UTC')`;

async function ensureLedger(client: PoolClient, args: Args): Promise<number> {
  const existing = await client.query<{ id: number }>(
    'SELECT id FROM ledgers WHERE slug = $1',
    [args.ledgerSlug],
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const created = await client.query<{ id: number }>(
    'INSERT INTO ledgers (slug, name, kind) VALUES ($1, $2, $3) RETURNING id',
    [args.ledgerSlug, args.ledgerName, args.ledgerKind],
  );
  return created.rows[0].id;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadDatabaseConfig();
  const pool = createPool({ connectionString: config.url, ssl: config.ssl });

  const source = new DatabaseSync(args.sqlitePath, { readOnly: true });

  try {
    const ledgerId = await withoutLedgerScope(pool, (client) => ensureLedger(client, args));
    console.log(`target ledger: ${args.ledgerSlug} (id ${ledgerId})`);

    await withLedgerScope(pool, ledgerId, async (client) => {
      // Refuse to import twice. Without this, a second run would duplicate every
      // category and template (they have no natural key), leaving a mess that is
      // tedious to unpick by hand.
      const { rows } = await client.query<{ count: number }>(
        'SELECT (SELECT count(*) FROM categories) + (SELECT count(*) FROM entry_templates) AS count',
      );
      if (rows[0].count > 0 && !args.force) {
        throw new Error(
          `Ledger "${args.ledgerSlug}" already holds ${rows[0].count} categories/templates. ` +
            'Re-running would duplicate them. Pass --force only if that is what you want.',
        );
      }

      // --- balance --------------------------------------------------------
      //
      // The old SQLite schema kept the balance in settings under
      // 'current_balance'. It is now the sum of the cash category's holdings
      // (migration 004), so the import writes it as a holding instead of copying
      // the row -- a copied row would be read by nothing and the imported ledger
      // would open showing ¥0.
      //
      // Goes through the repositories rather than raw SQL so the cash category
      // is provisioned by the same code the application uses. Two definitions of
      // "the cash category" is exactly what this release removed.
      // Only `current_balance` is carried across. It is the only key the old
      // schema ever held, and any other would have no reader on this side.
      const settings = source.prepare('SELECT key, value FROM settings').all() as unknown as OldSetting[];
      const parsedBalance = Number(settings.find((row) => row.key === 'current_balance')?.value ?? 0);
      // The old column was TEXT and nothing validated it. NaN would sail past
      // the input schema (typeof number, and `Number.isNaN(NaN)` is what zod's
      // `.finite()` catches only on the server) and NUMERIC accepts 'NaN' as a
      // value, leaving that ledger's balance permanently unreadable.
      const oldBalance = Number.isFinite(parsedBalance) ? parsedBalance : 0;
      const repos = createRepositories(client, ledgerId);
      const cash = (await repos.assetCategory.getAll()).find((c) => c.kind === 'cash');
      if (!cash) throw new Error('cash category was not provisioned; is migration 004 applied?');
      // Only when the category is empty: re-running with --force must not stack
      // another 口座残高 on top of the one the previous run created.
      const existingCash = (await repos.asset.getAll()).filter((a) => a.categoryId === cash.id);
      if (existingCash.length === 0) {
        await repos.asset.add({
          categoryId: cash.id,
          name: '口座残高',
          // Whole yen: the column is NUMERIC(14,2) but every screen and the
          // input schema treat holdings as integers.
          value: Math.round(oldBalance),
        });
      }

      // --- categories -----------------------------------------------------
      // Old ids are not reused: the new tables use IDENTITY columns, and the
      // shared ledger may later live alongside others. Templates are rewired
      // through this map.
      const categoryIdMap = new Map<number, number>();
      const categories = source
        .prepare('SELECT * FROM categories ORDER BY id')
        .all() as unknown as OldCategory[];
      for (const row of categories) {
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO categories (ledger_id, name, type, color, sort_order)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [ledgerId, row.name, row.type, row.color, row.sort_order],
        );
        categoryIdMap.set(row.id, inserted.rows[0].id);
      }

      // --- entry_templates ------------------------------------------------
      const templateIdMap = new Map<number, number>();
      const templates = source
        .prepare('SELECT * FROM entry_templates ORDER BY id')
        .all() as unknown as OldTemplate[];
      for (const row of templates) {
        const newCategoryId =
          row.category_id === null ? null : categoryIdMap.get(row.category_id) ?? null;
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO entry_templates
             (ledger_id, name, day_of_month, type, enabled, sort_order, category_id,
              default_amount, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${TS('$9')}, ${TS('$10')})
           RETURNING id`,
          [
            ledgerId, row.name, row.day_of_month, row.type,
            row.enabled === 1, row.sort_order, newCategoryId,
            row.default_amount, row.created_at, row.updated_at,
          ],
        );
        templateIdMap.set(row.id, inserted.rows[0].id);
      }

      // --- monthly_amounts / monthly_actuals ------------------------------
      const amounts = source
        .prepare('SELECT * FROM monthly_amounts ORDER BY id')
        .all() as unknown as OldMonthly[];
      for (const row of amounts) {
        const templateId = templateIdMap.get(row.template_id);
        if (templateId === undefined) continue; // orphan row; the FK would reject it anyway
        await client.query(
          `INSERT INTO monthly_amounts (ledger_id, template_id, year_month, amount, created_at)
             VALUES ($1, $2, $3, $4, ${TS('$5')})`,
          [ledgerId, templateId, row.year_month, row.amount, row.created_at],
        );
      }

      const actuals = source
        .prepare('SELECT * FROM monthly_actuals ORDER BY id')
        .all() as unknown as OldActual[];
      for (const row of actuals) {
        const templateId = templateIdMap.get(row.template_id);
        if (templateId === undefined) continue;
        await client.query(
          `INSERT INTO monthly_actuals (ledger_id, template_id, year_month, actual_amount, created_at)
             VALUES ($1, $2, $3, $4, ${TS('$5')})`,
          [ledgerId, templateId, row.year_month, row.actual_amount, row.created_at],
        );
      }

      // --- balance_snapshots ----------------------------------------------
      const snapshots = source
        .prepare('SELECT * FROM balance_snapshots ORDER BY id')
        .all() as unknown as OldSnapshot[];
      for (const row of snapshots) {
        await client.query(
          `INSERT INTO balance_snapshots (ledger_id, date, balance, created_at)
             VALUES ($1, $2, $3, ${TS('$4')})
             ON CONFLICT (ledger_id, date) DO UPDATE SET balance = excluded.balance`,
          [ledgerId, row.date, row.balance, row.created_at],
        );
      }

      console.log(
        `imported: balance ¥${Math.round(oldBalance).toLocaleString()}, ${categories.length} categories, ` +
          `${templates.length} templates, ${amounts.length} amounts, ` +
          `${actuals.length} actuals, ${snapshots.length} snapshots`,
      );
    });
  } finally {
    source.close();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
