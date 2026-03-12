const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, protocol } = require('electron');
const log = require('electron-log');
const { createDataStore } = require('./main/data-store');
const { createMapTileService } = require('./main/map-tile-service');
const {
  getAccessFileFingerprint,
  geocodeOrigin,
  geocodePendingPeople,
  importAccessDatabase,
  loadAccessPassword,
  loadGoogleMapsApiKey,
  saveAccessPassword
} = require('./main/access-service');
const { exportTrasaArchive, importTrasaArchive } = require('./main/trasa-service');

let mainWindow;
let store;
let autoUpdater = null;
let exclusiveOperationQueue = Promise.resolve();
let accessReimportInterval = null;
let devReloadWatchers = [];
let devReloadTimer = null;
let devReloadInFlight = false;

const ACCESS_REIMPORT_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_LAUNCH_SETUP_KEY = 'firstLaunchSetupCompleted';
const WINDOW_STATE_SETTING_KEY = 'windowState';
const MAP_SELECTION_HISTORY_SETTING_KEY = 'mapPersonSelectionHistory';
const MAP_SELECTION_HISTORY_LIMIT = 100;
const STARTUP_UPDATE_HIDE_DELAY_MS = 900;
const STARTUP_UPDATE_ERROR_HIDE_DELAY_MS = 2200;
const STARTUP_UPDATE_INSTALL_DELAY_MS = 1200;
const STARTUP_UPDATE_MAX_BLOCK_MS = 12000;
const DEV_SIMULATED_UPDATE_VERSION = '0.5.99-test';
const DEFAULT_WINDOW_BOUNDS = Object.freeze({
  width: 1480,
  height: 980
});
const WINDOW_MIN_WIDTH = 1120;
const WINDOW_MIN_HEIGHT = 760;
const isDevMode = process.argv.includes('--dev');
let mapTileService = null;
let persistWindowStateTimer = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'maptiles',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
]);

let updaterState = {
  phase: 'idle',
  message: 'Oczekiwanie na status aktualizacji...',
  visible: false,
  canSkip: false,
  readyToInstall: false,
  progressPercent: null,
  version: null,
  source: null,
  announcementAvailable: false,
  announcementVisible: false,
  announcementVersion: null,
  announcementTitle: null,
  announcementMessage: null,
  announcementHasSpecialMessage: false
};
let currentUpdateCheckSource = null;
let startupUpdateFlowPromise = null;
let resolveStartupUpdateFlowPromise = null;
let startupUpdateResolutionTimer = null;
let startupUpdateInstallTimer = null;
let startupUpdateBlockTimer = null;
let startupUpdateInstallArmed = false;

function getDevModeUpdaterMessage() {
  return 'Tryb dev: auto-reload wlaczony, auto-update wylaczony.';
}

