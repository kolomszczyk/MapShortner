const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { net, nativeImage } = require('electron');

const TILE_CACHE_VERSION = 'v1';
const TILE_SERVER_URL_TEMPLATE =
  process.env.MAPSHORTNER_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9n6ukAAAAASUVORK5CYII=',
  'base64'
);
const MEMORY_CACHE_LIMIT = 256;
const SPEED_WINDOW_MS = 8000;
const OFFLINE_STATE_FLUSH_INTERVAL_MS = 250;
const PREFETCH_WORKER_COUNT = 1;
const PREFETCH_VIEWPORT_ZOOM_AHEAD = 1;
const PREFETCH_HOVER_ZOOM_AHEAD = 2;
const PREFETCH_HOVER_RADIUS_METERS = 200;
const FOREGROUND_PRIORITY_POLL_MS = 120;
const FOREGROUND_PRIORITY_IDLE_GRACE_MS = 350;
const TILE_FALLBACK_MAX_ZOOM_DELTA = 6;

const OFFLINE_TILE_DEFAULTS = Object.freeze({
  z12RadiusKm: 15,
  z14RadiusKm: 2.5,
  z16RadiusMeters: 800,
  z18RadiusMeters: 100,
  includePolandBase: true,
  includeWorldBase: true,
  autoDownload: true,
  simulateNoInternet: false,
  concurrency: 4
});

const OFFLINE_TILE_ZOOM_SPECS = Object.freeze([
  { zoom: 12, settingKey: 'z12RadiusKm', unit: 'km' },
  { zoom: 14, settingKey: 'z14RadiusKm', unit: 'km' },
  { zoom: 16, settingKey: 'z16RadiusMeters', unit: 'm' },
  { zoom: 18, settingKey: 'z18RadiusMeters', unit: 'm' }
]);

const ESTIMATED_TILE_BYTES_BY_ZOOM = Object.freeze({
  12: 18000,
  14: 26000,
  16: 36000,
  18: 48000
});

const OFFLINE_TILE_METRICS_VERSION = 2;
const MAX_TILE_SERVER_400_ATTEMPTS = 4;
const POLAND_OFFLINE_BOUNDS = Object.freeze({
  south: 49.0,
  west: 14.1,
  north: 54.9,
  east: 24.2
});
const WORLD_OFFLINE_BOUNDS = Object.freeze({
  south: -85.05112878,
  west: -180,
  north: 85.05112878,
  east: 180
});
const TILE_DOWNLOAD_PRESETS = Object.freeze({
  poland: {
    key: 'poland',
    label: 'Polska z5-z10',
    bounds: POLAND_OFFLINE_BOUNDS,
    zooms: [5, 6, 7, 8, 9, 10]
  },
  world: {
    key: 'world',
    label: 'Swiat z2-z5',
    bounds: WORLD_OFFLINE_BOUNDS,
    zooms: [2, 3, 4, 5]
  }
});

