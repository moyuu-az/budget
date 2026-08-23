import type { Pool, PoolClient } from '../db/pool';
import { withLedgerScope } from '../db/ledger-scope';
import { createSettingsRepository, type SettingsRepository } from './settings.repository';
import { createCategoryRepository, type CategoryRepository } from './category.repository';
import { createTemplateRepository, type TemplateRepository } from './template.repository';
import {
  createMonthlyAmountRepository,
  type MonthlyAmountRepository,
} from './monthly-amount.repository';
import {
  createMonthlyActualRepository,
  type MonthlyActualRepository,
} from './monthly-actual.repository';
import { createSnapshotRepository, type SnapshotRepository } from './snapshot.repository';

export interface Repositories {
  settings: SettingsRepository;
  category: CategoryRepository;
  template: TemplateRepository;
  monthlyAmount: MonthlyAmountRepository;
  monthlyActual: MonthlyActualRepository;
  snapshot: SnapshotRepository;
}

// ---------------------------------------------------------------------------
// WHY REPOSITORY READS CARRY NO `WHERE ledger_id = ...`
//
// Look at any repository and the SELECTs have no ledger predicate. That is
// deliberate, and it is the half of the design that is easy to "fix" into a bug.
//
// The predicate comes from the row-level security policies in migration 002,
// which the surrounding transaction has already been stamped with. Writing it
// out again in ~25 methods would mean ~25 chances to write it wrong, and -- more
// insidiously -- it would make the RLS policies untested: every query would pass
// whether or not the policies were doing anything, so the day someone disables
// them nothing would fail until data leaked in production.
//
// Leaving reads unqualified keeps exactly one definition of "this ledger" and
// keeps server/db/schema.test.ts able to prove it works.
//
// INSERTs are different: `ledger_id` is a NOT NULL column, so a value has to be
// supplied. It always comes from the same `ledgerId` argument that stamped the
// transaction (see withLedgerRepositories), so the two cannot disagree, and the
// policies' WITH CHECK clause rejects the row if they somehow did.
// ---------------------------------------------------------------------------

/**
 * Builds the repository bundle over an ALREADY ledger-scoped client.
 *
 * Prefer withLedgerRepositories. Calling this directly is only correct inside a
 * transaction that has had its ledger set, and nothing here can verify that --
 * the reads would simply come back empty.
 */
export function createRepositories(client: PoolClient, ledgerId: number): Repositories {
  return {
    settings: createSettingsRepository(client, ledgerId),
    category: createCategoryRepository(client, ledgerId),
    template: createTemplateRepository(client, ledgerId),
    monthlyAmount: createMonthlyAmountRepository(client, ledgerId),
    monthlyActual: createMonthlyActualRepository(client, ledgerId),
    snapshot: createSnapshotRepository(client, ledgerId),
  };
}

/**
 * The seam every request goes through: open a transaction scoped to one ledger,
 * hand the caller repositories bound to that same ledger.
 *
 * A single `ledgerId` argument sets the row-level security scope AND supplies
 * the value repositories write into `ledger_id`. Because there is one argument
 * there is nothing to keep in sync -- the read scope and the write scope are the
 * same by construction rather than by discipline.
 *
 * This is also why there is no way to obtain a repository without naming a
 * ledger. "Forgetting to scope the query" is not a mistake this API can express.
 */
export async function withLedgerRepositories<T>(
  pool: Pool,
  ledgerId: number,
  fn: (repos: Repositories) => Promise<T>,
): Promise<T> {
  return withLedgerScope(pool, ledgerId, (client) => fn(createRepositories(client, ledgerId)));
}
