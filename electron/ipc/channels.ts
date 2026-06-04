import type { ElectronAPI } from '../../shared/types';

// Every request/response method on the contract (the onUpdateStatus subscription is
// handled separately in preload). Derived FROM ElectronAPI so this stays in lockstep.
export type IpcMethod = Exclude<keyof ElectronAPI, 'onUpdateStatus'>;

// The auto-updater channels are owned by updater.ts (they need autoUpdater + window state).
export type UpdaterMethod = 'checkForUpdates' | 'downloadUpdate' | 'installUpdate';

// The data channels owned by register.ts (delegate to repositories / app).
export type DataMethod = Exclude<IpcMethod, UpdaterMethod>;

// Single hand-kept map of method name -> channel string. Typed as Record<IpcMethod, string>
// so OMITTING any contract method is a compile error. Used by the generic preload bridge.
export const CHANNELS: Record<IpcMethod, string> = {
  getBalance: 'get-balance',
  setBalance: 'set-balance',

  getCategories: 'get-categories',
  addCategory: 'add-category',
  updateCategory: 'update-category',
  deleteCategory: 'delete-category',

  getTemplates: 'get-templates',
  addTemplate: 'add-template',
  updateTemplate: 'update-template',
  toggleTemplate: 'toggle-template',
  deleteTemplate: 'delete-template',

  getMonthlyAmounts: 'get-monthly-amounts',
  getMonthlyAmountsRange: 'get-monthly-amounts-range',
  setMonthlyAmount: 'set-monthly-amount',
  deleteMonthlyAmount: 'delete-monthly-amount',
  copyMonthlyAmounts: 'copy-monthly-amounts',

  getMonthlyActuals: 'get-monthly-actuals',
  setMonthlyActual: 'set-monthly-actual',
  deleteMonthlyActual: 'delete-monthly-actual',

  getMonthlyActualsRange: 'get-monthly-actuals-range',
  getSnapshotsRange: 'get-snapshots-range',

  getSnapshots: 'get-snapshots',
  addSnapshot: 'add-snapshot',
  deleteSnapshot: 'delete-snapshot',

  getAppVersion: 'get-app-version',
  checkForUpdates: 'check-for-updates',
  downloadUpdate: 'download-update',
  installUpdate: 'install-update',
};

// A main-side handler for a data method: receives the domain args and returns the
// resolved value (repositories are synchronous, so a Promise is allowed but not required).
export type DataHandler<M extends DataMethod> = (
  ...args: Parameters<ElectronAPI[M]>
) => Awaited<ReturnType<ElectronAPI[M]>> | Promise<Awaited<ReturnType<ElectronAPI[M]>>>;

// Exhaustive handler table: omitting any data method fails to compile.
export type DataHandlers = { [M in DataMethod]: DataHandler<M> };
