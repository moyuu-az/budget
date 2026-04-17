import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { initAutoUpdater } from './updater';
import {
  initDatabase,
  getBalance,
  setBalance,
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getTemplates,
  addTemplate,
  updateTemplate,
  deleteTemplate,
  toggleTemplate,
  getMonthlyAmounts,
  getMonthlyAmountsRange,
  setMonthlyAmount,
  deleteMonthlyAmount,
  copyMonthlyAmounts,
  getMonthlyActuals,
  setMonthlyActual,
  deleteMonthlyActual,
  getSnapshots,
  addSnapshot,
  deleteSnapshot,
  getMonthlyActualsRange,
  getSnapshotsRange
} from './database';

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

function mapCategory(row: {
  id: number;
  name: string;
  type: string;
  color: string | null;
  sort_order: number;
}) {
  return {
    id: row.id,
    name: row.name,
    type: row.type as 'income' | 'expense',
    color: row.color,
    sortOrder: row.sort_order
  };
}

function mapTemplate(row: {
  id: number;
  name: string;
  day_of_month: number;
  type: string;
  enabled: number;
  sort_order: number;
  category_id: number | null;
  default_amount: number;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: row.id,
    name: row.name,
    dayOfMonth: row.day_of_month,
    type: row.type as 'income' | 'expense',
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
    categoryId: row.category_id,
    defaultAmount: row.default_amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMonthlyAmount(row: {
  id: number;
  template_id: number;
  year_month: string;
  amount: number;
  created_at: string;
}) {
  return {
    id: row.id,
    templateId: row.template_id,
    yearMonth: row.year_month,
    amount: row.amount,
    createdAt: row.created_at
  };
}

function mapMonthlyActual(row: {
  id: number;
  template_id: number;
  year_month: string;
  actual_amount: number;
  created_at: string;
}) {
  return {
    id: row.id,
    templateId: row.template_id,
    yearMonth: row.year_month,
    actualAmount: row.actual_amount,
    createdAt: row.created_at
  };
}

function mapSnapshot(row: { id: number; date: string; balance: number; created_at: string }) {
  return {
    id: row.id,
    date: row.date,
    balance: row.balance,
    createdAt: row.created_at
  };
}

function registerIpcHandlers(): void {
  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('get-balance', () => getBalance());

  ipcMain.handle('set-balance', (_event, balance: number) => {
    setBalance(balance);
  });

  // Categories
  ipcMain.handle('get-categories', () => {
    return getCategories().map(mapCategory);
  });

  ipcMain.handle('add-category', (_event, input: { name: string; type: string; color?: string; sortOrder?: number }) => {
    const row = addCategory(input);
    return mapCategory(row);
  });

  ipcMain.handle('update-category', (_event, id: number, input: { name?: string; type?: string; color?: string; sortOrder?: number }) => {
    updateCategory(id, input);
  });

  ipcMain.handle('delete-category', (_event, id: number) => {
    deleteCategory(id);
  });

  // Templates
  ipcMain.handle('get-templates', () => {
    return getTemplates().map(mapTemplate);
  });

  ipcMain.handle('add-template', (_event, template: { name: string; dayOfMonth: number; type: string; categoryId?: number | null; defaultAmount?: number }) => {
    const row = addTemplate(template.name, template.dayOfMonth, template.type, template.categoryId, template.defaultAmount);
    return mapTemplate(row);
  });

  ipcMain.handle('update-template', (_event, id: number, template: { name?: string; dayOfMonth?: number; type?: string; categoryId?: number | null; defaultAmount?: number }) => {
    updateTemplate(id, template);
  });

  ipcMain.handle('delete-template', (_event, id: number) => {
    deleteTemplate(id);
  });

  ipcMain.handle('toggle-template', (_event, id: number, enabled: boolean) => {
    toggleTemplate(id, enabled);
  });

  // Monthly Amounts
  ipcMain.handle('get-monthly-amounts', (_event, yearMonth: string) => {
    return getMonthlyAmounts(yearMonth).map(mapMonthlyAmount);
  });

  ipcMain.handle('get-monthly-amounts-range', (_event, startMonth: string, endMonth: string) => {
    return getMonthlyAmountsRange(startMonth, endMonth).map(mapMonthlyAmount);
  });

  ipcMain.handle('set-monthly-amount', (_event, templateId: number, yearMonth: string, amount: number) => {
    const row = setMonthlyAmount(templateId, yearMonth, amount);
    return mapMonthlyAmount(row);
  });

  ipcMain.handle('delete-monthly-amount', (_event, templateId: number, yearMonth: string) => {
    deleteMonthlyAmount(templateId, yearMonth);
  });

  ipcMain.handle('copy-monthly-amounts', (_event, fromMonth: string, toMonth: string) => {
    return copyMonthlyAmounts(fromMonth, toMonth).map(mapMonthlyAmount);
  });

  // Monthly Actuals
  ipcMain.handle('get-monthly-actuals', (_event, yearMonth: string) => {
    return getMonthlyActuals(yearMonth).map(mapMonthlyActual);
  });

  ipcMain.handle('set-monthly-actual', (_event, templateId: number, yearMonth: string, amount: number) => {
    const row = setMonthlyActual(templateId, yearMonth, amount);
    return mapMonthlyActual(row);
  });

  ipcMain.handle('delete-monthly-actual', (_event, templateId: number, yearMonth: string) => {
    deleteMonthlyActual(templateId, yearMonth);
  });

  // Snapshots
  ipcMain.handle('get-snapshots', () => {
    return getSnapshots().map(mapSnapshot);
  });

  ipcMain.handle('add-snapshot', (_event, date: string, balance: number) => {
    const row = addSnapshot(date, balance);
    return mapSnapshot(row);
  });

  ipcMain.handle('delete-snapshot', (_event, id: number) => {
    deleteSnapshot(id);
  });

  // Analytics
  ipcMain.handle('get-monthly-actuals-range', (_event, startMonth: string, endMonth: string) => {
    return getMonthlyActualsRange(startMonth, endMonth).map((row) => ({
      templateId: row.template_id,
      yearMonth: row.year_month,
      actualAmount: row.actual_amount,
      templateName: row.template_name,
      templateType: row.template_type as 'income' | 'expense',
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryColor: row.category_color,
    }));
  });

  ipcMain.handle('get-snapshots-range', (_event, startDate: string, endDate: string) => {
    return getSnapshotsRange(startDate, endDate).map(mapSnapshot);
  });
}

app.whenReady().then(() => {
  initDatabase();
  registerIpcHandlers();
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
