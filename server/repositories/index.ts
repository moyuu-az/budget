import type { Pool, PoolClient } from '../db/pool';
import { withLedgerScope } from '../db/ledger-scope';
import { withUserScope } from '../db/user-scope';
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
import { createSettingsRepository, type SettingsRepository } from './settings.repository';
import { createSnapshotRepository, type SnapshotRepository } from './snapshot.repository';
import {
  createAssetCategoryRepository,
  type AssetCategoryRepository,
} from './asset-category.repository';
import { createAssetRepository, type AssetRepository } from './asset.repository';
import { createVocabRepository, type VocabRepository } from './vocab.repository';

export interface Repositories {
  settings: SettingsRepository;
  category: CategoryRepository;
  template: TemplateRepository;
  monthlyAmount: MonthlyAmountRepository;
  monthlyActual: MonthlyActualRepository;
  snapshot: SnapshotRepository;
  assetCategory: AssetCategoryRepository;
  asset: AssetRepository;
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
    assetCategory: createAssetCategoryRepository(client, ledgerId),
    asset: createAssetRepository(client, ledgerId),
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


// ---------------------------------------------------------------------------
// THE OTHER TENANT: THE PERSON.
//
// Everything above belongs to a HOUSEHOLD. What follows belongs to whoever is
// signed in, whichever ledger they happen to have open -- today, the English
// study record (migration 006).
//
// The two bundles are separate TYPES, not one bundle with a flag, and that is
// the whole point of the split. A handler is written against one or the other
// (server/http/api.ts), so:
//
//   - a study-record handler cannot reach a ledger-scoped repository, and
//   - a household handler cannot run without a ledger having been chosen.
//
// Neither is a rule anyone has to remember; both are compile errors. The
// alternative -- one bundle carrying both, scoped by whichever `with...` the
// route happened to call -- would make "which tenant is this request about?"
// answerable only by reading the call site.
// ---------------------------------------------------------------------------

export interface UserScopedRepositories {
  vocab: VocabRepository;
}

/**
 * Builds the user-scoped bundle over an ALREADY user-scoped client.
 *
 * Prefer withUserRepositories. Calling this directly is only correct inside a
 * transaction that has had its user set, and nothing here can verify that -- the
 * reads would simply come back empty, which reads as "you have not started".
 */
export function createUserScopedRepositories(
  client: PoolClient,
  userId: number,
): UserScopedRepositories {
  return {
    vocab: createVocabRepository(client, userId),
  };
}

/**
 * The seam a user-scoped request goes through: open a transaction stamped with
 * one user, hand the caller repositories bound to that same user.
 *
 * One `userId` argument sets the row-level security scope AND supplies the value
 * repositories write into `user_id`, so the read scope and the write scope are
 * the same by construction rather than by discipline -- the same reasoning as
 * withLedgerRepositories.
 *
 * THE USER ID COMES FROM THE SESSION, NEVER FROM THE REQUEST. There is no
 * X-User-Id header and there must never be one: the ledger header is safe only
 * because it is checked against a membership list the server built, and a user
 * id has no equivalent list to check against -- it IS the identity.
 */
export async function withUserRepositories<T>(
  pool: Pool,
  userId: number,
  fn: (repos: UserScopedRepositories) => Promise<T>,
): Promise<T> {
  return withUserScope(pool, userId, (client) =>
    fn(createUserScopedRepositories(client, userId)),
  );
}
