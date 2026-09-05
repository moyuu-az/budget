import { z } from 'zod';
import type { AppApi, LedgerScopedApi, UserScopedApi } from '../../shared/types';
import type { Repositories, UserScopedRepositories } from '../repositories';
import { wordsForDay } from '../../shared/vocabulary';
import {
  finiteNumberSchema,
  idSchema,
  amountSchema,
  yearMonthSchema,
  isoDateSchema,
  categoryInputSchema,
  categoryPatchSchema,
  templateInputSchema,
  templatePatchSchema,
  assetCategoryInputSchema,
  assetCategoryPatchSchema,
  assetInputSchema,
  assetPatchSchema,
  ledgerSettingsPatchSchema,
  vocabAttemptsSchema,
  vocabResetTargetSchema,
} from './input-schemas';

/** Methods that operate on one ledger's data. */
export type LedgerMethod = keyof LedgerScopedApi;

/** Methods that operate on the signed-in person's own data. */
export type UserMethod = keyof UserScopedApi;

/**
 * Every method that carries a body, in either scope.
 *
 * getSession is excluded because it is what tells the caller which ledgers
 * exist -- it cannot itself require one, and it is not user-scoped DATA; it is
 * the identity the user scope is derived from.
 */
export type DataMethod = LedgerMethod | UserMethod;

/**
 * One method: how to validate its arguments, and what to do with them.
 *
 * Both halves are tied to the contract in shared/types.ts. `args` must produce
 * exactly the method's parameter tuple, and `handle` must return exactly its
 * return type, so a signature change there fails to compile here.
 *
 * `Repos` IS THE SCOPE, EXPRESSED AS A TYPE. A handler in the ledger table
 * receives ledger-bound repositories and a handler in the user table receives
 * user-bound ones; there is no bundle carrying both. Putting a study-record
 * handler in the ledger table therefore does not compile -- which is the
 * property this generic exists for, because "remember which table this goes in"
 * is exactly the kind of rule that gets forgotten once and leaks quietly.
 */
export interface MethodSpec<M extends DataMethod, Repos> {
  args: z.ZodType<Parameters<AppApi[M]>>;
  handle(repos: Repos, args: Parameters<AppApi[M]>): Promise<Awaited<ReturnType<AppApi[M]>>>;
}

/**
 * The exhaustive LEDGER-scoped handler table.
 *
 * Typed as a mapped type over LedgerMethod, so adding a method to
 * LedgerScopedApi without adding it here is a compile error rather than a 404
 * discovered at runtime.
 * This is the same guarantee the Electron version got from its channel map,
 * kept now that the transport is HTTP.
 *
 * Note there is no route-name table. The method name IS the route
 * (POST /api/getCategories), which removes a hand-maintained mapping and the whole
 * class of "added the handler, forgot the channel" mistakes.
 */