function createMapTileService({
  app,
  log,
  protocol,
  store,
  sendTileDownloadState = () => {},
  sendOperationStatus = () => {}
}) {
  const cacheRoot = path.join(app.getPath('userData'), 'map-tiles', TILE_CACHE_VERSION);
  const inFlightDownloads = new Map();
  const memoryCache = new Map();
  const prefetchQueueHigh = [];
  const prefetchQueueLow = [];
  const queuedPrefetchKeys = new Set();
  let protocolRegistered = false;
  let activeDownloadRun = null;
  let lastPersistedState = normalizeOfflineTileState(store?.getOfflineTileDownloadState?.() || {});
  let pendingOfflineStateFlush = null;
  let pendingOfflineStatePatch = null;
  let pendingNetworkSpeedReset = null;
  let lastOfflineStateFlushAt = 0;
  let activeForegroundDownloads = 0;
  let lastForegroundActivityAt = 0;
  const tileNetworkSpeedSamples = [];
  let prefetchWorkersStarted = false;

  async function registerProtocol() {
    if (protocolRegistered) {
      return;
    }

    fs.mkdirSync(cacheRoot, { recursive: true });
    protocol.handle('maptiles', handleTileRequest);
    protocolRegistered = true;
    ensurePrefetchWorkers();

    if (lastPersistedState.phase === 'downloading' || lastPersistedState.phase === 'pausing') {
      updateOfflineState({
        phase: 'idle',
        pauseReason: null,
        speedBps: 0,
        updatedAt: new Date().toISOString(),
        lastError: lastPersistedState.lastError
      }, { force: true });
    }
  }

  async function handleTileRequest(request) {
    const tile = parseTileRequest(request.url);
    if (!tile) {
      return buildTileResponse(TRANSPARENT_PNG, 'image/png', 'no-store');
    }

    try {
      const result = await readOrFetchTile(tile, { priority: 'foreground' });
      return buildTileResponse(result.buffer, result.contentType, 'public, max-age=31536000, immutable');
    } catch (error) {
      const fallback = await readFallbackTile(tile);
      if (fallback) {
        return buildTileResponse(fallback.buffer, fallback.contentType, 'no-store');
      }
      log.warn('Map tile request failed', {
        url: request.url,
        error: error?.message || String(error)
      });
      return buildTileResponse(TRANSPARENT_PNG, 'image/png', 'no-store');
    }
  }

  async function readOrFetchTile(tile, options = {}) {
    const isForeground = options.priority === 'foreground';
    if (isForeground) {
      lastForegroundActivityAt = Date.now();
    }

    try {
      const cachePath = buildCachePath(tile);
      const cached = await readCachedTile(cachePath);
      if (cached) {
        return cached;
      }

      const pendingKey = cachePath;
      if (!inFlightDownloads.has(pendingKey)) {
        if (!isForeground) {
          await waitForForegroundCapacity();
        }
        inFlightDownloads.set(
          pendingKey,
          downloadAndCacheTile(tile, cachePath, options).finally(() => {
            inFlightDownloads.delete(pendingKey);
          })
        );
      }

      return await inFlightDownloads.get(pendingKey);
    } finally {
      if (isForeground) {
        lastForegroundActivityAt = Date.now();
      }
    }
  }

  async function readCachedTile(cachePath) {
    const memoryHit = memoryCache.get(cachePath);
    if (memoryHit) {
      touchMemoryCache(cachePath, memoryHit);
      return memoryHit;
    }

    try {
      const buffer = await fsp.readFile(cachePath);
      const cached = {
        buffer,
        contentType: 'image/png'
      };
      touchMemoryCache(cachePath, cached);
      return cached;
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async function readFallbackTile(tile) {
    const fallbackCandidates = buildFallbackAncestorTiles(tile);
    for (const candidate of fallbackCandidates) {
      const cachedParent = await readCachedTile(buildCachePath(candidate.ancestor));
      if (!cachedParent?.buffer) {
        continue;
      }

      const fallbackBuffer = renderFallbackTileBuffer(cachedParent.buffer, candidate.offsetX, candidate.offsetY, candidate.scale);
      if (!fallbackBuffer) {
        continue;
      }

      return {
        buffer: fallbackBuffer,
        contentType: 'image/png'
      };
    }

    return null;
  }

  async function downloadAndCacheTile(tile, cachePath, options = {}) {
    const remoteUrl = buildRemoteTileUrl(tile);
    const isForeground = options.priority === 'foreground';
    if (isInternetSimulationEnabled()) {
      const offlineError = new Error('Symulacja braku internetu jest wlaczona.');
      offlineError.code = 'SIMULATED_OFFLINE';
      throw offlineError;
    }

    if (isForeground) {
      activeForegroundDownloads += 1;
      lastForegroundActivityAt = Date.now();
    }

    try {
      const response = await net.fetch(remoteUrl, {
        headers: {
          'User-Agent': `MapShortner/${app.getVersion()}`
        }
      });

      if (!response.ok) {
        const error = new Error(`Tile server returned ${response.status} for ${remoteUrl}`);
        error.tileServerStatus = Number(response.status);
        throw error;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await fsp.mkdir(path.dirname(cachePath), { recursive: true });
      await fsp.writeFile(cachePath, buffer);

      const downloaded = {
        buffer,
        contentType: response.headers.get('content-type') || 'image/png'
      };
      touchMemoryCache(cachePath, downloaded);
      pushTileNetworkSpeedSample(buffer.length || 0);
      return downloaded;
    } finally {
      if (isForeground) {
        activeForegroundDownloads = Math.max(0, activeForegroundDownloads - 1);
        lastForegroundActivityAt = Date.now();
      }
    }
  }

  async function saveOfflineDownloadSettings(input = {}) {
    const settings = store.saveOfflineTileSettings(input);
    const skipAutoStart = input.skipAutoStart === true;
    let state = activeDownloadRun
      ? await refreshStoredOfflineMetrics({ settings, preserveRuntimeState: true })
      : await rebuildOfflineDownloadOverview({ settings });

    if (!skipAutoStart && shouldAutoStartOfflineDownload(state, settings)) {
      const started = await startOfflineDownload({ resetServerRejectedTiles: false });
      state = started.state;
    }

    sendOperationStatus({
      type: 'tiles',
      status: 'updated',
      message: activeDownloadRun
        ? 'Zapisano ustawienia map offline i przeliczono zapisane rozmiary dla nowego profilu.'
        : 'Zapisano ustawienia map offline i przeliczono zapisane rozmiary.',
      summary: store.getDashboardSummary()
    });

    return { settings, state };
  }

  async function resetOfflineDownloadSettings() {
    const settings = store.saveOfflineTileSettings({
      ...OFFLINE_TILE_DEFAULTS
    });
    const state = activeDownloadRun
      ? await refreshStoredOfflineMetrics({ settings, preserveRuntimeState: true })
      : await rebuildOfflineDownloadOverview({ settings });

    sendOperationStatus({
      type: 'tiles',
      status: 'updated',
      message: 'Przywrocono domyslne ustawienia pobierania map offline.',
      summary: store.getDashboardSummary()
    });

    return { settings, state };
  }

  async function refreshOfflineDownloadState() {
    const settings = normalizeOfflineTileSettings(store.getOfflineTileSettings());
    let state = activeDownloadRun
      ? (
          shouldRefreshStoredOfflineMetrics(lastPersistedState, settings)
            ? await refreshStoredOfflineMetrics({ settings, preserveRuntimeState: true })
            : getOfflineDownloadState()
        )
      : await rebuildOfflineDownloadOverview({ settings });

    if (shouldAutoStartOfflineDownload(state, settings)) {
      const started = await startOfflineDownload({ resetServerRejectedTiles: false });
      state = started.state;
    }

    return {
      settings,
      state
    };
  }

  async function startOfflineDownload(options = {}) {
    if (activeDownloadRun) {
      return {
        settings: store.getOfflineTileSettings(),
        state: getOfflineDownloadState()
      };
    }

    const settings = normalizeOfflineTileSettings(store.getOfflineTileSettings());
    if (settings.simulateNoInternet) {
      const state = updateOfflineState({
        phase: 'idle',
        speedBps: 0,
        updatedAt: new Date().toISOString(),
        lastError: 'Symulacja braku internetu jest wlaczona.'
      }, { force: true });
      sendOperationStatus({
        type: 'tiles',
        status: 'idle',
        message: 'Pobieranie nie zostalo uruchomione, bo wlaczona jest symulacja braku internetu.',
        summary: store.getDashboardSummary()
      });
      return {
        settings,
        state
      };
    }
    const shouldResetServerRejectedTiles = options.resetServerRejectedTiles !== false;
    const serverRejectedTileAttempts = shouldResetServerRejectedTiles
      ? {}
      : getServerRejectedTileAttempts(lastPersistedState.planSummary);
    const { plan, cacheSummary } = await buildOfflinePlanMetrics(settings, {
      serverRejectedTileAttempts
    });
    return startTileDownloadPlan({
      settings,
      plan,
      cacheSummary,
      serverRejectedTileAttempts,
      startedMessage: 'Rozpoczeto pobieranie wybranych kafelkow mapy offline.',
      completedMessage: 'Wszystkie kafelki z aktualnego profilu sa juz pobrane.'
    });
  }

  async function pauseOfflineDownload() {
    if (!activeDownloadRun) {
      const state = updateOfflineState({
        phase: lastPersistedState.phase === 'completed' ? 'completed' : 'paused',
        pauseReason: lastPersistedState.phase === 'completed' ? null : 'manual',
        speedBps: 0,
        updatedAt: new Date().toISOString()
      }, { force: true });
      return {
        settings: store.getOfflineTileSettings(),
        state
      };
    }

    activeDownloadRun.cancelled = true;
    const state = updateOfflineState({
      phase: 'pausing',
      pauseReason: 'manual',
      speedBps: 0,
      updatedAt: new Date().toISOString()
    }, { force: true });

    sendOperationStatus({
      type: 'tiles',
      status: 'pausing',
      message: 'Zatrzymywanie pobierania kafelkow offline.',
      summary: store.getDashboardSummary()
    });

    return {
      settings: store.getOfflineTileSettings(),
      state
    };
  }

  async function deleteOfflinePackageTiles() {
    if (activeDownloadRun) {
      throw new Error('Zatrzymaj pobieranie offline przed usunieciem paczki.');
    }

    const settings = normalizeOfflineTileSettings(store.getOfflineTileSettings());
    const plan = await buildOfflineDownloadPlan(settings);
    const removed = await deleteTiles(plan.tiles);
    const state = await rebuildOfflineDownloadOverview({ settings });

    sendOperationStatus({
      type: 'tiles',
      status: 'deleted',
      message: removed.tiles > 0
        ? `Usunieto paczke offline: ${removed.tiles} kafelkow (${formatTileBytesLabel(removed.bytes)}).`
        : 'Aktualna paczka offline nie zawierala zapisanych kafelkow do usuniecia.',
      summary: store.getDashboardSummary()
    });

    return {
      settings,
      state,
      removedTiles: removed.tiles,
      removedBytes: removed.bytes
    };
  }

  async function deleteExtraCachedTiles() {
    if (activeDownloadRun) {
      throw new Error('Zatrzymaj pobieranie offline przed usunieciem dodatkowych kafelkow.');
    }

    const settings = normalizeOfflineTileSettings(store.getOfflineTileSettings());
    const plan = await buildOfflineDownloadPlan(settings);
    const planTileKeys = new Set(plan.tiles.map((tile) => buildTileKey(tile)));
    const extraTiles = [];

    scanCachedTileEntries(cacheRoot, (entry) => {
      if (planTileKeys.has(buildTileKey(entry))) {
        return;
      }
      extraTiles.push(entry);
    });

    const removed = await deleteTiles(extraTiles);
    const state = await rebuildOfflineDownloadOverview({ settings });

    sendOperationStatus({
      type: 'tiles',
      status: 'deleted',
      message: removed.tiles > 0
        ? `Usunieto dodatkowe kafelki: ${removed.tiles} (${formatTileBytesLabel(removed.bytes)}).`
        : 'Brak dodatkowych kafelkow poza aktualnym planem offline.',
      summary: store.getDashboardSummary()
    });

    return {
      settings,
      state,
      removedTiles: removed.tiles,
      removedBytes: removed.bytes
    };
  }

  function getOfflineDownloadState() {
    return normalizeOfflineTileState(lastPersistedState);
  }

  function isInternetSimulationEnabled() {
    const settings = store?.getOfflineTileSettings?.();
    return normalizeOfflineTileSettings(settings).simulateNoInternet === true;
  }

  async function deleteTiles(tilesOrEntries = []) {
    const removedTileKeys = new Set();
    let removedTiles = 0;
    let removedBytes = 0;

    for (const item of tilesOrEntries) {
      const tile = item?.z != null && item?.x != null && item?.y != null
        ? { z: item.z, x: item.x, y: item.y }
        : null;
      if (!tile) {
        continue;
      }

      const cachePath = item?.path || buildCachePath(tile);
      try {
        const stat = await fsp.stat(cachePath);
        if (!stat.isFile()) {
          continue;
        }

        await fsp.unlink(cachePath);
        removedTiles += 1;
        removedBytes += Number(stat.size || 0);
        removedTileKeys.add(buildTileKey(tile));
        memoryCache.delete(cachePath);
        await removeEmptyTileDirectories(path.dirname(cachePath));
      } catch (error) {
        if (error?.code === 'ENOENT') {
          continue;
        }
        throw error;
      }
    }

    if (removedTileKeys.size > 0) {
      purgeQueuedPrefetchTiles(removedTileKeys);
    }

    return {
      tiles: removedTiles,
      bytes: removedBytes
    };
  }

  async function removeEmptyTileDirectories(startDirectory) {
    let currentDirectory = startDirectory;
    while (currentDirectory && currentDirectory.startsWith(cacheRoot) && currentDirectory !== cacheRoot) {
      try {
        const entries = await fsp.readdir(currentDirectory);
        if (entries.length > 0) {
          return;
        }
        await fsp.rmdir(currentDirectory);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          return;
        }
        if (error?.code === 'ENOTEMPTY') {
          return;
        }
        throw error;
      }
      currentDirectory = path.dirname(currentDirectory);
    }
  }

  function purgeQueuedPrefetchTiles(tileKeys) {
    if (!(tileKeys instanceof Set) || tileKeys.size === 0) {
      return;
    }

    removeQueuedPrefetchTiles(prefetchQueueHigh, tileKeys);
    removeQueuedPrefetchTiles(prefetchQueueLow, tileKeys);

    for (const tileKey of tileKeys) {
      queuedPrefetchKeys.delete(tileKey);
    }
  }

  function removeQueuedPrefetchTiles(queue, tileKeys) {
    if (!Array.isArray(queue) || queue.length === 0) {
      return;
    }

    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const tileKey = buildTileKey(queue[index]?.tile || {});
      if (tileKeys.has(tileKey)) {
        queue.splice(index, 1);
      }
    }
  }

  function buildRemoteTileUrl(tile) {
    return TILE_SERVER_URL_TEMPLATE.replace('{z}', String(tile.z))
      .replace('{x}', String(tile.x))
      .replace('{y}', String(tile.y));
  }

  function buildCachePath(tile) {
    return path.join(cacheRoot, String(tile.z), String(tile.x), `${tile.y}.png`);
  }

  function parseTileRequest(urlString) {
    const url = new URL(urlString);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 3) {
      return null;
    }

    const z = Number.parseInt(segments[0], 10);
    const x = Number.parseInt(segments[1], 10);
    const y = Number.parseInt(segments[2].replace(/\.png$/i, ''), 10);

    if (![z, x, y].every(Number.isInteger) || z < 0 || x < 0 || y < 0) {
      return null;
    }

    return { z, x, y };
  }

  function buildTileResponse(buffer, contentType = 'image/png', cacheControl = 'no-store') {
    return new Response(buffer, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': cacheControl
      }
    });
  }

  function touchMemoryCache(key, entry) {
    if (memoryCache.has(key)) {
      memoryCache.delete(key);
    }
    memoryCache.set(key, entry);

    if (memoryCache.size <= MEMORY_CACHE_LIMIT) {
      return;
    }

    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) {
      memoryCache.delete(oldestKey);
    }
  }

  async function rebuildOfflineDownloadOverview(options = {}) {
    const settings = normalizeOfflineTileSettings(options.settings || store.getOfflineTileSettings());
    const previousState = store.getOfflineTileDownloadState();
    const serverRejectedTileAttempts = getServerRejectedTileAttempts(previousState.planSummary);
    const { plan, cacheSummary } = await buildOfflinePlanMetrics(settings, {
      serverRejectedTileAttempts
    });
    const { cachedTiles } = cacheSummary;

    const phase = plan.tiles.length > 0 && cachedTiles >= plan.tiles.length
      ? 'completed'
      : (previousState.phase === 'paused' ? 'paused' : 'idle');
    const completedAt = phase === 'completed' ? (previousState.completedAt || new Date().toISOString()) : null;

    return updateOfflineState({
      phase,
      pauseReason: phase === 'paused' ? previousState.pauseReason : null,
      totalTiles: plan.tiles.length,
      downloadedTiles: cachedTiles,
      failedTiles: phase === 'completed' ? 0 : previousState.failedTiles,
      bytesDownloaded: previousState.bytesDownloaded,
      speedBps: 0,
      startedAt: previousState.startedAt,
      updatedAt: new Date().toISOString(),
      completedAt,
      lastError: phase === 'completed' ? null : previousState.lastError,
      planSummary: buildPersistedPlanSummary(plan.summary, cacheSummary, settings, {
        serverRejectedTileAttempts
      })
    }, { force: true });
  }

  async function refreshStoredOfflineMetrics(options = {}) {
    const settings = normalizeOfflineTileSettings(options.settings || store.getOfflineTileSettings());
    const preserveRuntimeState = options.preserveRuntimeState === true;
    const previousState = getOfflineDownloadState();
    const serverRejectedTileAttempts = getServerRejectedTileAttempts(previousState.planSummary);
    const { plan, cacheSummary } = await buildOfflinePlanMetrics(settings, {
      serverRejectedTileAttempts
    });
    const cachedTiles = preserveRuntimeState
      ? previousState.downloadedTiles
      : cacheSummary.cachedTiles;
    const totalTiles = preserveRuntimeState
      ? previousState.totalTiles
      : plan.tiles.length;

    return updateOfflineState({
      phase: previousState.phase,
      pauseReason: previousState.phase === 'paused' ? previousState.pauseReason : null,
      totalTiles,
      downloadedTiles: cachedTiles,
      failedTiles: previousState.failedTiles,
      bytesDownloaded: previousState.bytesDownloaded,
      speedBps: previousState.phase === 'downloading' || previousState.phase === 'pausing'
        ? previousState.speedBps
        : 0,
      startedAt: previousState.startedAt,
      updatedAt: new Date().toISOString(),
      completedAt: previousState.completedAt,
      lastError: previousState.lastError,
      planSummary: buildPersistedPlanSummary(plan.summary, cacheSummary, settings, {
        serverRejectedTileAttempts
      })
    }, { force: true });
  }

  async function buildOfflineDownloadPlan(settings) {
    const mapData = store.listMapPoints({});
    const uniquePoints = deduplicatePoints(mapData.people || []);
    const tileKeySet = new Set();
    const countsByZoom = {};
    const planNameParts = [];

    for (const spec of OFFLINE_TILE_ZOOM_SPECS) {
      const distanceValue = Number(settings[spec.settingKey] || 0);
      if (!Number.isFinite(distanceValue) || distanceValue <= 0) {
        countsByZoom[spec.zoom] = 0;
        continue;
      }

      const halfSideKm = spec.unit === 'm' ? distanceValue / 1000 : distanceValue;
      addSquareTilesForPoints(tileKeySet, uniquePoints, spec.zoom, halfSideKm);
      countsByZoom[spec.zoom] = countTilesForZoom(tileKeySet, spec.zoom);
    }

    if (uniquePoints.length > 0) {
      planNameParts.push('Profil punktow');
    }

    if (settings.includePolandBase) {
      addPresetTilesToPlan(tileKeySet, countsByZoom, TILE_DOWNLOAD_PRESETS.poland);
      planNameParts.push(TILE_DOWNLOAD_PRESETS.poland.label);
    }

    if (settings.includeWorldBase) {
      addPresetTilesToPlan(tileKeySet, countsByZoom, TILE_DOWNLOAD_PRESETS.world);
      planNameParts.push(TILE_DOWNLOAD_PRESETS.world.label);
    }

    const tiles = Array.from(tileKeySet)
      .map(parseTileKey)
      .sort(compareTiles);

    return {
      tiles,
      summary: {
        pointsCount: uniquePoints.length,
        countsByZoom,
        settings,
        planMode: 'profile',
        planName: planNameParts.join(' + ') || 'Profil pusty'
      }
    };
  }

  async function buildOfflinePlanMetrics(settings, options = {}) {
    const plan = await buildOfflineDownloadPlan(settings);
    const cacheSummary = inspectOfflinePlanCache(
      plan.tiles,
      plan.summary?.countsByZoom,
      getBlockedTileKeySet(options.serverRejectedTileAttempts)
    );
    return { plan, cacheSummary };
  }

  function startTileDownloadPlan({
    settings,
    plan,
    cacheSummary,
    serverRejectedTileAttempts,
    startedMessage,
    completedMessage
  }) {
    const { missingTiles, cachedTiles, blockedTilesCount } = cacheSummary;
    const startedAt = new Date().toISOString();
    const initialState = updateOfflineState({
      phase: missingTiles.length > 0 ? 'downloading' : (blockedTilesCount > 0 ? 'idle' : 'completed'),
      pauseReason: null,
      totalTiles: plan.tiles.length,
      downloadedTiles: cachedTiles,
      failedTiles: 0,
      bytesDownloaded: 0,
      speedBps: 0,
      startedAt,
      updatedAt: startedAt,
      completedAt: missingTiles.length > 0 || blockedTilesCount > 0 ? null : startedAt,
      lastError: null,
      planSummary: buildPersistedPlanSummary(plan.summary, cacheSummary, settings, {
        serverRejectedTileAttempts
      })
    }, { force: true });

    sendOperationStatus({
      type: 'tiles',
      status: missingTiles.length > 0 ? 'started' : (blockedTilesCount > 0 ? 'idle' : 'completed'),
      message: missingTiles.length > 0
        ? startedMessage
        : (blockedTilesCount > 0
          ? 'Czesc kafelkow jest tymczasowo pomijana po 4 bledach serwera. Kliknij Pobieraj, aby sprobowac ponownie.'
          : completedMessage),
      summary: store.getDashboardSummary()
    });

    if (missingTiles.length === 0) {
      return {
        settings,
        state: initialState
      };
    }

    const run = {
      cancelled: false,
      settings,
      queue: missingTiles,
      speedSamples: [],
      downloadedTiles: cachedTiles,
      failedTiles: 0,
      bytesDownloaded: 0,
      actualPackageBytes: cacheSummary.actualPackageBytes,
      extraCachedBytes: cacheSummary.extraCachedBytes,
      totalCachedBytes: cacheSummary.totalCachedBytes,
      serverRejectedTileAttempts: { ...serverRejectedTileAttempts },
      planTileKeys: new Set(plan.tiles.map((tile) => buildTileKey(tile)))
    };

    activeDownloadRun = run;
    const workerCount = Math.min(settings.concurrency, Math.max(1, missingTiles.length));
    const workers = Array.from({ length: workerCount }, () => runDownloadWorker(run, plan.tiles.length));

    Promise.all(workers)
      .then(() => finalizeOfflineDownloadRun(run, plan.tiles.length))
      .catch((error) => finalizeOfflineDownloadRun(run, plan.tiles.length, error));

    return {
      settings,
      state: getOfflineDownloadState()
    };
  }

  async function runDownloadWorker(run, totalTiles) {
    while (!run.cancelled) {
      const tile = run.queue.shift();
      if (!tile) {
        return;
      }

      try {
        const cachePath = buildCachePath(tile);
        const cached = await readCachedTile(cachePath);
        if (cached) {
          clearServerRejectedTileAttempt(run.serverRejectedTileAttempts, tile);
          await purgeCoveredExtraTilesForOfflineTile(tile, run);
          run.actualPackageBytes += cached.buffer.length || 0;
          run.totalCachedBytes += cached.buffer.length || 0;
          run.downloadedTiles += 1;
          pushOfflineProgress(run, totalTiles, 0);
          continue;
        }

        const downloaded = await readOrFetchTile(tile, { priority: 'background' });
        const downloadedBytes = downloaded?.buffer?.length || 0;
        clearServerRejectedTileAttempt(run.serverRejectedTileAttempts, tile);
        await purgeCoveredExtraTilesForOfflineTile(tile, run);
        run.downloadedTiles += 1;
        run.bytesDownloaded += downloadedBytes;
        run.actualPackageBytes += downloadedBytes;
        run.totalCachedBytes += downloadedBytes;
        pushOfflineProgress(run, totalTiles, downloadedBytes);
      } catch (error) {
        if (isServerRejected400Error(error)) {
          recordServerRejectedTileAttempt(run.serverRejectedTileAttempts, tile);
        }
        run.failedTiles += 1;
        updateOfflineState({
          phase: 'downloading',
          totalTiles,
          downloadedTiles: run.downloadedTiles,
          failedTiles: run.failedTiles,
          bytesDownloaded: run.bytesDownloaded,
          speedBps: getCurrentTileNetworkSpeedBps(),
          updatedAt: new Date().toISOString(),
          lastError: error.message,
          planSummary: buildRuntimePlanSummary(run)
        });
      }
    }
  }

  function pushOfflineProgress(run, totalTiles, downloadedBytes) {
    const now = Date.now();
    if (downloadedBytes > 0) {
      run.speedSamples.push({
        at: now,
        bytes: downloadedBytes
      });
    }
    while (run.speedSamples.length > 0 && now - run.speedSamples[0].at > SPEED_WINDOW_MS) {
      run.speedSamples.shift();
    }

    updateOfflineState({
      phase: 'downloading',
      totalTiles,
      downloadedTiles: run.downloadedTiles,
      failedTiles: run.failedTiles,
      bytesDownloaded: run.bytesDownloaded,
      speedBps: getCurrentTileNetworkSpeedBps(),
      updatedAt: new Date().toISOString(),
      lastError: null,
      planSummary: buildRuntimePlanSummary(run)
    });
  }

  async function purgeCoveredExtraTilesForOfflineTile(tile, run) {
    if (!tile || !(run?.planTileKeys instanceof Set)) {
      return;
    }

    const removed = await deleteTiles(buildCoveredExtraAncestorTiles(tile, run.planTileKeys));
    if (removed.bytes <= 0) {
      return;
    }

    run.extraCachedBytes = Math.max(0, run.extraCachedBytes - removed.bytes);
    run.totalCachedBytes = Math.max(0, run.totalCachedBytes - removed.bytes);
  }

  function finalizeOfflineDownloadRun(run, totalTiles, error = null) {
    if (activeDownloadRun !== run) {
      return;
    }

    activeDownloadRun = null;
    const completedAt = new Date().toISOString();
    const blockedTilesCount = countBlockedTilesForPlan(run.serverRejectedTileAttempts, run.planTileKeys);
    const phase = error
      ? 'error'
      : (run.cancelled ? 'paused' : (blockedTilesCount > 0 && run.downloadedTiles < totalTiles ? 'idle' : 'completed'));
    const nextState = updateOfflineState({
      phase,
      pauseReason: phase === 'paused' ? 'manual' : null,
      totalTiles,
      downloadedTiles: run.downloadedTiles,
      failedTiles: run.failedTiles,
      bytesDownloaded: run.bytesDownloaded,
      speedBps: 0,
      updatedAt: completedAt,
      completedAt: phase === 'completed' ? completedAt : lastPersistedState.completedAt,
      lastError: error ? error.message : lastPersistedState.lastError,
      planSummary: buildRuntimePlanSummary(run)
    }, { force: true });

    if (error) {
      log.error('Offline tile download failed', error);
      sendOperationStatus({
        type: 'tiles',
        status: 'failed',
        message: `Pobieranie kafelkow offline nie powiodlo sie: ${error.message}`,
        error: error.message,
        summary: store.getDashboardSummary()
      });
      return nextState;
    }

    sendOperationStatus({
      type: 'tiles',
      status: phase,
      message: phase === 'completed'
        ? 'Pobieranie kafelkow offline zakonczone.'
        : (phase === 'idle'
          ? 'Czesc kafelkow pomieto po 4 bledach 400 z serwera. Kliknij Pobieraj, aby sprobowac je ponownie.'
          : 'Pobieranie kafelkow offline zatrzymane.'),
      summary: store.getDashboardSummary()
    });

    return nextState;
  }

  function updateOfflineState(patch, options = {}) {
    lastPersistedState = normalizeOfflineTileState({
      ...lastPersistedState,
      ...patch
    });
    pendingOfflineStatePatch = lastPersistedState;

    const shouldForce = options.force === true
      || (lastPersistedState.phase !== 'downloading' && lastPersistedState.phase !== 'pausing');
    const now = Date.now();

    if (shouldForce || now - lastOfflineStateFlushAt >= OFFLINE_STATE_FLUSH_INTERVAL_MS) {
      flushOfflineState();
      return lastPersistedState;
    }

    if (!pendingOfflineStateFlush) {
      pendingOfflineStateFlush = setTimeout(() => {
        pendingOfflineStateFlush = null;
        flushOfflineState();
      }, OFFLINE_STATE_FLUSH_INTERVAL_MS);
    }

    return lastPersistedState;
  }

  function pushTileNetworkSpeedSample(bytes) {
    const sampleBytes = Math.max(0, Number(bytes || 0));
    if (sampleBytes <= 0) {
      return;
    }

    const now = Date.now();
    tileNetworkSpeedSamples.push({
      at: now,
      bytes: sampleBytes
    });
    trimTileNetworkSpeedSamples(now);

    updateOfflineState({
      speedBps: getCurrentTileNetworkSpeedBps(),
      updatedAt: new Date().toISOString()
    });

    scheduleTileNetworkSpeedReset();
  }

  function trimTileNetworkSpeedSamples(now = Date.now()) {
    while (tileNetworkSpeedSamples.length > 0 && now - tileNetworkSpeedSamples[0].at > SPEED_WINDOW_MS) {
      tileNetworkSpeedSamples.shift();
    }
  }

  function getCurrentTileNetworkSpeedBps() {
    trimTileNetworkSpeedSamples(Date.now());
    return calculateSpeedBps(tileNetworkSpeedSamples);
  }

  function scheduleTileNetworkSpeedReset() {
    if (pendingNetworkSpeedReset) {
      clearTimeout(pendingNetworkSpeedReset);
    }

    pendingNetworkSpeedReset = setTimeout(() => {
      pendingNetworkSpeedReset = null;
      trimTileNetworkSpeedSamples(Date.now());
      if (tileNetworkSpeedSamples.length > 0) {
        scheduleTileNetworkSpeedReset();
        return;
      }

      updateOfflineState({
        speedBps: 0,
        updatedAt: new Date().toISOString()
      });
    }, SPEED_WINDOW_MS + 50);
  }

  function flushOfflineState() {
    if (!pendingOfflineStatePatch) {
      return;
    }

    lastOfflineStateFlushAt = Date.now();
    const persistedState = store.saveOfflineTileDownloadState(pendingOfflineStatePatch);
    pendingOfflineStatePatch = null;
    lastPersistedState = normalizeOfflineTileState(persistedState);
    sendTileDownloadState({
      settings: store.getOfflineTileSettings(),
      state: lastPersistedState
    });
  }

  function ensurePrefetchWorkers() {
    if (prefetchWorkersStarted) {
      return;
    }

    prefetchWorkersStarted = true;
    for (let index = 0; index < PREFETCH_WORKER_COUNT; index += 1) {
      void runPrefetchWorker();
    }
  }

  async function runPrefetchWorker() {
    while (true) {
      const job = takeNextPrefetchJob();
      if (!job) {
        await delay(FOREGROUND_PRIORITY_POLL_MS);
        continue;
      }

      queuedPrefetchKeys.delete(buildTileKey(job.tile));

      try {
        if (fs.existsSync(buildCachePath(job.tile))) {
          continue;
        }

        await readOrFetchTile(job.tile, { priority: 'background' });
      } catch (_error) {
        // Ignore prefetch failures; interactive fetching can retry on demand later.
      }
    }
  }

  function takeNextPrefetchJob() {
    return prefetchQueueHigh.shift() || prefetchQueueLow.shift() || null;
  }

  async function queueViewportPrefetch(input = {}) {
    const bounds = normalizeBoundsInput(input.bounds);
    const currentZoom = Number(input.currentZoom);
    if (!bounds || !Number.isFinite(currentZoom)) {
      return false;
    }

    const targetZoom = Math.min(18, Math.max(0, Math.ceil(currentZoom) + PREFETCH_VIEWPORT_ZOOM_AHEAD));
    const tiles = buildTilesForBounds(bounds, targetZoom);
    enqueuePrefetchTiles(tiles, 'high');
    return true;
  }

  async function queueHoverPrefetch(input = {}) {
    const lat = Number(input.lat);
    const lng = Number(input.lng);
    const currentZoom = Number(input.currentZoom);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(currentZoom)) {
      return false;
    }

    const targetZoom = Math.min(18, Math.max(0, Math.ceil(currentZoom) + PREFETCH_HOVER_ZOOM_AHEAD));
    const halfSideKm = PREFETCH_HOVER_RADIUS_METERS / 1000;
    const tiles = buildTilesForSquare({ lat, lng }, targetZoom, halfSideKm);
    enqueuePrefetchTiles(tiles, 'low');
    return true;
  }

  function enqueuePrefetchTiles(tiles, priority = 'low') {
    if (!Array.isArray(tiles) || tiles.length === 0) {
      return;
    }

    const targetQueue = priority === 'high' ? prefetchQueueHigh : prefetchQueueLow;
    for (const tile of tiles) {
      const tileKey = buildTileKey(tile);
      if (queuedPrefetchKeys.has(tileKey) || fs.existsSync(buildCachePath(tile))) {
        continue;
      }
      queuedPrefetchKeys.add(tileKey);
      targetQueue.push({ tile });
    }
  }

  async function waitForForegroundCapacity() {
    while (
      activeForegroundDownloads > 0
      || (lastForegroundActivityAt > 0 && (Date.now() - lastForegroundActivityAt) < FOREGROUND_PRIORITY_IDLE_GRACE_MS)
    ) {
      await delay(FOREGROUND_PRIORITY_POLL_MS);
    }
  }

  function inspectOfflinePlanCache(tiles, countsByZoom = {}, blockedTileKeys = new Set()) {
    const missingTiles = [];
    let cachedTiles = 0;
    let actualPackageBytes = 0;
    const cachedCountsByZoom = {};
    const cachedBytesByZoom = {};
    const planTileKeys = new Set();
    let blockedTilesCount = 0;

    for (const tile of tiles) {
      const tileKey = buildTileKey(tile);
      planTileKeys.add(tileKey);
      const cachePath = buildCachePath(tile);
      if (!fs.existsSync(cachePath)) {
        if (blockedTileKeys.has(tileKey)) {
          blockedTilesCount += 1;
        } else {
          missingTiles.push(tile);
        }
        continue;
      }

      cachedTiles += 1;
      const tileSize = readCachedTileSize(cachePath);
      actualPackageBytes += tileSize;
      cachedCountsByZoom[tile.z] = (cachedCountsByZoom[tile.z] || 0) + 1;
      cachedBytesByZoom[tile.z] = (cachedBytesByZoom[tile.z] || 0) + tileSize;
    }

    let estimatedTotalBytes = 0;
    let estimatedRemainingBytes = 0;
    for (const [zoomKey, totalCountValue] of Object.entries(countsByZoom || {})) {
      const zoom = Number.parseInt(zoomKey, 10);
      const totalCount = Math.max(0, Number(totalCountValue || 0));
      if (!Number.isFinite(zoom) || totalCount <= 0) {
        continue;
      }

      const cachedCount = cachedCountsByZoom[zoom] || 0;
      const cachedBytes = cachedBytesByZoom[zoom] || 0;
      const missingCount = Math.max(0, totalCount - cachedCount);
      const estimatedTileBytes = resolveEstimatedTileBytes(zoom, cachedCount, cachedBytes);

      estimatedTotalBytes += cachedBytes + (missingCount * estimatedTileBytes);
      estimatedRemainingBytes += missingCount * estimatedTileBytes;
    }

    let extraCachedBytes = 0;
    scanCachedTileEntries(cacheRoot, (entry) => {
      if (planTileKeys.has(buildTileKey(entry))) {
        return;
      }
      extraCachedBytes += entry.size;
    });

    const totalCachedBytes = actualPackageBytes + extraCachedBytes;

    return {
      missingTiles,
      cachedTiles,
      blockedTilesCount,
      estimatedTotalBytes: Math.round(estimatedTotalBytes),
      estimatedRemainingBytes: Math.round(estimatedRemainingBytes),
      actualPackageBytes: Math.round(actualPackageBytes),
      extraCachedBytes: Math.round(extraCachedBytes),
      totalCachedBytes: Math.round(totalCachedBytes)
    };
  }

  function buildPersistedPlanSummary(planSummary, cacheSummary, settings, options = {}) {
    return {
      ...(planSummary || {}),
      estimatedTotalBytes: cacheSummary.estimatedTotalBytes,
      estimatedRemainingBytes: cacheSummary.estimatedRemainingBytes,
      actualPackageBytes: cacheSummary.actualPackageBytes,
      extraCachedBytes: cacheSummary.extraCachedBytes,
      totalCachedBytes: cacheSummary.totalCachedBytes,
      blockedTilesCount: Math.max(0, Number(cacheSummary.blockedTilesCount || 0)),
      serverRejectedTileAttempts: getServerRejectedTileAttempts(options.serverRejectedTileAttempts),
      metricsVersion: OFFLINE_TILE_METRICS_VERSION,
      settingsFingerprint: buildOfflineTileSettingsFingerprint(settings)
    };
  }

  function buildRuntimePlanSummary(run) {
    return {
      ...(lastPersistedState.planSummary || {}),
      actualPackageBytes: run.actualPackageBytes,
      extraCachedBytes: run.extraCachedBytes,
      totalCachedBytes: run.totalCachedBytes,
      blockedTilesCount: countBlockedTilesForPlan(run.serverRejectedTileAttempts, run.planTileKeys),
      serverRejectedTileAttempts: getServerRejectedTileAttempts(run.serverRejectedTileAttempts)
    };
  }

  return {
    registerProtocol,
    getOfflineDownloadState,
    refreshOfflineDownloadState,
    saveOfflineDownloadSettings,
    resetOfflineDownloadSettings,
    startOfflineDownload,
    pauseOfflineDownload,
    deleteOfflinePackageTiles,
    deleteExtraCachedTiles,
    queueViewportPrefetch,
    queueHoverPrefetch
  };
}

