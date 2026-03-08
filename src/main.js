const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const log = require('electron-log');
const { createDataStore } = require('./main/data-store');
const {
  getAccessFileFingerprint,
  geocodeOrigin,
  geocodePendingPeople,
  importAccessDatabase,
  loadAccessPassword,
  loadGoogleMapsApiKey
} = require('./main/access-service');
const { exportTrasaArchive, importTrasaArchive } = require('./main/trasa-service');

let mainWindow;
let store;
let autoUpdater = null;
let exclusiveOperationQueue = Promise.resolve();
let accessReimportInterval = null;

const ACCESS_REIMPORT_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_LAUNCH_SETUP_KEY = 'firstLaunchSetupCompleted';

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

function enqueueExclusiveOperation(operation) {
  const task = exclusiveOperationQueue.then(operation);
  exclusiveOperationQueue = task.catch(() => {});
  return task;
}

function buildImportStartMessage(request, hasSnapshot) {
  if (request.source === 'auto' && request.reason === 'startup') {
    return 'Uruchomiono startowy reimport Access -> SQLite.';
  }

  if (request.source === 'auto') {
    return hasSnapshot
      ? 'Wykryto zmiane w pliku Access. Rozpoczeto bezpieczny reimport.'
      : 'Brak lokalnego snapshotu. Rozpoczeto pierwszy automatyczny import Access -> SQLite.';
  }

  return 'Rozpoczeto bezpieczny import Access -> SQLite.';
}

function buildImportProgressMessage(progress) {
  if (progress?.message) {
    return progress.message;
  }

  if (progress?.phase === 'promote') {
    return 'Podmiana aktywnego snapshotu SQLite.';
  }

  if (progress?.phase === 'preparing') {
    return 'Przygotowanie bezpiecznego reimportu.';
  }

  return `Import tabeli ${progress?.tableName || ''}`.trim();
}

function buildImportCompletedMessage(request) {
  if (request.source === 'auto' && request.reason === 'startup') {
    return 'Startowy reimport zakonczony.';
  }

  if (request.source === 'auto') {
    return 'Automatyczny reimport zakonczony.';
  }

  return 'Import zakonczony.';
}

function buildImportFailedMessage(request, error) {
  if (request.source === 'auto') {
    return `Automatyczny reimport nie powiodl sie: ${error.message}`;
  }

  return `Import nie powiodl sie: ${error.message}`;
}

async function ensureAccessImport(request = {}) {
  const accessDbPath = request.accessDbPath || store.getSetting('accessDbPath');
  if (!accessDbPath) {
    if (request.source === 'manual') {
      throw new Error('Najpierw wybierz lokalizacje pliku Access.');
    }
    return store.getDashboardSummary();
  }

  const summaryBeforeImport = store.getDashboardSummary();
  const hasSnapshot = Boolean(summaryBeforeImport?.importMeta?.imported_at);
  const importedPath =
    store.getSetting('lastImportedAccessPath') || summaryBeforeImport?.importMeta?.source_path || '';
  const importedFingerprint = store.getSetting('lastImportedAccessFingerprint') || '';

  let sourceFingerprint;
  try {
    sourceFingerprint = await getAccessFileFingerprint(accessDbPath);
  } catch (error) {
    const wrappedError = new Error(`Nie mozna odczytac pliku Access: ${error.message}`);
    if (request.source === 'auto') {
      sendOperationStatus({
        type: 'import',
        source: request.source,
        status: 'failed',
        reason: request.reason,
        message: buildImportFailedMessage(request, wrappedError),
        error: wrappedError.message,
        summary: summaryBeforeImport
      });
      return summaryBeforeImport;
    }
    throw wrappedError;
  }

  const shouldImport =
    Boolean(request.force) ||
    !hasSnapshot ||
    importedPath !== accessDbPath ||
    importedFingerprint !== sourceFingerprint;

  if (!shouldImport) {
    return summaryBeforeImport;
  }

  sendOperationStatus({
    type: 'import',
    source: request.source || 'manual',
    status: 'started',
    reason: request.reason || 'manual',
    message: buildImportStartMessage(request, hasSnapshot)
  });

  try {
    const summary = await importAccessDatabase({
      app,
      store,
      accessDbPath,
      sourceFingerprint,
      onProgress: (progress) => {
        sendOperationStatus({
          type: 'import',
          source: request.source || 'manual',
          status: 'progress',
          reason: request.reason || 'manual',
          message: buildImportProgressMessage(progress),
          progress
        });
      }
    });

    sendOperationStatus({
      type: 'import',
      source: request.source || 'manual',
      status: 'completed',
      reason: request.reason || 'manual',
      message: buildImportCompletedMessage(request),
      summary
    });

    return summary;
  } catch (error) {
    const summary = store.getDashboardSummary();
    sendOperationStatus({
      type: 'import',
      source: request.source || 'manual',
      status: 'failed',
      reason: request.reason || 'manual',
      message: buildImportFailedMessage(request, error),
      error: error.message,
      summary
    });
    throw error;
  }
}