function normalizeReleaseAnnouncementText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getReleaseAnnouncement(info = {}) {
  const version = String(info.version || '').trim() || null;
  const releaseName = normalizeReleaseAnnouncementText(info.releaseName);

  let releaseNotes = '';
  if (typeof info.releaseNotes === 'string') {
    releaseNotes = normalizeReleaseAnnouncementText(info.releaseNotes);
  } else if (Array.isArray(info.releaseNotes)) {
    const matchingNote = info.releaseNotes.find((entry) => entry?.version === version && entry?.note) || info.releaseNotes[0];
    releaseNotes = normalizeReleaseAnnouncementText(matchingNote?.note);
  }

  const title = releaseName || (version ? `Nowa wersja ${version}` : 'Nowa wersja aplikacji');
  const message = releaseNotes || (version
    ? `Dostepna jest nowa wersja ${version}. Pobieranie rozpoczelo sie automatycznie.`
    : 'Dostepna jest nowa wersja aplikacji. Pobieranie rozpoczelo sie automatycznie.');

  return {
    version,
    title,
    message,
    hasSpecialMessage: Boolean(releaseNotes)
  };
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function sendUpdateStatus(message) {
  sendToRenderer('updater:status', message);
}

function getUpdaterState() {
  return { ...updaterState };
}

function setUpdaterState(patch) {
  updaterState = {
    ...updaterState,
    ...patch
  };
  sendToRenderer('updater:state', getUpdaterState());
}

function showUpdateAnnouncement() {
  if (!updaterState.announcementAvailable) {
    return getUpdaterState();
  }

  setUpdaterState({
    announcementVisible: true
  });
  return getUpdaterState();
}

function hideUpdateAnnouncement() {
  setUpdaterState({
    announcementVisible: false
  });
  return getUpdaterState();
}

function sendOperationStatus(payload) {
  sendToRenderer('app:operationStatus', payload);
}

function clearStartupUpdateResolutionTimer() {
  if (startupUpdateResolutionTimer) {
    clearTimeout(startupUpdateResolutionTimer);
    startupUpdateResolutionTimer = null;
  }
}

function clearStartupUpdateInstallTimer() {
  if (startupUpdateInstallTimer) {
    clearTimeout(startupUpdateInstallTimer);
    startupUpdateInstallTimer = null;
  }
}

function clearStartupUpdateBlockTimer() {
  if (startupUpdateBlockTimer) {
    clearTimeout(startupUpdateBlockTimer);
    startupUpdateBlockTimer = null;
  }
}

function resolveStartupUpdateFlow() {
  clearStartupUpdateResolutionTimer();
  clearStartupUpdateBlockTimer();
  const resolve = resolveStartupUpdateFlowPromise;
  resolveStartupUpdateFlowPromise = null;
  startupUpdateFlowPromise = null;
  if (resolve) {
    resolve();
  }
}

function queueStartupUpdateFlowResolution(delayMs, patch = {}) {
  if (!startupUpdateFlowPromise) {
    return;
  }

  clearStartupUpdateResolutionTimer();
  startupUpdateResolutionTimer = setTimeout(() => {
    startupUpdateResolutionTimer = null;
    setUpdaterState({
      visible: false,
      canSkip: false,
      ...patch
    });
    resolveStartupUpdateFlow();
  }, delayMs);
}

function releaseStartupUpdateBlock(message, patch = {}) {
  if (!startupUpdateFlowPromise) {
    return false;
  }

  startupUpdateInstallArmed = false;
  clearStartupUpdateResolutionTimer();
  clearStartupUpdateInstallTimer();
  clearStartupUpdateBlockTimer();

  if (message) {
    sendUpdateStatus(message);
  }

  setUpdaterState({
    phase: 'dismissed',
    message: message || updaterState.message,
    visible: false,
    canSkip: false,
    source: 'startup',
    ...patch
  });
  resolveStartupUpdateFlow();

  return true;
}

function installDownloadedUpdate({ version = null, visible = false, source = currentUpdateCheckSource } = {}) {
  clearStartupUpdateInstallTimer();

  const versionLabel = version ? ` ${version}` : '';
  const downloadedMessage = `Aktualizacja${versionLabel} pobrana. Za chwile instalacja i restart aplikacji.`;

  sendUpdateStatus(downloadedMessage);
  setUpdaterState({
    phase: 'downloaded',
    message: downloadedMessage,
    visible,
    canSkip: false,
    readyToInstall: false,
    progressPercent: 100,
    version,
    source
  });

  startupUpdateInstallTimer = setTimeout(() => {
    startupUpdateInstallTimer = null;

    if (source === 'startup' && !startupUpdateInstallArmed) {
      return;
    }

    sendUpdateStatus('Instalowanie aktualizacji i ponowne uruchamianie...');
    setUpdaterState({
      phase: 'installing',
      message: 'Instalowanie aktualizacji i ponowne uruchamianie...',
      visible,
      canSkip: false,
      readyToInstall: false,
      progressPercent: 100,
      version,
      source
    });
    autoUpdater.quitAndInstall();
  }, STARTUP_UPDATE_INSTALL_DELAY_MS);
}

function simulateUpdaterState(payload = {}) {
  if (!isDevMode) {
    throw new Error('Symulacja aktualizacji jest dostepna tylko w trybie dev.');
  }

  const phase = String(payload.phase || 'idle');
  const version = String(payload.version || DEV_SIMULATED_UPDATE_VERSION).trim() || DEV_SIMULATED_UPDATE_VERSION;
  const requestedProgress = Number(payload.progressPercent);
  const progressPercent = Number.isFinite(requestedProgress)
    ? Math.max(0, Math.min(100, requestedProgress))
    : 42;
  const announcement = {
    announcementAvailable: true,
    announcementVisible: true,
    announcementVersion: version,
    announcementTitle: payload.title ? String(payload.title).trim() : `Nowa wersja ${version}`,
    announcementMessage: payload.announcementMessage
      ? String(payload.announcementMessage).trim()
      : `To jest testowa wiadomosc dla wersji ${version}.`,
    announcementHasSpecialMessage: Boolean(payload.announcementMessage)
  };

  currentUpdateCheckSource = 'dev';
  clearStartupUpdateInstallTimer();

  switch (phase) {
    case 'available':
      sendUpdateStatus(`Dostepna jest nowa wersja ${version}. Trwa pobieranie...`);
      setUpdaterState({
        phase: 'downloading',
        message: `Dostepna jest nowa wersja ${version}. Trwa pobieranie...`,
        visible: false,
        canSkip: false,
        readyToInstall: false,
        progressPercent: 0,
        version,
        source: 'dev',
        ...announcement
      });
      break;
    case 'checking':
      sendUpdateStatus('Sprawdzanie aktualizacji...');
      setUpdaterState({
        phase: 'checking',
        message: 'Sprawdzanie aktualizacji...',
        visible: true,
        canSkip: true,
        readyToInstall: false,
        progressPercent: null,
        version: null,
        source: 'dev'
      });
      break;
    case 'downloading':
      sendUpdateStatus(`Pobieranie aktualizacji ${version}: ${progressPercent.toFixed(1)}%`);
      setUpdaterState({
        phase: 'downloading',
        message: `Pobieranie aktualizacji ${version}: ${progressPercent.toFixed(1)}%`,
        visible: true,
        canSkip: true,
        readyToInstall: false,
        progressPercent,
        version,
        source: 'dev',
        ...announcement
      });
      break;
    case 'downloaded':
      sendUpdateStatus(`Aktualizacja ${version} pobrana. Za chwile instalacja i restart aplikacji.`);
      setUpdaterState({
        phase: 'downloaded',
        message: `Aktualizacja ${version} pobrana. Za chwile instalacja i restart aplikacji.`,
        visible: true,
        canSkip: false,
        readyToInstall: false,
        progressPercent: 100,
        version,
        source: 'dev',
        announcementAvailable: true,
        announcementVisible: false,
        announcementVersion: version,
        announcementTitle: announcement.announcementTitle,
        announcementMessage: announcement.announcementMessage,
        announcementHasSpecialMessage: announcement.announcementHasSpecialMessage
      });
      break;
    case 'installing':
      sendUpdateStatus('Instalowanie aktualizacji i ponowne uruchamianie...');
      setUpdaterState({
        phase: 'installing',
        message: 'Instalowanie aktualizacji i ponowne uruchamianie...',
        visible: true,
        canSkip: false,
        readyToInstall: true,
        progressPercent: 100,
        version,
        source: 'dev',
        announcementAvailable: true,
        announcementVisible: false,
        announcementVersion: version,
        announcementTitle: announcement.announcementTitle,
        announcementMessage: announcement.announcementMessage,
        announcementHasSpecialMessage: announcement.announcementHasSpecialMessage
      });
      break;
    case 'up-to-date':
      sendUpdateStatus('Brak nowych aktualizacji.');
      setUpdaterState({
        phase: 'up-to-date',
        message: 'Brak nowych aktualizacji.',
        visible: true,
        canSkip: false,
        readyToInstall: false,
        progressPercent: null,
        version: null,
        source: 'dev',
        announcementAvailable: false,
        announcementVisible: false,
        announcementVersion: null,
        announcementTitle: null,
        announcementMessage: null,
        announcementHasSpecialMessage: false
      });
      break;
    case 'error':
      sendUpdateStatus('Blad aktualizacji: symulowany problem pobierania.');
      setUpdaterState({
        phase: 'error',
        message: 'Blad aktualizacji: symulowany problem pobierania.',
        visible: true,
        canSkip: true,
        readyToInstall: false,
        progressPercent: null,
        version,
        source: 'dev',
        announcementAvailable: false,
        announcementVisible: false,
        announcementVersion: null,
        announcementTitle: null,
        announcementMessage: null,
        announcementHasSpecialMessage: false
      });
      break;
    case 'idle':
    case 'reset':
      sendUpdateStatus(getDevModeUpdaterMessage());
      setUpdaterState({
        phase: 'idle',
        message: getDevModeUpdaterMessage(),
        visible: false,
        canSkip: false,
        readyToInstall: false,
        progressPercent: null,
        version: null,
        source: 'dev',
        announcementAvailable: false,
        announcementVisible: false,
        announcementVersion: null,
        announcementTitle: null,
        announcementMessage: null,
        announcementHasSpecialMessage: false
      });
      break;
    default:
      throw new Error(`Nieznany stan symulacji aktualizacji: ${phase}`);
  }

  return getUpdaterState();
}

async function runStartupUpdateFlow() {
  if (!autoUpdater) {
    return;
  }

  if (startupUpdateFlowPromise) {
    return startupUpdateFlowPromise;
  }

  clearStartupUpdateResolutionTimer();
  clearStartupUpdateInstallTimer();
  clearStartupUpdateBlockTimer();

  startupUpdateInstallArmed = true;
  currentUpdateCheckSource = 'startup';

  setUpdaterState({
    phase: 'checking',
    message: 'Sprawdzanie aktualizacji...',
    visible: true,
    canSkip: true,
    readyToInstall: false,
    progressPercent: null,
    version: null,
    source: 'startup'
  });

  startupUpdateFlowPromise = new Promise((resolve) => {
    resolveStartupUpdateFlowPromise = resolve;
  });

  startupUpdateBlockTimer = setTimeout(() => {
    startupUpdateBlockTimer = null;
    releaseStartupUpdateBlock(
      'Sprawdzanie aktualizacji trwa zbyt dlugo. Aplikacja uruchamia sie bez blokowania.',
      {
        phase: 'idle'
      }
    );
  }, STARTUP_UPDATE_MAX_BLOCK_MS);

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    log.error('Startup auto-update check failed', error);

    const message = formatUpdaterError(error);
    sendUpdateStatus(message);
    setUpdaterState({
      phase: 'error',
      message,
      visible: true,
      canSkip: true,
      progressPercent: null,
      source: 'startup'
    });
    queueStartupUpdateFlowResolution(STARTUP_UPDATE_ERROR_HIDE_DELAY_MS, {
      phase: 'idle'
    });
  }

  return startupUpdateFlowPromise;
}