function normalizeOfflineTileSettings(input = {}) {
  const z12RadiusKm = Number(input.z12RadiusKm);
  const z14RadiusKm = Number(input.z14RadiusKm);
  const z16RadiusMeters = Number(input.z16RadiusMeters);
  const z18RadiusMeters = Number(input.z18RadiusMeters);
  const concurrency = Number(input.concurrency);

  return {
    z12RadiusKm: Number.isFinite(z12RadiusKm) ? Math.max(0, z12RadiusKm) : OFFLINE_TILE_DEFAULTS.z12RadiusKm,
    z14RadiusKm: Number.isFinite(z14RadiusKm) ? Math.max(0, z14RadiusKm) : OFFLINE_TILE_DEFAULTS.z14RadiusKm,
    z16RadiusMeters: Number.isFinite(z16RadiusMeters)
      ? Math.max(0, z16RadiusMeters)
      : OFFLINE_TILE_DEFAULTS.z16RadiusMeters,
    z18RadiusMeters: Number.isFinite(z18RadiusMeters)
      ? Math.max(0, z18RadiusMeters)
      : OFFLINE_TILE_DEFAULTS.z18RadiusMeters,
    includePolandBase: normalizeOfflineTileBoolean(input.includePolandBase, OFFLINE_TILE_DEFAULTS.includePolandBase),
    includeWorldBase: normalizeOfflineTileBoolean(input.includeWorldBase, OFFLINE_TILE_DEFAULTS.includeWorldBase),
    autoDownload: normalizeOfflineTileBoolean(input.autoDownload, OFFLINE_TILE_DEFAULTS.autoDownload),
    simulateNoInternet: normalizeOfflineTileBoolean(
      input.simulateNoInternet,
      OFFLINE_TILE_DEFAULTS.simulateNoInternet
    ),
    concurrency: Number.isFinite(concurrency)
      ? Math.min(12, Math.max(1, Math.round(concurrency)))
      : OFFLINE_TILE_DEFAULTS.concurrency
  };
}

function normalizeOfflineTileBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback === true;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  return value === true;
}

function normalizeOfflineTileState(input = {}) {
  return {
    phase: String(input.phase || 'idle'),
    pauseReason: input.pauseReason || null,
    totalTiles: Math.max(0, Number(input.totalTiles || 0)),
    downloadedTiles: Math.max(0, Number(input.downloadedTiles || 0)),
    failedTiles: Math.max(0, Number(input.failedTiles || 0)),
    bytesDownloaded: Math.max(0, Number(input.bytesDownloaded || 0)),
    speedBps: Math.max(0, Number(input.speedBps || 0)),
    startedAt: input.startedAt || null,
    updatedAt: input.updatedAt || null,
    completedAt: input.completedAt || null,
    lastError: input.lastError || null,
    planSummary: input.planSummary && typeof input.planSummary === 'object' ? input.planSummary : null
  };
}

function shouldRefreshStoredOfflineMetrics(state, settings) {
  const planSummary = state?.planSummary;
  if (!planSummary || typeof planSummary !== 'object') {
    return true;
  }

  if (Number(planSummary.metricsVersion || 0) !== OFFLINE_TILE_METRICS_VERSION) {
    return true;
  }

  if (planSummary.settingsFingerprint !== buildOfflineTileSettingsFingerprint(settings)) {
    return true;
  }

  const requiredNumericKeys = [
    'estimatedTotalBytes',
    'estimatedRemainingBytes',
    'actualPackageBytes',
    'extraCachedBytes',
    'totalCachedBytes'
  ];

  return requiredNumericKeys.some((key) => !Number.isFinite(Number(planSummary[key])));
}

