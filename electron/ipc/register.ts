import { app, ipcMain } from 'electron';
import log from 'electron-log';
import type { Repositories } from '../repositories';
import { CHANNELS, type DataHandlers, type DataMethod } from './channels';
import { mapUnknownToAppError, toThrowable } from './errors';
import {
  finiteNumberSchema,
  amountSchema,
  yearMonthSchema,
  isoDateSchema,
  categoryInputSchema,
  categoryPatchSchema,
  templateInputSchema,
  templatePatchSchema,
} from './input-schemas';

// Builds the exhaustive handler table (omitting any data channel fails to compile),
// then registers each behind a uniform error boundary. Repositories are synchronous,
// so handlers return values directly; ipcMain.handle resolves them for the renderer.
export function registerIpcHandlers(repos: Repositories): void {
  const handlers: DataHandlers = {
    // Settings
    getBalance: () => repos.settings.getBalance(),
    setBalance: (balance) => repos.settings.setBalance(finiteNumberSchema.parse(balance)),

    // Categories
    getCategories: () => repos.category.getAll(),
    addCategory: (input) => repos.category.add(categoryInputSchema.parse(input)),
    updateCategory: (id, input) => repos.category.update(id, categoryPatchSchema.parse(input)),
    deleteCategory: (id) => repos.category.remove(id),

    // Templates
    getTemplates: () => repos.template.getAll(),
    addTemplate: (input) => repos.template.add(templateInputSchema.parse(input)),
    updateTemplate: (id, input) => repos.template.update(id, templatePatchSchema.parse(input)),
    toggleTemplate: (id, enabled) => repos.template.toggle(id, enabled),
    deleteTemplate: (id) => repos.template.remove(id),

    // Monthly amounts
    getMonthlyAmounts: (yearMonth) => repos.monthlyAmount.getForMonth(yearMonth),
    getMonthlyAmountsRange: (start, end) => repos.monthlyAmount.getForRange(start, end),
    setMonthlyAmount: (templateId, yearMonth, amount) =>
      repos.monthlyAmount.set(templateId, yearMonthSchema.parse(yearMonth), amountSchema.parse(amount)),
    deleteMonthlyAmount: (templateId, yearMonth) => repos.monthlyAmount.remove(templateId, yearMonth),
    copyMonthlyAmounts: (from, to) =>
      repos.monthlyAmount.copyMonth(yearMonthSchema.parse(from), yearMonthSchema.parse(to)),

    // Monthly actuals
    getMonthlyActuals: (yearMonth) => repos.monthlyActual.getForMonth(yearMonth),
    setMonthlyActual: (templateId, yearMonth, amount) =>
      repos.monthlyActual.set(templateId, yearMonthSchema.parse(yearMonth), amountSchema.parse(amount)),
    deleteMonthlyActual: (templateId, yearMonth) => repos.monthlyActual.remove(templateId, yearMonth),

    // Analytics ranges
    getMonthlyActualsRange: (start, end) => repos.monthlyActual.getForRange(start, end),
    getSnapshotsRange: (start, end) => repos.snapshot.getForRange(start, end),

    // Snapshots
    getSnapshots: () => repos.snapshot.getAll(),
    addSnapshot: (date, balance) => repos.snapshot.add(isoDateSchema.parse(date), finiteNumberSchema.parse(balance)),
    deleteSnapshot: (id) => repos.snapshot.remove(id),

    // App
    getAppVersion: () => app.getVersion(),
  };

  (Object.keys(handlers) as DataMethod[]).forEach((method) => {
    const handler = handlers[method] as (...args: unknown[]) => unknown;
    ipcMain.handle(CHANNELS[method], (_event, ...args) => {
      try {
        return handler(...args);
      } catch (error) {
        const appError = mapUnknownToAppError(error);
        const level = appError.code === 'PERSISTENCE' || appError.code === 'UNKNOWN' ? 'error' : 'warn';
        log[level](`IPC ${CHANNELS[method]} failed [${appError.code}]: ${appError.message}`);
        throw toThrowable(appError);
      }
    });
  });
}
