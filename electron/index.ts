import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { initAutoUpdater } from './updater';
import { createDatabase } from './db/connection';
import { createRepositories, type Repositories } from './repositories';

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      sandbox: false
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

function registerIpcHandlers(repos: Repositories): void {
  ipcMain.handle('get-app-version', () => app.getVersion());

  // Settings
  ipcMain.handle('get-balance', () => repos.settings.getBalance());
  ipcMain.handle('set-balance', (_event, balance: number) => repos.settings.setBalance(balance));

  // Categories
  ipcMain.handle('get-categories', () => repos.category.getAll());
  ipcMain.handle('add-category', (_event, input: { name: string; type: 'income' | 'expense'; color?: string; sortOrder?: number }) =>
    repos.category.add(input),
  );
  ipcMain.handle('update-category', (_event, id: number, input: { name?: string; type?: 'income' | 'expense'; color?: string; sortOrder?: number }) =>
    repos.category.update(id, input),
  );
  ipcMain.handle('delete-category', (_event, id: number) => repos.category.remove(id));

  // Templates
  ipcMain.handle('get-templates', () => repos.template.getAll());
  ipcMain.handle('add-template', (_event, template: { name: string; dayOfMonth: number; type: 'income' | 'expense'; categoryId?: number | null; defaultAmount?: number }) =>
    repos.template.add(template),
  );
  ipcMain.handle('update-template', (_event, id: number, template: { name?: string; dayOfMonth?: number; type?: 'income' | 'expense'; categoryId?: number | null; defaultAmount?: number }) =>
    repos.template.update(id, template),
  );
  ipcMain.handle('delete-template', (_event, id: number) => repos.template.remove(id));
  ipcMain.handle('toggle-template', (_event, id: number, enabled: boolean) => repos.template.toggle(id, enabled));

  // Monthly Amounts
  ipcMain.handle('get-monthly-amounts', (_event, yearMonth: string) => repos.monthlyAmount.getForMonth(yearMonth));
  ipcMain.handle('get-monthly-amounts-range', (_event, startMonth: string, endMonth: string) =>
    repos.monthlyAmount.getForRange(startMonth, endMonth),
  );
  ipcMain.handle('set-monthly-amount', (_event, templateId: number, yearMonth: string, amount: number) =>
    repos.monthlyAmount.set(templateId, yearMonth, amount),
  );
  ipcMain.handle('delete-monthly-amount', (_event, templateId: number, yearMonth: string) =>
    repos.monthlyAmount.remove(templateId, yearMonth),
  );
  ipcMain.handle('copy-monthly-amounts', (_event, fromMonth: string, toMonth: string) =>
    repos.monthlyAmount.copyMonth(fromMonth, toMonth),
  );

  // Monthly Actuals
  ipcMain.handle('get-monthly-actuals', (_event, yearMonth: string) => repos.monthlyActual.getForMonth(yearMonth));
  ipcMain.handle('set-monthly-actual', (_event, templateId: number, yearMonth: string, amount: number) =>
    repos.monthlyActual.set(templateId, yearMonth, amount),
  );
  ipcMain.handle('delete-monthly-actual', (_event, templateId: number, yearMonth: string) =>
    repos.monthlyActual.remove(templateId, yearMonth),
  );

  // Snapshots
  ipcMain.handle('get-snapshots', () => repos.snapshot.getAll());
  ipcMain.handle('add-snapshot', (_event, date: string, balance: number) => repos.snapshot.add(date, balance));
  ipcMain.handle('delete-snapshot', (_event, id: number) => repos.snapshot.remove(id));

  // Analytics
  ipcMain.handle('get-monthly-actuals-range', (_event, startMonth: string, endMonth: string) =>
    repos.monthlyActual.getForRange(startMonth, endMonth),
  );
  ipcMain.handle('get-snapshots-range', (_event, startDate: string, endDate: string) =>
    repos.snapshot.getForRange(startDate, endDate),
  );
}

app.whenReady().then(() => {
  const db = createDatabase();
  const repos = createRepositories(db);
  registerIpcHandlers(repos);
  const mainWindow = createWindow();

  // Only enable auto-updater in production (no dev server URL)
  if (!process.env.ELECTRON_RENDERER_URL) {
    initAutoUpdater(mainWindow);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