function buildOfflineTileSettingsFingerprint(settings = {}) {
  return JSON.stringify({
    z12RadiusKm: Number(settings.z12RadiusKm || 0),
    z14RadiusKm: Number(settings.z14RadiusKm || 0),
    z16RadiusMeters: Number(settings.z16RadiusMeters || 0),
    z18RadiusMeters: Number(settings.z18RadiusMeters || 0),
    includePolandBase: settings.includePolandBase === true,
    includeWorldBase: settings.includeWorldBase === true,
    autoDownload: settings.autoDownload !== false,
    simulateNoInternet: settings.simulateNoInternet === true,
    concurrency: Number(settings.concurrency || 0)
  });
}

function shouldAutoStartOfflineDownload(state, settings) {
  if (settings?.autoDownload !== true) {
    return false;
  }

  if (settings?.simulateNoInternet === true) {
    return false;
  }

  if (!state || typeof state !== 'object') {
    return true;
  }

  if (state.phase === 'downloading' || state.phase === 'pausing') {
    return false;
  }

  if (state.phase === 'paused' && state.pauseReason === 'manual') {
    return false;
  }

  const totalTiles = Math.max(0, Number(state.totalTiles || 0));
  const downloadedTiles = Math.max(0, Number(state.downloadedTiles || 0));
  const blockedTilesCount = Math.max(0, Number(state.planSummary?.blockedTilesCount || 0));
  return totalTiles > 0 && (downloadedTiles + blockedTilesCount) < totalTiles;
}