function skipStartupUpdateFlow() {
  const message = updaterState.readyToInstall
    ? 'Aktualizacja jest juz pobrana i zainstaluje sie po zamknieciu aplikacji.'
    : 'Aktualizacja zostala pominieta na starcie. Pobieranie moze trwac dalej w tle.';

  return releaseStartupUpdateBlock(message);
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

function loadWindowState() {
  if (!store) {
    return {
      ...DEFAULT_WINDOW_BOUNDS,
      isMaximized: false
    };
  }

  try {
    const rawValue = store.getSetting(WINDOW_STATE_SETTING_KEY);
    if (!rawValue) {
      return {
        ...DEFAULT_WINDOW_BOUNDS,
        isMaximized: false
      };
    }

    const parsedValue = JSON.parse(rawValue);
    const width = Number(parsedValue?.width);
    const height = Number(parsedValue?.height);
    const x = Number(parsedValue?.x);
    const y = Number(parsedValue?.y);

    return {
      width: Number.isFinite(width) ? Math.max(Math.round(width), WINDOW_MIN_WIDTH) : DEFAULT_WINDOW_BOUNDS.width,
      height: Number.isFinite(height) ? Math.max(Math.round(height), WINDOW_MIN_HEIGHT) : DEFAULT_WINDOW_BOUNDS.height,
      x: Number.isFinite(x) ? Math.round(x) : undefined,
      y: Number.isFinite(y) ? Math.round(y) : undefined,
      isMaximized: parsedValue?.isMaximized === true
    };
  } catch (error) {
    log.warn('Failed to load window state', error);
    return {
      ...DEFAULT_WINDOW_BOUNDS,
      isMaximized: false
    };
  }
}

function persistWindowState() {
  if (!store || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  try {
    const bounds = mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    store.setSetting(
      WINDOW_STATE_SETTING_KEY,
      JSON.stringify({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: mainWindow.isMaximized()
      })
    );
  } catch (error) {
    log.warn('Failed to persist window state', error);
  }
}

function queueWindowStatePersist() {
  if (persistWindowStateTimer) {
    clearTimeout(persistWindowStateTimer);
  }

  persistWindowStateTimer = setTimeout(() => {
    persistWindowStateTimer = null;
    persistWindowState();
  }, 200);
}

function normalizeMapSelectionHistory(payload) {
  const entries = Array.isArray(payload?.entries)
    ? payload.entries
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    : [];
  const trimmedEntries = entries.slice(-MAP_SELECTION_HISTORY_LIMIT);
  const removedEntriesCount = entries.length - trimmedEntries.length;
  const fallbackIndex = trimmedEntries.length > 0 ? trimmedEntries.length - 1 : -1;
  const rawIndex = Number(payload?.index);
  const normalizedIndex = Number.isInteger(rawIndex) ? rawIndex - removedEntriesCount : fallbackIndex;

  if (trimmedEntries.length === 0) {
    return {
      entries: [],
      index: -1
    };
  }

  return {
    entries: trimmedEntries,
    index: Math.min(Math.max(normalizedIndex, 0), trimmedEntries.length - 1)
  };
}

function readMapSelectionHistory() {
  try {
    const rawValue = store.getSetting(MAP_SELECTION_HISTORY_SETTING_KEY);
    if (!rawValue) {
      return null;
    }

    return normalizeMapSelectionHistory(JSON.parse(rawValue));
  } catch (error) {
    log.warn('Failed to load map selection history', error);
    return null;
  }
}

function saveMapSelectionHistory(payload) {
  const normalizedHistory = normalizeMapSelectionHistory(payload);
  store.setSetting(MAP_SELECTION_HISTORY_SETTING_KEY, JSON.stringify(normalizedHistory));
  return normalizedHistory;
}

function closeDevReloadWatchers() {
  for (const watcher of devReloadWatchers) {
    try {
      watcher.close();
    } catch (error) {
      log.warn('Failed to close dev watcher', error);
    }
  }
  devReloadWatchers = [];
}

function isRendererReloadPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.html' || ext === '.css' || ext === '.js' || ext === '.json';
}

function shouldRestartAppForDevChange(filePath) {
  const normalizedPath = path.normalize(filePath);
  return (
    normalizedPath === path.join(__dirname, 'main.js') ||
    normalizedPath === path.join(__dirname, 'preload.js') ||
    normalizedPath.startsWith(path.join(__dirname, 'main') + path.sep)
  );
}

function triggerDevReload(filePath) {
  if (!filePath || devReloadInFlight) {
    return;
  }

  if (devReloadTimer) {
    clearTimeout(devReloadTimer);
  }

  devReloadTimer = setTimeout(() => {
    devReloadTimer = null;

    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    devReloadInFlight = true;
    const action = shouldRestartAppForDevChange(filePath) ? 'restart' : 'reload';
    log.info(`Dev ${action} triggered by ${path.relative(__dirname, filePath)}`);

    if (action === 'restart') {
      closeDevReloadWatchers();
      app.relaunch();
      app.exit(0);
      return;
    }

    mainWindow.webContents.reloadIgnoringCache();
    setTimeout(() => {
      devReloadInFlight = false;
    }, 250);
  }, 140);
}

function watchDevDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  try {
    const watcher = fs.watch(dirPath, (_eventType, fileName) => {
      if (!fileName) {
        return;
      }

      const changedPath = path.join(dirPath, fileName.toString());
      if (!isRendererReloadPath(changedPath) && !shouldRestartAppForDevChange(changedPath)) {
        return;
      }

      triggerDevReload(changedPath);
    });

    devReloadWatchers.push(watcher);
  } catch (error) {
    log.warn(`Failed to watch ${dirPath} in dev mode`, error);
  }
}

