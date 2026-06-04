import { app, BrowserWindow } from 'electron';
import path from 'path';
import { initAutoUpdater } from './updater';
import { createDatabase } from './db/connection';
import { createRepositories } from './repositories';
import { registerIpcHandlers } from './ipc/register';

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

app.whenReady().then(() => {
  const db = createDatabase();
  const repos = createRepositories(db);
  registerIpcHandlers(repos);

  const mainWindow = createWindow();

  // Always register updater handlers; they no-op internally when the app is not packaged,
  // so the renderer can invoke them in every mode without hitting "no handler registered".
  initAutoUpdater(mainWindow);

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
