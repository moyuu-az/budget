import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  // Skip auto-update in development mode
  if (!app.isPackaged) {
    ipcMain.handle('check-for-updates', async () => {});
    ipcMain.handle('download-update', async () => {});
    ipcMain.handle('install-update', () => {});
    return;
  }

  log.transports.file.level = 'info';
  autoUpdater.logger = log;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  function sendStatus(status: string, data?: Record<string, unknown>) {
    mainWindow.webContents.send('update-status', { status, ...data });
  }

  autoUpdater.on('checking-for-update', () => {
    sendStatus('checking');
  });

  autoUpdater.on('update-available', (info) => {
    sendStatus('available', { version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    sendStatus('up-to-date');
  });

  autoUpdater.on('download-progress', (progress) => {
    sendStatus('downloading', { percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatus('downloaded', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err);
    sendStatus('error', { message: err.message });
  });

  ipcMain.handle('check-for-updates', async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      log.error('Check for updates failed:', err);
    }
  });

  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      log.error('Download update failed:', err);
    }
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
  });

  // Initial check 3 seconds after launch
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('Initial update check failed:', err);
    });
  }, 3000);
}