function startDevReloadWatcher() {
  if (!isDevMode) {
    return;
  }

  closeDevReloadWatchers();
  watchDevDirectory(__dirname);
  watchDevDirectory(path.join(__dirname, 'main'));

  setUpdaterState({
    phase: 'idle',
    message: getDevModeUpdaterMessage(),
    visible: false,
    canSkip: false,
    readyToInstall: false,
    progressPercent: null,
    version: null,
    source: 'dev',
    announcementAvailable: false,
    announcementVisible: false,
    announcementVersion: null,
    announcementTitle: null,
    announcementMessage: null,
    announcementHasSpecialMessage: false
  });
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
  const windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    title: ' ',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ebefe6',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow.setTitle(' ');
  });
  mainWindow.on('resize', queueWindowStatePersist);
  mainWindow.on('move', queueWindowStatePersist);
  mainWindow.on('maximize', queueWindowStatePersist);
  mainWindow.on('unmaximize', queueWindowStatePersist);
  mainWindow.on('close', persistWindowState);
  mainWindow.loadFile(path.join(__dirname, 'map.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.setTitle(' ');
    mainWindow.show();
    if (windowState.isMaximized) {
      mainWindow.maximize();
    }
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
    setUpdaterState({
      phase: 'checking',
      message: 'Sprawdzanie aktualizacji...',
      visible: currentUpdateCheckSource === 'startup' && Boolean(startupUpdateFlowPromise),
      canSkip: currentUpdateCheckSource === 'startup' && Boolean(startupUpdateFlowPromise),
      readyToInstall: false,
      progressPercent: null,
      source: currentUpdateCheckSource
    });
  });

  autoUpdater.on('update-available', (info) => {
    const startupFlowActive = currentUpdateCheckSource === 'startup' && Boolean(startupUpdateFlowPromise);
    const announcement = getReleaseAnnouncement(info);
    sendUpdateStatus(`Znaleziono aktualizacje: ${info.version}. Trwa pobieranie...`);
    setUpdaterState({
      phase: 'downloading',
      message: `Znaleziono aktualizacje: ${info.version}. Trwa pobieranie...`,
      visible: false,
      canSkip: false,
      readyToInstall: false,
      progressPercent: 0,
      version: info.version,
      source: currentUpdateCheckSource,
      announcementAvailable: true,
      announcementVisible: true,
      announcementVersion: announcement.version,
      announcementTitle: announcement.title,
      announcementMessage: announcement.message,
      announcementHasSpecialMessage: announcement.hasSpecialMessage
    });

    if (startupFlowActive) {
      resolveStartupUpdateFlow();
    }
  });

  autoUpdater.on('update-not-available', () => {
    sendUpdateStatus('Brak nowych aktualizacji.');
    setUpdaterState({
      phase: currentUpdateCheckSource === 'startup' ? 'up-to-date' : 'idle',
      message: 'Brak nowych aktualizacji.',
      visible: currentUpdateCheckSource === 'startup' && Boolean(startupUpdateFlowPromise),
      canSkip: false,
      readyToInstall: false,
      progressPercent: null,
      version: null,
      source: currentUpdateCheckSource
    });

    if (currentUpdateCheckSource === 'startup' && startupUpdateFlowPromise) {
      queueStartupUpdateFlowResolution(STARTUP_UPDATE_HIDE_DELAY_MS, {
        phase: 'idle'
      });
    }
  });

  autoUpdater.on('error', (err) => {
    const message = formatUpdaterError(err);
    sendUpdateStatus(message);
    setUpdaterState({
      phase: 'error',
      message,
      visible: currentUpdateCheckSource === 'startup' && Boolean(startupUpdateFlowPromise),
      canSkip: currentUpdateCheckSource === 'startup' && Boolean(startupUpdateFlowPromise),
      progressPercent: null,
      source: currentUpdateCheckSource
    });

    if (currentUpdateCheckSource === 'startup' && startupUpdateFlowPromise) {
      queueStartupUpdateFlowResolution(STARTUP_UPDATE_ERROR_HIDE_DELAY_MS, {
        phase: 'idle'
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = progressObj.percent.toFixed(1);
    sendUpdateStatus(`Pobieranie aktualizacji: ${percent}%`);
    setUpdaterState({
      phase: 'downloading',
      message: `Pobieranie aktualizacji: ${percent}%`,
      visible: currentUpdateCheckSource === 'startup' && Boolean(startupUpdateFlowPromise),
      canSkip: currentUpdateCheckSource === 'startup' && Boolean(startupUpdateFlowPromise),
      readyToInstall: false,
      progressPercent: Number(percent),
      source: currentUpdateCheckSource
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    const startupFlowActive = currentUpdateCheckSource === 'startup' && Boolean(startupUpdateFlowPromise);
    installDownloadedUpdate({
      version: info.version,
      visible: startupFlowActive,
      source: startupFlowActive ? 'startup' : currentUpdateCheckSource
    });
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
  const suggestedName = `Elrond-wyszukiwanie-trasy-${new Date().toISOString().slice(0, 10)}.trasa`;
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
    } else {
      const importedAccessDbPath = (store.getSetting('accessDbPath') || '').trim();
      if (importedAccessDbPath && !fs.existsSync(importedAccessDbPath)) {
        store.setSetting('accessDbPath', '');
      }
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
      'To opcjonalne. Jesli masz wczesniej wyeksportowany pakiet Elrond, mozesz go teraz zaimportowac.',
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
  mapTileService = createMapTileService({ app, log, protocol });
  await mapTileService.registerProtocol();
  const windowReady = createWindow();
  if (!isDevMode) {
    configureAutoUpdater();
  }
  await windowReady;

  startDevReloadWatcher();

  if (!isDevMode) {
    await runStartupUpdateFlow();
  }

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
  persistWindowState();
  if (accessReimportInterval) {
    clearInterval(accessReimportInterval);
    accessReimportInterval = null;
  }
  if (devReloadTimer) {
    clearTimeout(devReloadTimer);
    devReloadTimer = null;
  }
  closeDevReloadWatchers();
  clearStartupUpdateResolutionTimer();
  clearStartupUpdateInstallTimer();
  clearStartupUpdateBlockTimer();
  if (persistWindowStateTimer) {
    clearTimeout(persistWindowStateTimer);
    persistWindowStateTimer = null;
  }
});

ipcMain.handle('app:getBootstrap', async () => ({
  version: app.getVersion(),
  isDevMode,
  passwordConfigured: Boolean(loadAccessPassword()),
  googleMapsConfigured: Boolean(loadGoogleMapsApiKey() || store.getSetting('googleMapsApiKey')),
  summary: store.getDashboardSummary(),
  updater: getUpdaterState()
}));

ipcMain.on('app:getRuntimeMetaSync', (event) => {
  event.returnValue = {
    version: app.getVersion(),
    isDevMode
  };
});

ipcMain.handle('updater:getState', async () => getUpdaterState());
ipcMain.handle('updater:showAnnouncement', async () => showUpdateAnnouncement());
ipcMain.handle('updater:hideAnnouncement', async () => hideUpdateAnnouncement());

ipcMain.handle('updater:checkNow', async () => {
  if (!autoUpdater) {
    sendUpdateStatus('Tryb dev: auto-update jest wylaczony.');
    return false;
  }

  if (updaterState.readyToInstall) {
    sendUpdateStatus('Aktualizacja jest juz pobrana i czeka na instalacje.');
    return true;
  }

  currentUpdateCheckSource = 'manual';
  await autoUpdater.checkForUpdates();
  return true;
});

ipcMain.handle('updater:simulate', async (_event, payload = {}) => simulateUpdaterState(payload));

ipcMain.handle('updater:installNow', () => {
  if (!autoUpdater) {
    sendUpdateStatus('Tryb dev: auto-update jest wylaczony.');
    return false;
  }

  clearStartupUpdateInstallTimer();
  sendUpdateStatus('Instalowanie aktualizacji i ponowne uruchamianie...');
  setUpdaterState({
    phase: 'installing',
    message: 'Instalowanie aktualizacji i ponowne uruchamianie...',
    visible: false,
    canSkip: false,
    readyToInstall: true,
    progressPercent: 100
  });
  autoUpdater.quitAndInstall();
});

ipcMain.handle('updater:skipStartup', async () => {
  const result = skipStartupUpdateFlow();
  setUpdaterState({ visible: false, canSkip: false });
  return result;
});

ipcMain.handle('settings:saveGoogleMapsApiKey', async (_event, apiKey) => {
  store.setSetting('googleMapsApiKey', apiKey ? String(apiKey).trim() : '');
  return store.getDashboardSummary();
});

ipcMain.handle('settings:saveAccessPassword', async (_event, password) => {
  saveAccessPassword(password);
  return {
    summary: store.getDashboardSummary(),
    passwordConfigured: Boolean(loadAccessPassword())
  };
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

  return enqueueExclusiveOperation(async () => {
    const result = await importTrasaFile(trasaPath);
    return {
      ...result,
      passwordConfigured: Boolean(loadAccessPassword())
    };
  });
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
ipcMain.handle('people:list', (_event, input) => store.searchPeople(input));
ipcMain.handle('people:getDetails', (_event, sourceRowId) => store.getPersonDetails(sourceRowId));
ipcMain.handle('map:getPoints', (_event, input) => store.listMapPoints(input));
ipcMain.handle('map:getDateFilterOptions', () => store.listMapDateFilterOptions());
ipcMain.handle('map:getSelectionHistory', () => readMapSelectionHistory());
ipcMain.handle('map:setSelectionHistory', (_event, payload = {}) => saveMapSelectionHistory(payload));

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
