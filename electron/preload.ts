import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getBalance: () => ipcRenderer.invoke('get-balance'),
  setBalance: (balance: number) => ipcRenderer.invoke('set-balance', balance),

  // Categories
  getCategories: () => ipcRenderer.invoke('get-categories'),
  addCategory: (input: { name: string; type: string; color?: string; sortOrder?: number }) =>
    ipcRenderer.invoke('add-category', input),
  updateCategory: (id: number, input: { name?: string; type?: string; color?: string; sortOrder?: number }) =>
    ipcRenderer.invoke('update-category', id, input),
  deleteCategory: (id: number) => ipcRenderer.invoke('delete-category', id),

  // Templates
  getTemplates: () => ipcRenderer.invoke('get-templates'),
  addTemplate: (template: { name: string; dayOfMonth: number; type: string; categoryId?: number | null; defaultAmount?: number }) =>
    ipcRenderer.invoke('add-template', template),
  updateTemplate: (id: number, template: { name?: string; dayOfMonth?: number; type?: string; categoryId?: number | null; defaultAmount?: number }) =>
    ipcRenderer.invoke('update-template', id, template),
  deleteTemplate: (id: number) => ipcRenderer.invoke('delete-template', id),
  toggleTemplate: (id: number, enabled: boolean) => ipcRenderer.invoke('toggle-template', id, enabled),

  // Monthly Amounts
  getMonthlyAmounts: (yearMonth: string) => ipcRenderer.invoke('get-monthly-amounts', yearMonth),
  getMonthlyAmountsRange: (startMonth: string, endMonth: string) =>
    ipcRenderer.invoke('get-monthly-amounts-range', startMonth, endMonth),
  setMonthlyAmount: (templateId: number, yearMonth: string, amount: number) =>
    ipcRenderer.invoke('set-monthly-amount', templateId, yearMonth, amount),
  deleteMonthlyAmount: (templateId: number, yearMonth: string) =>
    ipcRenderer.invoke('delete-monthly-amount', templateId, yearMonth),
  copyMonthlyAmounts: (fromMonth: string, toMonth: string) =>
    ipcRenderer.invoke('copy-monthly-amounts', fromMonth, toMonth),

  // Monthly Actuals
  getMonthlyActuals: (yearMonth: string) => ipcRenderer.invoke('get-monthly-actuals', yearMonth),
  setMonthlyActual: (templateId: number, yearMonth: string, amount: number) =>
    ipcRenderer.invoke('set-monthly-actual', templateId, yearMonth, amount),
  deleteMonthlyActual: (templateId: number, yearMonth: string) =>
    ipcRenderer.invoke('delete-monthly-actual', templateId, yearMonth),

  // Analytics
  getMonthlyActualsRange: (startMonth: string, endMonth: string) =>
    ipcRenderer.invoke('get-monthly-actuals-range', startMonth, endMonth),
  getSnapshotsRange: (startDate: string, endDate: string) =>
    ipcRenderer.invoke('get-snapshots-range', startDate, endDate),

  // Snapshots
  getSnapshots: () => ipcRenderer.invoke('get-snapshots'),
  addSnapshot: (date: string, balance: number) => ipcRenderer.invoke('add-snapshot', date, balance),
  deleteSnapshot: (id: number) => ipcRenderer.invoke('delete-snapshot', id),

  // Auto-update
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateStatus: (callback: (status: unknown) => void) => {
    const handler = (_event: unknown, status: unknown) => callback(status);
    ipcRenderer.on('update-status', handler);
    return () => {
      ipcRenderer.removeListener('update-status', handler);
    };
  }
});
