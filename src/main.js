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
const { openPersonInRunningAccessBridge } = require('./main/accessbrigeladkfjlakgj-service');
const { exportTrasaArchive, importTrasaArchive } = require('./main/trasa-service');

let mainWindow;
let updaterWindow = null;
let store;
let autoUpdater = null;
let exclusiveOperationQueue = Promise.resolve();
let accessReimportInterval = null;
let devReloadWatchers = [];
let devReloadTimer = null;
let devReloadInFlight = false;
const startupTimeline = {
  appStartAt: Date.now(),
  appReadyAt: null,
  dataStoreReadyAt: null,
  mapTileProtocolReadyAt: null,
  updaterFlowStartedAt: null,
  updaterFlowFinishedAt: null,
  windowCreatedAt: null,
  windowShownAt: null
};

const ACCESS_REIMPORT_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_LAUNCH_SETUP_KEY = 'firstLaunchSetupCompleted';
const WINDOW_STATE_SETTING_KEY = 'windowState';
const MAP_SELECTION_HISTORY_SETTING_KEY = 'mapPersonSelectionHistory';
const MAP_SELECTION_HISTORY_LIMIT = 100;
const OPERATION_LOG_HISTORY_SETTING_KEY = 'operationLogHistory';
const OPERATION_LOG_HISTORY_LIMIT = 300;
const OPERATION_LOG_HISTORY_PERSIST_DELAY_MS = 1200;
const STARTUP_UPDATE_HIDE_DELAY_MS = 120;
const STARTUP_UPDATE_ERROR_HIDE_DELAY_MS = 180;
const STARTUP_UPDATE_INSTALL_DELAY_MS = 1200;
const STARTUP_UPDATE_MAX_BLOCK_MS = 12000;
const UPDATER_WINDOW_BOUNDS = Object.freeze({
  width: 520,
  height: 340
});
const DEV_SIMULATED_UPDATE_VERSION = '0.5.99-test';
const DEV_UPDATER_PREVIEW_FLAG = '--dev-updater-preview';
const DEV_UPDATER_PREVIEW_SCENARIO_PREFIX = '--dev-updater-preview=';
const DEFAULT_WINDOW_BOUNDS = Object.freeze({
  width: 1480,
  height: 980
});
const WINDOW_MIN_WIDTH = 1120;
const WINDOW_MIN_HEIGHT = 760;
const isDevMode = process.argv.includes('--dev') || process.argv.includes('dev');
let mapTileService = null;
let persistWindowStateTimer = null;
let operationLogHistory = null;
let operationLogEntrySequence = 0;
let persistOperationLogHistoryTimer = null;

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
let devUpdaterPreviewInProgress = false;
let startupUpdateSkipped = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

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

function sendToUpdaterWindow(channel, payload) {
  if (updaterWindow && !updaterWindow.isDestroyed()) {
    updaterWindow.webContents.send(channel, payload);
  }
}

function sendUpdateStatus(message) {
  sendToRenderer('updater:status', message);
  sendToUpdaterWindow('updater:status', message);
}

function buildOperationLogEntryId() {
  operationLogEntrySequence += 1;
  return `${Date.now().toString(36)}-${operationLogEntrySequence.toString(36)}`;
}

function normalizeOperationLogEntry(payload) {
  const message = String(payload?.message || '').trim();
  if (!message) {
    return null;
  }

  const createdAt = String(payload?.createdAt || '').trim() || new Date().toISOString();

  return {
    id: String(payload?.id || buildOperationLogEntryId()),
    createdAt,
    type: payload?.type ? String(payload.type) : null,
    status: payload?.status ? String(payload.status) : null,
    source: payload?.source ? String(payload.source) : null,
    reason: payload?.reason ? String(payload.reason) : null,
    message
  };
}

