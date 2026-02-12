import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getBalance: () => ipcRenderer.invoke('get-balance'),
  setBalance: (balance: number) => ipcRenderer.invoke('set-balance', balance),
  getTemplates: () => ipcRenderer.invoke('get-templates'),
  addTemplate: (template: { name: string; dayOfMonth: number; type: string }) =>
    ipcRenderer.invoke('add-template', template),
  updateTemplate: (id: number, template: { name: string; dayOfMonth: number; type: string }) =>
    ipcRenderer.invoke('update-template', id, template),
  deleteTemplate: (id: number) => ipcRenderer.invoke('delete-template', id),
  toggleTemplate: (id: number, enabled: boolean) => ipcRenderer.invoke('toggle-template', id, enabled),
  getMonthlyAmounts: (yearMonth: string) => ipcRenderer.invoke('get-monthly-amounts', yearMonth),
  getMonthlyAmountsRange: (startMonth: string, endMonth: string) =>
    ipcRenderer.invoke('get-monthly-amounts-range', startMonth, endMonth),
  setMonthlyAmount: (templateId: number, yearMonth: string, amount: number) =>
    ipcRenderer.invoke('set-monthly-amount', templateId, yearMonth, amount),
  deleteMonthlyAmount: (templateId: number, yearMonth: string) =>
    ipcRenderer.invoke('delete-monthly-amount', templateId, yearMonth),
  copyMonthlyAmounts: (fromMonth: string, toMonth: string) =>
    ipcRenderer.invoke('copy-monthly-amounts', fromMonth, toMonth),
  getSnapshots: () => ipcRenderer.invoke('get-snapshots'),
  addSnapshot: (snapshot: { date: string; balance: number }) => ipcRenderer.invoke('add-snapshot', snapshot),
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
