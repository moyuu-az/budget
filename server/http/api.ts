import { z } from 'zod';
import type { AppApi } from '../../shared/types';
import type { Repositories } from '../repositories';
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
} from './input-schemas';

/**
 * Every method that operates on one ledger's data.
 *
 * getSession is excluded because it is what tells the caller which ledgers
 * exist -- it cannot itself require one.
 */
export type DataMethod = Exclude<keyof AppApi, 'getSession'>;

/**
 * One method: how to validate its arguments, and what to do with them.
 *
 * Both halves are tied to the contract in shared/types.ts. `args` must produce
 * exactly the method's parameter tuple, and `handle` must return exactly its
 * return type, so a signature change there fails to compile here.
 */
export interface MethodSpec<M extends DataMethod> {
  args: z.ZodType<Parameters<AppApi[M]>>;
  handle(
    repos: Repositories,
    args: Parameters<AppApi[M]>,
  ): Promise<Awaited<ReturnType<AppApi[M]>>>;
}

/**
 * The exhaustive handler table.
 *
 * Typed as a mapped type over DataMethod, so adding a method to AppApi without
 * adding it here is a compile error rather than a 404 discovered at runtime.
 * This is the same guarantee the Electron version got from its channel map,
 * kept now that the transport is HTTP.
 *
 * Note there is no route-name table. The method name IS the route
 * (POST /api/getCategories), which removes a hand-maintained mapping and the whole
 * class of "added the handler, forgot the channel" mistakes.
 */
export const METHODS: { [M in DataMethod]: MethodSpec<M> } = {
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

/** Runtime membership test for a path segment, so an unknown method 404s cleanly. */
export function isDataMethod(value: string): value is DataMethod {
  return Object.prototype.hasOwnProperty.call(METHODS, value);
}