function readOperationLogHistory() {
  if (Array.isArray(operationLogHistory)) {
    return operationLogHistory;
  }

  if (!store) {
    operationLogHistory = [];
    return operationLogHistory;
  }

  try {
    const rawValue = store.getSetting(OPERATION_LOG_HISTORY_SETTING_KEY);
    if (!rawValue) {
      operationLogHistory = [];
      return operationLogHistory;
    }

    const parsedValue = JSON.parse(rawValue);
    operationLogHistory = Array.isArray(parsedValue)
      ? parsedValue
          .map((entry) => normalizeOperationLogEntry(entry))
          .filter(Boolean)
          .slice(0, OPERATION_LOG_HISTORY_LIMIT)
      : [];
  } catch (error) {
    log.warn('Failed to load operation log history', error);
    operationLogHistory = [];
  }

  return operationLogHistory;
}

function persistOperationLogHistory() {
  if (!store) {
    return;
  }

  try {
    store.setSetting(
      OPERATION_LOG_HISTORY_SETTING_KEY,
      JSON.stringify(readOperationLogHistory().slice(0, OPERATION_LOG_HISTORY_LIMIT))
    );
  } catch (error) {
    log.warn('Failed to persist operation log history', error);
  }
}

function flushOperationLogHistoryPersistence() {
  if (persistOperationLogHistoryTimer) {
    clearTimeout(persistOperationLogHistoryTimer);
    persistOperationLogHistoryTimer = null;
  }
  persistOperationLogHistory();
}

function queueOperationLogHistoryPersistence() {
  if (persistOperationLogHistoryTimer) {
    return;
  }

  persistOperationLogHistoryTimer = setTimeout(() => {
    persistOperationLogHistoryTimer = null;
    persistOperationLogHistory();
  }, OPERATION_LOG_HISTORY_PERSIST_DELAY_MS);
}

function getOperationLogHistory() {
  return readOperationLogHistory().map((entry) => ({ ...entry }));
}

function resetCachedStoreState() {
  flushOperationLogHistoryPersistence();
  operationLogHistory = null;
}

function recordOperationLogEntry(payload) {
  const entry = normalizeOperationLogEntry(payload);
  if (!entry) {
    return null;
  }

  const history = readOperationLogHistory();
  history.unshift(entry);
  if (history.length > OPERATION_LOG_HISTORY_LIMIT) {
    history.length = OPERATION_LOG_HISTORY_LIMIT;
  }
  queueOperationLogHistoryPersistence();
  sendToRenderer('app:operationLogEntry', entry);
  return entry;
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
  sendToUpdaterWindow('updater:state', getUpdaterState());
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
  const entry = recordOperationLogEntry(payload);
  sendToRenderer('app:operationStatus', entry ? { ...payload, ...entry } : payload);
}

function sendTileDownloadState(payload) {
  sendToRenderer('tiles:state', payload);
}