function getServerRejectedTileAttempts(planSummaryOrAttempts = null) {
  const source = planSummaryOrAttempts?.serverRejectedTileAttempts
    && typeof planSummaryOrAttempts.serverRejectedTileAttempts === 'object'
    ? planSummaryOrAttempts.serverRejectedTileAttempts
    : planSummaryOrAttempts;

  if (!source || typeof source !== 'object') {
    return {};
  }

  const normalized = {};
  Object.entries(source).forEach(([tileKey, attempts]) => {
    const normalizedAttempts = Math.min(
      MAX_TILE_SERVER_400_ATTEMPTS,
      Math.max(0, Math.round(Number(attempts || 0)))
    );
    if (normalizedAttempts > 0) {
      normalized[String(tileKey)] = normalizedAttempts;
    }
  });
  return normalized;
}

function getBlockedTileKeySet(serverRejectedTileAttempts = {}) {
  const blockedTileKeys = new Set();
  Object.entries(getServerRejectedTileAttempts(serverRejectedTileAttempts)).forEach(([tileKey, attempts]) => {
    if (attempts >= MAX_TILE_SERVER_400_ATTEMPTS) {
      blockedTileKeys.add(tileKey);
    }
  });
  return blockedTileKeys;
}

function countBlockedTilesForPlan(serverRejectedTileAttempts = {}, planTileKeys = new Set()) {
  if (!(planTileKeys instanceof Set) || planTileKeys.size === 0) {
    return 0;
  }

  let blockedTilesCount = 0;
  const blockedTileKeys = getBlockedTileKeySet(serverRejectedTileAttempts);
  planTileKeys.forEach((tileKey) => {
    if (blockedTileKeys.has(tileKey)) {
      blockedTilesCount += 1;
    }
  });
  return blockedTilesCount;
}

