const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const log = require('electron-log');
const { createDataStore } = require('./main/data-store');
const {
  geocodeOrigin,
  geocodePendingPeople,
  importAccessDatabase,
  loadAccessPassword,
  loadGoogleMapsApiKey
} = require('./main/access-service');

let mainWindow;
let store;
let autoUpdater = null;

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function sendUpdateStatus(message) {
  sendToRenderer('updater:status', message);
}

function sendOperationStatus(payload) {
  sendToRenderer('app:operationStatus', payload);
}

function formatUpdaterError(err) {
  const message = err == null ? 'nieznany blad' : err.message || String(err);

  if (
    message.includes('ERR_UPDATER_LATEST_VERSION_NOT_FOUND') ||
    message.includes('Unable to find latest version on GitHub')
  ) {
    return (
      'Blad aktualizacji: brak publicznego release na GitHub. ' +
      'Sam tag albo draft release nie wystarczy do auto-update.'
    );
  }

  if (
    message.includes('ERR_UPDATER_CHANNEL_FILE_NOT_FOUND') ||
    message.includes('latest-linux.yml')
  ) {
    return (
      'Blad aktualizacji: w release brakuje plikow updatera ' +
      '(np. latest-linux.yml i AppImage/instalator).'
    );
  }

  return `Blad aktualizacji: ${message}`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1120,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ebefe6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });
}

function configureAutoUpdater() {
  ({ autoUpdater } = require('electron-updater'));
  log.transports.file.level = 'info';
  autoUpdater.logger = log;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus('Sprawdzanie aktualizacji...');
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus(`Znaleziono aktualizacje: ${info.version}. Trwa pobieranie...`);
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

async function pickAccessDatabase() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Wybierz plik Access .accdb',
    properties: ['openFile'],
    filters: [
      { name: 'Baza Access', extensions: ['accdb', 'mdb'] },
      { name: 'Wszystkie pliki', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  store.setSetting('accessDbPath', selectedPath);
  return selectedPath;
}

app.whenReady().then(() => {
  store = createDataStore(app);
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

ipcMain.handle('app:getBootstrap', async () => ({
  version: app.getVersion(),
  passwordConfigured: Boolean(loadAccessPassword()),
  googleMapsConfigured: Boolean(loadGoogleMapsApiKey() || store.getSetting('googleMapsApiKey')),
  summary: store.getDashboardSummary()
}));

ipcMain.handle('updater:checkNow', async () => {
  await autoUpdater.checkForUpdates();
  return true;
});

ipcMain.handle('updater:installNow', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('settings:saveGoogleMapsApiKey', async (_event, apiKey) => {
  store.setSetting('googleMapsApiKey', apiKey ? String(apiKey).trim() : '');
  return store.getDashboardSummary();
});

ipcMain.handle('access:pickFile', async () => {
  const selectedPath = await pickAccessDatabase();
  return {
    accessDbPath: selectedPath,
    summary: store.getDashboardSummary()
  };
});

ipcMain.handle('access:import', async (_event, payload = {}) => {
  const accessDbPath = payload.accessDbPath || store.getSetting('accessDbPath');
  if (!accessDbPath) {
    throw new Error('Najpierw wybierz lokalizacje pliku Access.');
  }

  sendOperationStatus({
    type: 'import',
    status: 'started',
    message: 'Rozpoczeto import Access -> SQLite.'
  });

  const summary = await importAccessDatabase({
    app,
    store,
    accessDbPath,
    onProgress: (progress) => {
      sendOperationStatus({
        type: 'import',
        status: 'progress',
        message: `Import tabeli ${progress.tableName || ''}`.trim(),
        progress
      });
    }
  });

  sendOperationStatus({
    type: 'import',
    status: 'completed',
    message: 'Import zakonczony.',
    summary
  });

  return summary;
});

ipcMain.handle('geocode:run', async (_event, payload = {}) => {
  const apiKey = (payload.apiKey || store.getSetting('googleMapsApiKey') || '').trim();
  if (payload.apiKey) {
    store.setSetting('googleMapsApiKey', apiKey);
  }

  sendOperationStatus({
    type: 'geocoding',
    status: 'started',
    message: 'Rozpoczeto geokodowanie adresow.'
  });

  const result = await geocodePendingPeople({
    store,
    apiKey,
    limit: Number(payload.limit || 50),
    onProgress: (progress) => {
      sendOperationStatus({
        type: 'geocoding',
        status: 'progress',
        message: `Geokodowanie ${progress.current}/${progress.total}`,
        progress
      });
    }
  });

  const summary = store.getDashboardSummary();
  sendOperationStatus({
    type: 'geocoding',
    status: 'completed',
    message: `Geokodowanie zakonczone. Sukces: ${result.resolved}, bledy: ${result.failed}.`,
    result,
    summary
  });

  return {
    result,
    summary
  };
});

ipcMain.handle('dashboard:getSummary', () => store.getDashboardSummary());
ipcMain.handle('data:getTables', () => store.getImportTables());
ipcMain.handle('data:getTableRows', (_event, input) => store.getTableRows(input));
ipcMain.handle('people:list', (_event, input) => store.listPeople(input));
ipcMain.handle('people:getDetails', (_event, sourceRowId) => store.getPersonDetails(sourceRowId));
ipcMain.handle('map:getPoints', (_event, input) => store.listMapPoints(input));

ipcMain.handle('route:build', async (_event, payload = {}) => {
  let originLat = payload.originLat;
  let originLng = payload.originLng;

  if ((!Number.isFinite(originLat) || !Number.isFinite(originLng)) && payload.originAddress) {
    const geocoded = await geocodeOrigin({
      store,
      address: payload.originAddress,
      apiKey: payload.apiKey
    });
    originLat = geocoded.lat;
    originLng = geocoded.lng;
  }

  return store.buildRoute({
    ...payload,
    originLat,
    originLng
  });
});

ipcMain.handle('notes:add', (_event, payload) => {
  if (!payload?.message || !payload.message.trim()) {
    throw new Error('Tresc notatki nie moze byc pusta.');
  }
  return store.addNote(payload);
});

ipcMain.handle('customPoints:add', (_event, payload) => {
  const lat = Number(payload.lat);
  const lng = Number(payload.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Wspolrzedne punktu musza byc liczbami.');
  }
  if (!payload.label || !payload.label.trim()) {
    throw new Error('Etykieta punktu jest wymagana.');
  }
  return store.addCustomPoint({
    label: payload.label,
    addressText: payload.addressText || null,
    lat,
    lng
  });
});