function getStartupDiagnostics() {
  const now = Date.now();
  const toElapsed = (timestamp) => {
    if (!Number.isFinite(timestamp)) {
      return null;
    }

    return Math.max(0, timestamp - startupTimeline.appStartAt);
  };

  const toDuration = (fromTimestamp, toTimestamp) => {
    if (!Number.isFinite(fromTimestamp) || !Number.isFinite(toTimestamp)) {
      return null;
    }

    return Math.max(0, toTimestamp - fromTimestamp);
  };

  const appReadyMs = toElapsed(startupTimeline.appReadyAt);
  const dataStoreReadyMs = toElapsed(startupTimeline.dataStoreReadyAt);
  const mapTileProtocolReadyMs = toElapsed(startupTimeline.mapTileProtocolReadyAt);
  const updaterFlowStartedMs = toElapsed(startupTimeline.updaterFlowStartedAt);
  const updaterFlowFinishedMs = toElapsed(startupTimeline.updaterFlowFinishedAt);
  const windowCreatedMs = toElapsed(startupTimeline.windowCreatedAt);
  const windowShownMs = toElapsed(startupTimeline.windowShownAt);

  return {
    timestamps: {
      ...startupTimeline,
      now
    },
    elapsedMs: {
      appReadyMs,
      dataStoreReadyMs,
      mapTileProtocolReadyMs,
      updaterFlowStartedMs,
      updaterFlowFinishedMs,
      windowCreatedMs,
      windowShownMs,
      updaterFlowDurationMs: toDuration(startupTimeline.updaterFlowStartedAt, startupTimeline.updaterFlowFinishedAt),
      windowCreateToShowMs: toDuration(startupTimeline.windowCreatedAt, startupTimeline.windowShownAt),
      totalToNowMs: Math.max(0, now - startupTimeline.appStartAt)
    }
  };
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

function resolveStartupUpdateFlow(result = { action: 'continue' }) {
  clearStartupUpdateResolutionTimer();
  clearStartupUpdateBlockTimer();
  const resolve = resolveStartupUpdateFlowPromise;
  resolveStartupUpdateFlowPromise = null;
  startupUpdateFlowPromise = null;
  if (resolve) {
    resolve(result);
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
  resolveStartupUpdateFlow({ action: 'continue' });

  return true;
}

function installDownloadedUpdate({ version = null, visible = false, source = currentUpdateCheckSource } = {}) {
  clearStartupUpdateInstallTimer();

  const versionLabel = version ? ` ${version}` : '';
  const skippedStartupInstall = source === 'startup' && startupUpdateSkipped;
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

  if (skippedStartupInstall) {
    const deferredMessage = `Aktualizacja${versionLabel} pobrana. Instalacja po zamknieciu aplikacji lub przyciskiem "Instaluj teraz".`;
    sendUpdateStatus(deferredMessage);
    setUpdaterState({
      phase: 'downloaded',
      message: deferredMessage,
      visible: false,
      canSkip: false,
      readyToInstall: true,
      progressPercent: 100,
      version,
      source
    });
    return;
  }

  startupUpdateInstallTimer = setTimeout(() => {
    startupUpdateInstallTimer = null;

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
    return { action: 'continue', reason: 'updater-disabled' };
  }

  if (startupUpdateFlowPromise) {
    return startupUpdateFlowPromise;
  }

  clearStartupUpdateResolutionTimer();
  clearStartupUpdateInstallTimer();
  clearStartupUpdateBlockTimer();
  startupUpdateSkipped = false;

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
  if (!startupUpdateFlowPromise) {
    return false;
  }

  startupUpdateSkipped = true;
  return releaseStartupUpdateBlock(
    'Pominieto oczekiwanie na aktualizacje. Aplikacja uruchamia sie od razu.',
    {
      phase: 'idle',
      visible: false,
      canSkip: false,
      readyToInstall: false,
      source: 'startup'
    }
  );
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
    force: false
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

function waitFor(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getDevUpdaterPreviewScenario() {
  for (const arg of process.argv) {
    if (arg === DEV_UPDATER_PREVIEW_FLAG) {
      return 'full';
    }

    if (arg.startsWith(DEV_UPDATER_PREVIEW_SCENARIO_PREFIX)) {
      const scenario = arg.slice(DEV_UPDATER_PREVIEW_SCENARIO_PREFIX.length).trim().toLowerCase();
      if (scenario) {
        return scenario;
      }
    }
  }

  return null;
}

function normalizeDevUpdaterPreviewScenario(value) {
  const normalizedValue = String(value || '').trim().toLowerCase();
  if (!normalizedValue) {
    return 'full';
  }

  if (normalizedValue === 'up-to-date' || normalizedValue === 'noupdate') {
    return 'no-update';
  }

  if (normalizedValue === 'offline' || normalizedValue === 'error') {
    return 'offline';
  }

  return normalizedValue;
}

async function runDevUpdaterPreviewFlow(inputScenario = null) {
  const scenario = normalizeDevUpdaterPreviewScenario(inputScenario || getDevUpdaterPreviewScenario());
  if (!isDevMode || !scenario) {
    return false;
  }

  currentUpdateCheckSource = 'dev-preview';

  setUpdaterState({
    phase: 'checking',
    message: 'DEV PREVIEW: sprawdzanie aktualizacji...',
    visible: true,
    canSkip: false,
    readyToInstall: false,
    progressPercent: null,
    version: null,
    source: 'dev-preview',
    announcementAvailable: false,
    announcementVisible: false,
    announcementVersion: null,
    announcementTitle: null,
    announcementMessage: null,
    announcementHasSpecialMessage: false
  });
  await waitFor(900);

  if (scenario === 'no-update') {
    setUpdaterState({
      phase: 'up-to-date',
      message: 'DEV PREVIEW: brak nowych aktualizacji.',
      visible: true,
      canSkip: false,
      readyToInstall: false,
      progressPercent: null,
      version: null,
      source: 'dev-preview'
    });
    await waitFor(650);
    setUpdaterState({
      phase: 'idle',
      message: getDevModeUpdaterMessage(),
      visible: false,
      canSkip: false,
      readyToInstall: false,
      progressPercent: null,
      version: null,
      source: 'dev'
    });
    return true;
  }

  if (scenario === 'offline') {
    setUpdaterState({
      phase: 'error',
      message: 'DEV PREVIEW: brak internetu lub blad aktualizacji.',
      visible: true,
      canSkip: false,
      readyToInstall: false,
      progressPercent: null,
      version: null,
      source: 'dev-preview'
    });
    await waitFor(700);
    setUpdaterState({
      phase: 'idle',
      message: getDevModeUpdaterMessage(),
      visible: false,
      canSkip: false,
      readyToInstall: false,
      progressPercent: null,
      version: null,
      source: 'dev'
    });
    return true;
  }

  const previewVersion = '0.5.99-dev-preview';
  setUpdaterState({
    phase: 'downloading',
    message: `DEV PREVIEW: pobieranie aktualizacji ${previewVersion}: 0.0%`,
    visible: true,
    canSkip: false,
    readyToInstall: false,
    progressPercent: 0,
    version: previewVersion,
    source: 'dev-preview',
    announcementAvailable: true,
    announcementVisible: true,
    announcementVersion: previewVersion,
    announcementTitle: `Nowa wersja ${previewVersion}`,
    announcementMessage: 'To jest podglad procesu aktualizacji uruchomiony flaga CLI.',
    announcementHasSpecialMessage: true
  });

  const sampleProgress = [3.5, 14.2, 27.8, 45.1, 63.4, 79.9, 92.6, 100];
  for (const progressPercent of sampleProgress) {
    setUpdaterState({
      phase: 'downloading',
      message: `DEV PREVIEW: pobieranie aktualizacji ${previewVersion}: ${progressPercent.toFixed(1)}%`,
      visible: true,
      canSkip: false,
      readyToInstall: false,
      progressPercent,
      version: previewVersion,
      source: 'dev-preview'
    });
    await waitFor(260);
  }

  setUpdaterState({
    phase: 'downloaded',
    message: `DEV PREVIEW: aktualizacja ${previewVersion} pobrana.`,
    visible: true,
    canSkip: false,
    readyToInstall: false,
    progressPercent: 100,
    version: previewVersion,
    source: 'dev-preview'
  });
  await waitFor(620);

  setUpdaterState({
    phase: 'installing',
    message: 'DEV PREVIEW: instalowanie aktualizacji i restart aplikacji...',
    visible: true,
    canSkip: false,
    readyToInstall: false,
    progressPercent: 100,
    version: previewVersion,
    source: 'dev-preview'
  });
  await waitFor(780);

  setUpdaterState({
    phase: 'idle',
    message: getDevModeUpdaterMessage(),
    visible: false,
    canSkip: false,
    readyToInstall: false,
    progressPercent: null,
    version: null,
    source: 'dev',
    announcementVisible: false
  });

  return true;
}

async function previewUpdaterSplashInDev(payload = {}) {
  if (!isDevMode) {
    throw new Error('Podglad malego okna aktualizacji jest dostepny tylko w trybie dev.');
  }

  if (devUpdaterPreviewInProgress) {
    return false;
  }

  const scenario = normalizeDevUpdaterPreviewScenario(payload?.scenario || 'full');

  devUpdaterPreviewInProgress = true;
  try {
    createUpdaterWindow();
    await runDevUpdaterPreviewFlow(scenario);
    closeUpdaterWindow();
    return true;
  } finally {
    devUpdaterPreviewInProgress = false;
  }
}

function createWindow() {
  let resolveReady;
  const readyPromise = new Promise((resolve) => {
    resolveReady = resolve;
  });
  const windowState = loadWindowState();

  if (!startupTimeline.windowCreatedAt) {
    startupTimeline.windowCreatedAt = Date.now();
  }

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    title: 'Elrond',
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
    mainWindow.setTitle('Elrond');
  });
  mainWindow.on('resize', queueWindowStatePersist);
  mainWindow.on('move', queueWindowStatePersist);
  mainWindow.on('maximize', queueWindowStatePersist);
  mainWindow.on('unmaximize', queueWindowStatePersist);
  mainWindow.on('close', persistWindowState);
  mainWindow.loadFile(path.join(__dirname, 'map.html'));
  mainWindow.once('ready-to-show', () => {
    if (!startupTimeline.windowShownAt) {
      startupTimeline.windowShownAt = Date.now();
    }
    mainWindow.setTitle(' ');
    mainWindow.show();
    if (windowState.isMaximized) {
      mainWindow.maximize();
    }
    resolveReady();
  });

  return readyPromise;
}

function createUpdaterWindow() {
  if (updaterWindow && !updaterWindow.isDestroyed()) {
    return updaterWindow;
  }

  updaterWindow = new BrowserWindow({
    width: UPDATER_WINDOW_BOUNDS.width,
    height: UPDATER_WINDOW_BOUNDS.height,
    minWidth: UPDATER_WINDOW_BOUNDS.width,
    minHeight: UPDATER_WINDOW_BOUNDS.height,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: 'Aktualizacja aplikacji',
    show: false,
    backgroundColor: '#ebefe6',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'updater-splash-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  updaterWindow.removeMenu();
  updaterWindow.loadFile(path.join(__dirname, 'updater-splash.html'));
  updaterWindow.once('ready-to-show', () => {
    if (updaterWindow && !updaterWindow.isDestroyed()) {
      updaterWindow.show();
      updaterWindow.focus();
      updaterWindow.webContents.send('updater:state', getUpdaterState());
      if (updaterState?.message) {
        updaterWindow.webContents.send('updater:status', updaterState.message);
      }
    }
  });
  updaterWindow.on('closed', () => {
    updaterWindow = null;
  });

  return updaterWindow;
}

function closeUpdaterWindow() {
  if (updaterWindow && !updaterWindow.isDestroyed()) {
    updaterWindow.close();
  }
  updaterWindow = null;
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
    const announcement = getReleaseAnnouncement(info);
    sendUpdateStatus(`Znaleziono aktualizacje: ${info.version}. Trwa pobieranie...`);
    setUpdaterState({
      phase: 'downloading',
      message: `Znaleziono aktualizacje: ${info.version}. Trwa pobieranie...`,
      visible: currentUpdateCheckSource === 'startup' && Boolean(startupUpdateFlowPromise),
      canSkip: currentUpdateCheckSource === 'startup' && Boolean(startupUpdateFlowPromise),
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
      canSkip: false,
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
    resetCachedStoreState();

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
    resetCachedStoreState();
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

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    if (updaterWindow && !updaterWindow.isDestroyed()) {
      if (updaterWindow.isMinimized()) {
        updaterWindow.restore();
      }
      if (!updaterWindow.isVisible()) {
        updaterWindow.show();
      }
      updaterWindow.focus();
      return;
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
      return;
    }

    if (app.isReady()) {
      createWindow();
    }
  });

  app.whenReady().then(async () => {
    if (!startupTimeline.appReadyAt) {
      startupTimeline.appReadyAt = Date.now();
    }

    store = createDataStore(app);
    if (!startupTimeline.dataStoreReadyAt) {
      startupTimeline.dataStoreReadyAt = Date.now();
    }
    resetCachedStoreState();
    mapTileService = createMapTileService({
      app,
      log,
      protocol,
      store,
      sendTileDownloadState,
      sendOperationStatus
    });
    await mapTileService.registerProtocol();
    if (!startupTimeline.mapTileProtocolReadyAt) {
      startupTimeline.mapTileProtocolReadyAt = Date.now();
    }
    const devUpdaterPreviewScenario = getDevUpdaterPreviewScenario();

    if (!isDevMode) {
      configureAutoUpdater();
      createUpdaterWindow();
      startupTimeline.updaterFlowStartedAt = Date.now();
      try {
        await runStartupUpdateFlow();
      } catch (error) {
        log.error('Startup auto-update flow failed', error);
      } finally {
        startupTimeline.updaterFlowFinishedAt = Date.now();
        closeUpdaterWindow();
      }
    } else if (devUpdaterPreviewScenario) {
      createUpdaterWindow();
      startupTimeline.updaterFlowStartedAt = Date.now();
      await runDevUpdaterPreviewFlow();
      startupTimeline.updaterFlowFinishedAt = Date.now();
      closeUpdaterWindow();
    }

    const windowReady = createWindow();
    await windowReady;

    startDevReloadWatcher();

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
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  flushOperationLogHistoryPersistence();
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
  closeUpdaterWindow();
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
  updater: getUpdaterState(),
  operationLogHistory: getOperationLogHistory(),
  startupDiagnostics: getStartupDiagnostics()
}));

ipcMain.handle('app:addOperationLogEntry', async (_event, payload = {}) => recordOperationLogEntry(payload));

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
ipcMain.handle('updater:previewSplash', async (_event, payload = {}) => previewUpdaterSplashInDev(payload));

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
  return skipStartupUpdateFlow();
});

ipcMain.handle('updaterSplash:getState', async () => getUpdaterState());

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

ipcMain.handle('accessbrigeladkfjlakgj:openPerson', async (_event, payload = {}) => {
  const sourceRowId = String(payload?.sourceRowId || '').trim();
  const expectedDbPath = String(store.getSetting('accessDbPath') || '').trim();

  return openPersonInRunningAccessBridge({
    sourceRowId,
    expectedDbPath
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
ipcMain.handle('tiles:getState', async () => mapTileService.refreshOfflineDownloadState());
ipcMain.handle('tiles:saveSettings', async (_event, payload = {}) => mapTileService.saveOfflineDownloadSettings(payload));
ipcMain.handle('tiles:resetSettings', async () => mapTileService.resetOfflineDownloadSettings());
ipcMain.handle('tiles:startDownload', async () => mapTileService.startOfflineDownload());
ipcMain.handle('tiles:startRefreshDownload', async () => mapTileService.startOfflinePackageRefresh({ source: 'manual' }));
ipcMain.handle('tiles:pauseDownload', async () => mapTileService.pauseOfflineDownload());
ipcMain.handle('tiles:deleteOfflinePackage', async () => mapTileService.deleteOfflinePackageTiles());
ipcMain.handle('tiles:deleteExtraTiles', async () => mapTileService.deleteExtraCachedTiles());
ipcMain.handle('tiles:queueViewportPrefetch', async (_event, payload = {}) => mapTileService.queueViewportPrefetch(payload));
ipcMain.handle('tiles:queueHoverPrefetch', async (_event, payload = {}) => mapTileService.queueHoverPrefetch(payload));
ipcMain.handle('data:getTables', () => store.getImportTables());
ipcMain.handle('data:getTableRows', (_event, input) => store.getTableRows(input));
ipcMain.handle('people:list', (_event, input) => store.searchPeople(input));
ipcMain.handle('people:getDetails', (_event, sourceRowId) => store.getPersonDetails(sourceRowId));
ipcMain.handle('people:setBookmark', (_event, payload = {}) => store.setPersonBookmark(payload));
ipcMain.handle('map:getPoints', (_event, input) => store.listMapPoints(input));
ipcMain.handle('map:getDateFilterOptions', () => store.listMapDateFilterOptions());
ipcMain.handle('map:getFilterOptions', () => store.listMapFilterOptions());
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