function clearServerRejectedTileAttempt(serverRejectedTileAttempts, tile) {
  if (!serverRejectedTileAttempts || typeof serverRejectedTileAttempts !== 'object') {
    return;
  }

  delete serverRejectedTileAttempts[buildTileKey(tile)];
}

function recordServerRejectedTileAttempt(serverRejectedTileAttempts, tile) {
  if (!serverRejectedTileAttempts || typeof serverRejectedTileAttempts !== 'object') {
    return 0;
  }

  const tileKey = buildTileKey(tile);
  const previousAttempts = Math.max(0, Number(serverRejectedTileAttempts[tileKey] || 0));
  const nextAttempts = Math.min(MAX_TILE_SERVER_400_ATTEMPTS, previousAttempts + 1);
  serverRejectedTileAttempts[tileKey] = nextAttempts;
  return nextAttempts;
}

function isServerRejected400Error(error) {
  return Number(error?.tileServerStatus || 0) === 400;
}

function addPresetTilesToPlan(tileKeySet, countsByZoom, preset) {
  for (const zoom of preset.zooms) {
    const tiles = buildTilesForBounds(preset.bounds, zoom);
    for (const tile of tiles) {
      tileKeySet.add(buildTileKey(tile));
    }
    countsByZoom[zoom] = countTilesForZoom(tileKeySet, zoom);
  }
}

function readCachedTileSize(cachePath) {
  try {
    const size = fs.statSync(cachePath).size;
    return Number.isFinite(size) && size > 0 ? size : 0;
  } catch (_error) {
    return 0;
  }
}

function resolveEstimatedTileBytes(zoom, cachedCount, cachedBytes) {
  if (cachedCount > 0 && cachedBytes > 0) {
    return cachedBytes / cachedCount;
  }

  if (ESTIMATED_TILE_BYTES_BY_ZOOM[zoom]) {
    return ESTIMATED_TILE_BYTES_BY_ZOOM[zoom];
  }

  if (zoom >= 18) {
    return ESTIMATED_TILE_BYTES_BY_ZOOM[18];
  }

  if (zoom >= 16) {
    return ESTIMATED_TILE_BYTES_BY_ZOOM[16];
  }

  if (zoom >= 14) {
    return ESTIMATED_TILE_BYTES_BY_ZOOM[14];
  }

  return ESTIMATED_TILE_BYTES_BY_ZOOM[12];
}

function scanCachedTileEntries(rootPath, onTile) {
  if (!rootPath || typeof onTile !== 'function' || !fs.existsSync(rootPath)) {
    return;
  }

  const zoomEntries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const zoomEntry of zoomEntries) {
    if (!zoomEntry.isDirectory()) {
      continue;
    }

    const z = Number.parseInt(zoomEntry.name, 10);
    if (!Number.isInteger(z) || z < 0) {
      continue;
    }

    const zoomPath = path.join(rootPath, zoomEntry.name);
    const columnEntries = fs.readdirSync(zoomPath, { withFileTypes: true });
    for (const columnEntry of columnEntries) {
      if (!columnEntry.isDirectory()) {
        continue;
      }

      const x = Number.parseInt(columnEntry.name, 10);
      if (!Number.isInteger(x) || x < 0) {
        continue;
      }

      const columnPath = path.join(zoomPath, columnEntry.name);
      const rowEntries = fs.readdirSync(columnPath, { withFileTypes: true });
      for (const rowEntry of rowEntries) {
        if (!rowEntry.isFile() || !rowEntry.name.endsWith('.png')) {
          continue;
        }

        const y = Number.parseInt(rowEntry.name.replace(/\.png$/i, ''), 10);
        if (!Number.isInteger(y) || y < 0) {
          continue;
        }

        const tilePath = path.join(columnPath, rowEntry.name);
        onTile({
          z,
          x,
          y,
          path: tilePath,
          size: readCachedTileSize(tilePath)
        });
      }
    }
  }
}

