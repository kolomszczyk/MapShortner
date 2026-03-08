const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

let mainWindow;

function sendUpdateStatus(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', message);
  }
}

function formatUpdaterError(err) {
  const message = err == null ? 'nieznany błąd' : err.message || String(err);

  if (
    message.includes('ERR_UPDATER_LATEST_VERSION_NOT_FOUND') ||
    message.includes('Unable to find latest version on GitHub')
  ) {
    return (
      'Błąd aktualizacji: brak publicznego release na GitHub. ' +
      'Sam tag albo draft release nie wystarczy do auto-update.'
    );
  }

  if (
    message.includes('ERR_UPDATER_CHANNEL_FILE_NOT_FOUND') ||
    message.includes('latest-linux.yml')
  ) {
    return (
      'Błąd aktualizacji: w release brakuje plików updatera ' +
      '(np. latest-linux.yml i AppImage/instalator).'
    );
  }

  return `Błąd aktualizacji: ${message}`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 620,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.maximize();
}

function configureAutoUpdater() {
  log.transports.file.level = 'info';
  autoUpdater.logger = log;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus('Sprawdzanie aktualizacji...');
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus(`Znaleziono aktualizację: ${info.version}. Trwa pobieranie...`);
  });

  autoUpdater.on('update-not-available', () => {
    sendUpdateStatus('Brak nowych aktualizacji.');
  });

  autoUpdater.on('error', (err) => {
    sendUpdateStatus(formatUpdaterError(err));
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = progressObj.percent.toFixed(1);
    sendUpdateStatus(`Pobieranie aktualizacji: ${percent}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus(
      `Aktualizacja ${info.version} gotowa. Kliknij "Zainstaluj i uruchom ponownie".`
    );
  });
}

app.whenReady().then(() => {
  createWindow();
  configureAutoUpdater();

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 3000);

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

ipcMain.handle('updater:checkNow', async () => {
  await autoUpdater.checkForUpdates();
  return true;
});

ipcMain.handle('updater:installNow', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('map:getPoints', async () => {
  const filePath = path.join(__dirname, 'poland-points.json');
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
});