function queueAccessImport(request = {}) {
  return enqueueExclusiveOperation(() => ensureAccessImport(request));
}

function startAccessReimportMonitor() {
  if (accessReimportInterval) {
    clearInterval(accessReimportInterval);
  }

  void queueAccessImport({
    source: 'auto',
    reason: 'startup',
    force: true
  }).catch((error) => {
    log.error('Startup access reimport failed', error);
  });

  accessReimportInterval = setInterval(() => {
    void queueAccessImport({
      source: 'auto',
      reason: 'interval',
      force: false
    }).catch((error) => {
      log.error('Scheduled access reimport failed', error);
    });
  }, ACCESS_REIMPORT_INTERVAL_MS);
}

function removeDatabaseSidecars(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
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
  let resolveReady;
  const readyPromise = new Promise((resolve) => {
    resolveReady = resolve;
  });

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
    resolveReady();
  });

  return readyPromise;
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

async function pickTrasaExportPath() {
  const suggestedName = `MapShortner-${new Date().toISOString().slice(0, 10)}.trasa`;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Eksportuj pakiet .trasa',
    defaultPath: path.join(app.getPath('documents'), suggestedName),
    filters: [
      { name: 'Pakiet trasy', extensions: ['trasa'] },
      { name: 'Wszystkie pliki', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return result.filePath;
}

async function pickTrasaImportPath() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Wczytaj pakiet .trasa',
    properties: ['openFile'],
    filters: [
      { name: 'Pakiet trasy', extensions: ['trasa'] },
      { name: 'Legacy ZIP', extensions: ['zip'] },
      { name: 'Wszystkie pliki', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}

function shouldRunFirstLaunchSetup() {
  if (store.getSetting(FIRST_LAUNCH_SETUP_KEY) === '1') {
    return false;
  }

  const summary = store.getDashboardSummary();
  const hasExistingSetup = Boolean(
    summary?.settings?.accessDbPath ||
      summary?.importMeta?.source_path ||
      summary?.importMeta?.imported_at ||
      summary?.stats?.totalRows ||
      summary?.stats?.totalCustomPoints ||
      summary?.stats?.totalNotes
  );

  if (hasExistingSetup) {
    store.setSetting(FIRST_LAUNCH_SETUP_KEY, '1');
    return false;
  }

  return true;
}

async function importTrasaFile(trasaPath, options = {}) {
  const { accessDbPathOverride = null, emitStatus = true } = options;
  const targetDbPath = path.join(app.getPath('userData'), 'data', 'mapshortner.sqlite');
  const backupPath = path.join(app.getPath('temp'), `mapshortner-before-import-${Date.now()}.sqlite`);

  if (emitStatus) {
    sendOperationStatus({
      type: 'trasa-import',
      status: 'started',
      message: 'Rozpoczeto import pakietu .trasa.'
    });
  }

  if (store) {
    store.exportSnapshot(backupPath);
    store.close();
  }

  try {
    const result = importTrasaArchive({
      app,
      trasaPath,
      targetDbPath
    });

    store = createDataStore(app);

    const googleMapsApiKey = loadGoogleMapsApiKey();
    if (googleMapsApiKey) {
      store.setSetting('googleMapsApiKey', googleMapsApiKey);
    }
    if (accessDbPathOverride) {
      store.setSetting('accessDbPath', accessDbPathOverride);
    }

    const summary = store.getDashboardSummary();
    if (emitStatus) {
      sendOperationStatus({
        type: 'trasa-import',
        status: 'completed',
        message: `Wczytano pakiet .trasa z ${trasaPath}.`,
        result,
        summary
      });
    }

    return {
      ...result,
      summary
    };
  } catch (error) {
    if (fs.existsSync(backupPath)) {
      fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
      removeDatabaseSidecars(targetDbPath);
      fs.copyFileSync(backupPath, targetDbPath);
    }
    store = createDataStore(app);
    if (accessDbPathOverride) {
      store.setSetting('accessDbPath', accessDbPathOverride);
    }
    throw error;
  } finally {
    fs.rmSync(backupPath, { force: true });
  }
}

async function runFirstLaunchSetup() {
  if (!shouldRunFirstLaunchSetup()) {
    return;
  }

  sendOperationStatus({
    type: 'first-launch',
    status: 'started',
    message: 'Pierwsze uruchomienie: konfiguracja plikow startowych.'
  });

  const accessPrompt = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Pierwsze uruchomienie',
    message: 'Czy chcesz teraz wskazac plik Access .accdb?',
    detail:
      'Jesli wybierzesz plik teraz, aplikacja od razu po konfiguracji uruchomi pierwszy automatyczny import do SQLite.',
    buttons: ['Wybierz .accdb', 'Pomin'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });

  let selectedAccessPath = store.getSetting('accessDbPath');
  if (accessPrompt.response === 0) {
    selectedAccessPath = await pickAccessDatabase();
  }

  const trasaPrompt = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Pierwsze uruchomienie',
    message: 'Czy masz pakiet .trasa do wczytania?',
    detail:
      'To opcjonalne. Jesli masz wczesniej wyeksportowany pakiet MapShortner, mozesz go teraz zaimportowac.',
    buttons: ['Wczytaj .trasa', 'Pomin'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });

  if (trasaPrompt.response === 0) {
    const trasaPath = await pickTrasaImportPath();
    if (trasaPath) {
      await importTrasaFile(trasaPath, {
        accessDbPathOverride: selectedAccessPath || null
      });
    }
  }

  store.setSetting(FIRST_LAUNCH_SETUP_KEY, '1');
  sendOperationStatus({
    type: 'first-launch',
    status: 'completed',
    message: 'Konfiguracja pierwszego uruchomienia zakonczona.',
    summary: store.getDashboardSummary()
  });
}

app.whenReady().then(async () => {
  store = createDataStore(app);
  const windowReady = createWindow();
  configureAutoUpdater();
  await windowReady;

  try {
    await runFirstLaunchSetup();
  } catch (error) {
    log.error('First launch setup failed', error);
    sendOperationStatus({
      type: 'first-launch',
      status: 'failed',
      message: `Konfiguracja pierwszego uruchomienia nie powiodla sie: ${error.message}`,
      error: error.message,
      summary: store.getDashboardSummary()
    });
  }

  startAccessReimportMonitor();

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

app.on('before-quit', () => {
  if (accessReimportInterval) {
    clearInterval(accessReimportInterval);
    accessReimportInterval = null;
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

ipcMain.handle('trasa:export', async (_event, payload = {}) => {
  const targetPath = payload.targetPath || (await pickTrasaExportPath());
  if (!targetPath) {
    return null;
  }

  return enqueueExclusiveOperation(async () => {
    sendOperationStatus({
      type: 'trasa-export',
      status: 'started',
      message: 'Rozpoczeto eksport pakietu .trasa.'
    });

    const result = exportTrasaArchive({
      app,
      store,
      targetPath,
      appVersion: app.getVersion()
    });

    sendOperationStatus({
      type: 'trasa-export',
      status: 'completed',
      message: `Wyeksportowano pakiet .trasa do ${result.outputPath}.`,
      result
    });

    return {
      ...result,
      summary: store.getDashboardSummary()
    };
  });
});

ipcMain.handle('trasa:import', async () => {
  const trasaPath = await pickTrasaImportPath();
  if (!trasaPath) {
    return null;
  }

  return enqueueExclusiveOperation(() => importTrasaFile(trasaPath));
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

  return queueAccessImport({
    source: 'manual',
    reason: 'manual',
    force: true,
    accessDbPath
  });
});

ipcMain.handle('geocode:run', async (_event, payload = {}) => {
  return enqueueExclusiveOperation(async () => {
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