function formatTileBytesLabel(bytes) {
  const numericValue = Number(bytes || 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let value = numericValue;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function calculateSpeedBps(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return 0;
  }

  const newest = samples[samples.length - 1];
  const oldest = samples[0];
  const bytes = samples.reduce((sum, sample) => sum + Number(sample.bytes || 0), 0);
  const elapsedMs = Math.max(1, newest.at - oldest.at);
  return bytes / (elapsedMs / 1000);
}

function deduplicatePoints(people) {
  const seen = new Set();
  const points = [];

  for (const person of people) {
    const lat = Number(person.lat);
    const lng = Number(person.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }

    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    points.push({ lat, lng });
  }

  return points;
}

function addSquareTilesForPoints(targetSet, points, zoom, halfSideKm) {
  for (const point of points) {
    const latDelta = radiansToDegrees(halfSideKm / 6371.0088);
    const lngDelta = radiansToDegrees(
      halfSideKm / (6371.0088 * Math.max(0.000001, Math.cos(degreesToRadians(point.lat))))
    );
    const minLat = clampLatitude(point.lat - latDelta);
    const maxLat = clampLatitude(point.lat + latDelta);
    const minLng = clampLongitude(point.lng - lngDelta);
    const maxLng = clampLongitude(point.lng + lngDelta);

    const minX = longitudeToTileX(minLng, zoom);
    const maxX = longitudeToTileX(maxLng, zoom);
    const minY = latitudeToTileY(maxLat, zoom);
    const maxY = latitudeToTileY(minLat, zoom);

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        targetSet.add(buildTileKey({ z: zoom, x, y }));
      }
    }
  }
}

function countTilesForZoom(tileKeySet, zoom) {
  let count = 0;
  tileKeySet.forEach((tileKey) => {
    if (tileKey.startsWith(`${zoom}/`)) {
      count += 1;
    }
  });
  return count;
}

function buildTileKey(tile) {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

function buildCoveredExtraAncestorTiles(tile, planTileKeys = new Set()) {
  if (!tile || !Number.isInteger(tile.z) || tile.z <= 0) {
    return [];
  }

  const ancestors = [];
  for (let zoom = tile.z - 1; zoom >= 0; zoom -= 1) {
    const zoomDelta = tile.z - zoom;
    const ancestorTile = {
      z: zoom,
      x: Math.floor(tile.x / (2 ** zoomDelta)),
      y: Math.floor(tile.y / (2 ** zoomDelta))
    };
    if (planTileKeys.has(buildTileKey(ancestorTile))) {
      continue;
    }
    ancestors.push(ancestorTile);
  }

  return ancestors;
}

function buildFallbackAncestorTiles(tile) {
  if (!tile || !Number.isInteger(tile.z) || tile.z <= 0) {
    return [];
  }

  const candidates = [];
  const minZoom = Math.max(0, tile.z - TILE_FALLBACK_MAX_ZOOM_DELTA);
  for (let zoom = tile.z - 1; zoom >= minZoom; zoom -= 1) {
    const scale = 2 ** (tile.z - zoom);
    const ancestor = {
      z: zoom,
      x: Math.floor(tile.x / scale),
      y: Math.floor(tile.y / scale)
    };
    candidates.push({
      ancestor,
      scale,
      offsetX: tile.x - (ancestor.x * scale),
      offsetY: tile.y - (ancestor.y * scale)
    });
  }

  return candidates;
}

function renderFallbackTileBuffer(buffer, offsetX, offsetY, scale) {
  if (!buffer || !Number.isInteger(scale) || scale <= 1) {
    return null;
  }

  const image = nativeImage.createFromBuffer(buffer);
  const imageSize = image.getSize();
  if (!imageSize?.width || !imageSize?.height) {
    return null;
  }

  const cropWidth = Math.floor(imageSize.width / scale);
  const cropHeight = Math.floor(imageSize.height / scale);
  if (cropWidth <= 0 || cropHeight <= 0) {
    return null;
  }

  const cropX = offsetX * cropWidth;
  const cropY = offsetY * cropHeight;
  if (cropX < 0 || cropY < 0 || cropX + cropWidth > imageSize.width || cropY + cropHeight > imageSize.height) {
    return null;
  }

  return image
    .crop({
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight
    })
    .resize({
      width: imageSize.width,
      height: imageSize.height,
      quality: 'good'
    })
    .toPNG();
}

function parseTileKey(tileKey) {
  const [z, x, y] = String(tileKey || '').split('/').map((value) => Number.parseInt(value, 10));
  return { z, x, y };
}

function compareTiles(left, right) {
  if (left.z !== right.z) {
    return left.z - right.z;
  }
  if (left.x !== right.x) {
    return left.x - right.x;
  }
  return left.y - right.y;
}

function longitudeToTileX(lng, zoom) {
  return Math.floor(((lng + 180) / 360) * (2 ** zoom));
}

function latitudeToTileY(lat, zoom) {
  const radians = degreesToRadians(lat);
  return Math.floor(
    (1 - Math.log(Math.tan(radians) + (1 / Math.cos(radians))) / Math.PI) / 2 * (2 ** zoom)
  );
}

function degreesToRadians(value) {
  return value * (Math.PI / 180);
}

function radiansToDegrees(value) {
  return value * (180 / Math.PI);
}

function clampLatitude(value) {
  return Math.max(-85.05112878, Math.min(85.05112878, value));
}

function clampLongitude(value) {
  return Math.max(-180, Math.min(180, value));
}

function normalizeBoundsInput(bounds) {
  const south = Number(bounds?.south);
  const west = Number(bounds?.west);
  const north = Number(bounds?.north);
  const east = Number(bounds?.east);

  if (![south, west, north, east].every(Number.isFinite)) {
    return null;
  }

  return {
    south: clampLatitude(Math.min(south, north)),
    west: clampLongitude(Math.min(west, east)),
    north: clampLatitude(Math.max(south, north)),
    east: clampLongitude(Math.max(west, east))
  };
}

function buildTilesForBounds(bounds, zoom) {
  const maxTileIndex = Math.max(0, (2 ** zoom) - 1);
  const minX = clampTileIndex(longitudeToTileX(bounds.west, zoom), maxTileIndex);
  const maxX = clampTileIndex(longitudeToTileX(bounds.east, zoom), maxTileIndex);
  const minY = clampTileIndex(latitudeToTileY(bounds.north, zoom), maxTileIndex);
  const maxY = clampTileIndex(latitudeToTileY(bounds.south, zoom), maxTileIndex);
  const tiles = [];

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      tiles.push({ z: zoom, x, y });
    }
  }

  return tiles;
}

function clampTileIndex(value, maxTileIndex) {
  return Math.max(0, Math.min(maxTileIndex, value));
}

function buildTilesForSquare(point, zoom, halfSideKm) {
  const latDelta = radiansToDegrees(halfSideKm / 6371.0088);
  const lngDelta = radiansToDegrees(
    halfSideKm / (6371.0088 * Math.max(0.000001, Math.cos(degreesToRadians(point.lat))))
  );

  return buildTilesForBounds({
    south: point.lat - latDelta,
    west: point.lng - lngDelta,
    north: point.lat + latDelta,
    east: point.lng + lngDelta
  }, zoom);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

module.exports = {
  createMapTileService
};