export const LEDGER_METHODS: { [M in LedgerMethod]: MethodSpec<M, Repositories> } = {
  // --- Categories ---
  getLedgerSettings: {
    args: z.tuple([]),
    handle: (repos) => repos.settings.get(),
  },
  updateLedgerSettings: {
    args: z.tuple([ledgerSettingsPatchSchema]),
    handle: (repos, [patch]) => repos.settings.update(patch),
  },

  getCategories: {
    args: z.tuple([]),
    handle: (repos) => repos.category.getAll(),
  },
  addCategory: {
    args: z.tuple([categoryInputSchema]),
    handle: (repos, [input]) => repos.category.add(input),
  },
  updateCategory: {
    args: z.tuple([idSchema, categoryPatchSchema]),
    handle: (repos, [id, patch]) => repos.category.update(id, patch),
  },
  deleteCategory: {
    args: z.tuple([idSchema]),
    handle: (repos, [id]) => repos.category.remove(id),
  },

  // --- Templates ---
  getTemplates: {
    args: z.tuple([]),
    handle: (repos) => repos.template.getAll(),
  },
  addTemplate: {
    args: z.tuple([templateInputSchema]),
    handle: (repos, [input]) => repos.template.add(input),
  },
  updateTemplate: {
    args: z.tuple([idSchema, templatePatchSchema]),
    handle: (repos, [id, patch]) => repos.template.update(id, patch),
  },
  toggleTemplate: {
    args: z.tuple([idSchema, z.boolean()]),
    handle: (repos, [id, enabled]) => repos.template.toggle(id, enabled),
  },
  deleteTemplate: {
    args: z.tuple([idSchema]),
    handle: (repos, [id]) => repos.template.remove(id),
  },

  // --- Planned amounts ---
  getMonthlyAmounts: {
    args: z.tuple([yearMonthSchema]),
    handle: (repos, [yearMonth]) => repos.monthlyAmount.getForMonth(yearMonth),
  },
  getMonthlyAmountsRange: {
    args: z.tuple([yearMonthSchema, yearMonthSchema]),
    handle: (repos, [start, end]) => repos.monthlyAmount.getForRange(start, end),
  },
  setMonthlyAmount: {
    args: z.tuple([idSchema, yearMonthSchema, amountSchema]),
    handle: (repos, [templateId, yearMonth, amount]) =>
      repos.monthlyAmount.set(templateId, yearMonth, amount),
  },
  deleteMonthlyAmount: {
    args: z.tuple([idSchema, yearMonthSchema]),
    handle: (repos, [templateId, yearMonth]) => repos.monthlyAmount.remove(templateId, yearMonth),
  },
  copyMonthlyAmounts: {
    args: z.tuple([yearMonthSchema, yearMonthSchema]),
    handle: (repos, [from, to]) => repos.monthlyAmount.copyMonth(from, to),
  },

  // --- Recorded actuals ---
  getMonthlyActuals: {
    args: z.tuple([yearMonthSchema]),
    handle: (repos, [yearMonth]) => repos.monthlyActual.getForMonth(yearMonth),
  },
  getMonthlyActualsRange: {
    args: z.tuple([yearMonthSchema, yearMonthSchema]),
    handle: (repos, [start, end]) => repos.monthlyActual.getForRange(start, end),
  },
  setMonthlyActual: {
    args: z.tuple([idSchema, yearMonthSchema, amountSchema]),
    handle: (repos, [templateId, yearMonth, amount]) =>
      repos.monthlyActual.set(templateId, yearMonth, amount),
  },
  deleteMonthlyActual: {
    args: z.tuple([idSchema, yearMonthSchema]),
    handle: (repos, [templateId, yearMonth]) => repos.monthlyActual.remove(templateId, yearMonth),
  },

  // --- Snapshots ---
  getSnapshots: {
    args: z.tuple([]),
    handle: (repos) => repos.snapshot.getAll(),
  },
  getSnapshotsRange: {
    args: z.tuple([isoDateSchema, isoDateSchema]),
    handle: (repos, [start, end]) => repos.snapshot.getForRange(start, end),
  },
  addSnapshot: {
    args: z.tuple([isoDateSchema, finiteNumberSchema]),
    handle: (repos, [date, balance]) => repos.snapshot.add(date, balance),
  },
  deleteSnapshot: {
    args: z.tuple([idSchema]),
    handle: (repos, [id]) => repos.snapshot.remove(id),
  },

  // --- Assets ---
  getAssetCategories: {
    args: z.tuple([]),
    handle: (repos) => repos.assetCategory.getAll(),
  },
  addAssetCategory: {
    args: z.tuple([assetCategoryInputSchema]),
    handle: (repos, [input]) => repos.assetCategory.add(input),
  },
  updateAssetCategory: {
    args: z.tuple([idSchema, assetCategoryPatchSchema]),
    handle: (repos, [id, patch]) => repos.assetCategory.update(id, patch),
  },
  deleteAssetCategory: {
    args: z.tuple([idSchema]),
    handle: (repos, [id]) => repos.assetCategory.remove(id),
  },

  getAssets: {
    args: z.tuple([]),
    handle: (repos) => repos.asset.getAll(),
  },
  addAsset: {
    args: z.tuple([assetInputSchema]),
    handle: (repos, [input]) => repos.asset.add(input),
  },
  updateAsset: {
    args: z.tuple([idSchema, assetPatchSchema]),
    handle: (repos, [id, patch]) => repos.asset.update(id, patch),
  },
  deleteAsset: {
    args: z.tuple([idSchema]),
    handle: (repos, [id]) => repos.asset.remove(id),
  },
};

/**
 * The user-scoped handler table.
 *
 * Same mapped-type guarantee as above, over the other half of the contract, and
 * over a DIFFERENT repository bundle -- `repos` here has no `category`, no
 * `asset`, no ledger at all. See MethodSpec.
 */
export const USER_METHODS: { [M in UserMethod]: MethodSpec<M, UserScopedRepositories> } = {
  getVocabProgress: {
    args: z.tuple([]),
    handle: (repos) => repos.vocab.getProgress(),
  },
  recordVocabAttempts: {
    args: z.tuple([vocabAttemptsSchema]),
    handle: (repos, [attempts]) => repos.vocab.record(attempts),
  },
  resetVocabProgress: {
    args: z.tuple([vocabResetTargetSchema]),
    // A DAY IS RESOLVED TO WORD IDS HERE, NOT IN THE DATABASE.
    //
    // Which Day a word belongs to is a fact about the BOOK
    // (shared/vocabulary/words.ts), and storing it on the attempt row would be a
    // second copy that goes stale the moment the book is re-sectioned -- rows
    // would then be cleared, or missed, according to a Day the reader no longer
    // sees. `null` still means "all of it", which the repository handles
    // separately precisely so that "a Day with no words" cannot be mistaken for
    // it.
    handle: (repos, [day]) =>
      repos.vocab.reset(day === null ? null : wordsForDay(day).map((word) => word.id)),
  },
};

/**
 * Both tables, for the callers that legitimately need the whole surface: the
 * 404 test below, and the exhaustive isolation sweep.
 *
 * NOT for dispatch. Handling a request through this would erase the very
 * distinction the two tables exist to make -- see server/http/app.ts, which
 * looks up the user table FIRST and only then the ledger one.
 */
export const METHODS = { ...LEDGER_METHODS, ...USER_METHODS } as {
  [M in DataMethod]: MethodSpec<M, never>;
};

/** Runtime membership test for a path segment, so an unknown method 404s cleanly. */
export function isDataMethod(value: string): value is DataMethod {
  return Object.prototype.hasOwnProperty.call(METHODS, value);
}

/**
 * Whether this method is about the PERSON rather than about a household.
 *
 * The dispatcher asks this to decide whether a ledger has to be resolved at all.
 * It is a lookup in the user table rather than a name convention, so a method
 * cannot become user-scoped by being called something that looks like it.
 */
export function isUserMethod(value: DataMethod): value is UserMethod {
  return Object.prototype.hasOwnProperty.call(USER_METHODS, value);
}
