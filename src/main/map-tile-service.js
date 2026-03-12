const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { net } = require('electron');

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

const OFFLINE_TILE_DEFAULTS = Object.freeze({
  z12RadiusKm: 10,
  z14RadiusKm: 0.5,
  z16RadiusMeters: 200,
  concurrency: 4
});

const OFFLINE_TILE_ZOOM_SPECS = Object.freeze([
  { zoom: 12, settingKey: 'z12RadiusKm', unit: 'km' },
  { zoom: 14, settingKey: 'z14RadiusKm', unit: 'km' },
  { zoom: 16, settingKey: 'z16RadiusMeters', unit: 'm' }
]);

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
  let lastOfflineStateFlushAt = 0;
  let activeForegroundDownloads = 0;
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
        phase: 'paused',
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
      log.warn('Map tile request failed', {
        url: request.url,
        error: error?.message || String(error)
      });
      return buildTileResponse(TRANSPARENT_PNG, 'image/png', 'no-store');
    }
  }

  async function readOrFetchTile(tile, options = {}) {
    const cachePath = buildCachePath(tile);
    const cached = await readCachedTile(cachePath);
    if (cached) {
      return cached;
    }

    const pendingKey = cachePath;
    if (!inFlightDownloads.has(pendingKey)) {
      if (options.priority !== 'foreground') {
        await waitForForegroundCapacity();
      }
      inFlightDownloads.set(
        pendingKey,
        downloadAndCacheTile(tile, cachePath, options).finally(() => {
          inFlightDownloads.delete(pendingKey);
        })
      );
    }

    return inFlightDownloads.get(pendingKey);
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

  async function downloadAndCacheTile(tile, cachePath, options = {}) {
    const remoteUrl = buildRemoteTileUrl(tile);
    const isForeground = options.priority === 'foreground';

    if (isForeground) {
      activeForegroundDownloads += 1;
    }

    try {
      const response = await net.fetch(remoteUrl, {
        headers: {
          'User-Agent': `MapShortner/${app.getVersion()}`
        }
      });

      if (!response.ok) {
        throw new Error(`Tile server returned ${response.status} for ${remoteUrl}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await fsp.mkdir(path.dirname(cachePath), { recursive: true });
      await fsp.writeFile(cachePath, buffer);

      const downloaded = {
        buffer,
        contentType: response.headers.get('content-type') || 'image/png'
      };
      touchMemoryCache(cachePath, downloaded);
      return downloaded;
    } finally {
      if (isForeground) {
        activeForegroundDownloads = Math.max(0, activeForegroundDownloads - 1);
      }
    }
  }

  async function saveOfflineDownloadSettings(input = {}) {
    const settings = store.saveOfflineTileSettings(input);
    if (activeDownloadRun) {
      sendOperationStatus({
        type: 'tiles',
        status: 'updated',
        message: 'Zapisano ustawienia map offline. Zostana uzyte przy kolejnym uruchomieniu pobierania.',
        summary: store.getDashboardSummary()
      });
      return {
        settings,
        state: getOfflineDownloadState()
      };
    }

    const state = await rebuildOfflineDownloadOverview();
    return { settings, state };
  }

  async function refreshOfflineDownloadState() {
    const state = activeDownloadRun
      ? getOfflineDownloadState()
      : await rebuildOfflineDownloadOverview();
    return {
      settings: store.getOfflineTileSettings(),
      state
    };
  }

  async function startOfflineDownload() {
    if (activeDownloadRun) {
      return {
        settings: store.getOfflineTileSettings(),
        state: getOfflineDownloadState()
      };
    }

    const settings = normalizeOfflineTileSettings(store.getOfflineTileSettings());
    const plan = await buildOfflineDownloadPlan(settings);
    const missingTiles = [];
    let cachedTiles = 0;

    for (const tile of plan.tiles) {
      if (fs.existsSync(buildCachePath(tile))) {
        cachedTiles += 1;
      } else {
        missingTiles.push(tile);
      }
    }

    const startedAt = new Date().toISOString();
    const initialState = updateOfflineState({
      phase: missingTiles.length > 0 ? 'downloading' : 'completed',
      totalTiles: plan.tiles.length,
      downloadedTiles: cachedTiles,
      failedTiles: 0,
      bytesDownloaded: 0,
      speedBps: 0,
      startedAt,
      updatedAt: startedAt,
      completedAt: missingTiles.length > 0 ? null : startedAt,
      lastError: null,
      planSummary: plan.summary
    }, { force: true });

    sendOperationStatus({
      type: 'tiles',
      status: missingTiles.length > 0 ? 'started' : 'completed',
      message: missingTiles.length > 0
        ? 'Rozpoczeto pobieranie wybranych kafelkow mapy offline.'
        : 'Wszystkie kafelki z aktualnego profilu sa juz pobrane.',
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
      bytesDownloaded: 0
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

  async function pauseOfflineDownload() {
    if (!activeDownloadRun) {
      const state = updateOfflineState({
        phase: lastPersistedState.phase === 'completed' ? 'completed' : 'paused',
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

  function getOfflineDownloadState() {
    return normalizeOfflineTileState(lastPersistedState);
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

  async function rebuildOfflineDownloadOverview() {
    const settings = normalizeOfflineTileSettings(store.getOfflineTileSettings());
    const plan = await buildOfflineDownloadPlan(settings);
    let cachedTiles = 0;

    for (const tile of plan.tiles) {
      if (fs.existsSync(buildCachePath(tile))) {
        cachedTiles += 1;
      }
    }

    const previousState = store.getOfflineTileDownloadState();
    const phase = plan.tiles.length > 0 && cachedTiles >= plan.tiles.length
      ? 'completed'
      : (previousState.phase === 'paused' ? 'paused' : 'idle');
    const completedAt = phase === 'completed' ? (previousState.completedAt || new Date().toISOString()) : null;

    return updateOfflineState({
      phase,
      totalTiles: plan.tiles.length,
      downloadedTiles: cachedTiles,
      failedTiles: phase === 'completed' ? 0 : previousState.failedTiles,
      bytesDownloaded: previousState.bytesDownloaded,
      speedBps: 0,
      startedAt: previousState.startedAt,
      updatedAt: new Date().toISOString(),
      completedAt,
      lastError: phase === 'completed' ? null : previousState.lastError,
      planSummary: plan.summary
    }, { force: true });
  }

  async function buildOfflineDownloadPlan(settings) {
    const mapData = store.listMapPoints({});
    const uniquePoints = deduplicatePoints(mapData.people || []);
    const tileKeySet = new Set();
    const countsByZoom = {};

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

    const tiles = Array.from(tileKeySet)
      .map(parseTileKey)
      .sort(compareTiles);

    return {
      tiles,
      summary: {
        pointsCount: uniquePoints.length,
        countsByZoom,
        settings
      }
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
          run.downloadedTiles += 1;
          pushOfflineProgress(run, totalTiles, 0);
          continue;
        }

        const downloaded = await readOrFetchTile(tile, { priority: 'background' });
        const downloadedBytes = downloaded?.buffer?.length || 0;
        run.downloadedTiles += 1;
        run.bytesDownloaded += downloadedBytes;
        pushOfflineProgress(run, totalTiles, downloadedBytes);
      } catch (error) {
        run.failedTiles += 1;
        updateOfflineState({
          phase: 'downloading',
          totalTiles,
          downloadedTiles: run.downloadedTiles,
          failedTiles: run.failedTiles,
          bytesDownloaded: run.bytesDownloaded,
          speedBps: calculateSpeedBps(run.speedSamples),
          updatedAt: new Date().toISOString(),
          lastError: error.message
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
      speedBps: calculateSpeedBps(run.speedSamples),
      updatedAt: new Date().toISOString(),
      lastError: null
    });
  }

  function finalizeOfflineDownloadRun(run, totalTiles, error = null) {
    if (activeDownloadRun !== run) {
      return;
    }

    activeDownloadRun = null;
    const completedAt = new Date().toISOString();
    const phase = error
      ? 'error'
      : (run.cancelled ? 'paused' : 'completed');
    const nextState = updateOfflineState({
      phase,
      totalTiles,
      downloadedTiles: run.downloadedTiles,
      failedTiles: run.failedTiles,
      bytesDownloaded: run.bytesDownloaded,
      speedBps: 0,
      updatedAt: completedAt,
      completedAt: phase === 'completed' ? completedAt : lastPersistedState.completedAt,
      lastError: error ? error.message : lastPersistedState.lastError
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
        : 'Pobieranie kafelkow offline zatrzymane.',
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
    while (activeForegroundDownloads > 0) {
      await delay(FOREGROUND_PRIORITY_POLL_MS);
    }
  }

  return {
    registerProtocol,
    getOfflineDownloadState,
    refreshOfflineDownloadState,
    saveOfflineDownloadSettings,
    startOfflineDownload,
    pauseOfflineDownload,
    queueViewportPrefetch,
    queueHoverPrefetch
  };
}

function normalizeOfflineTileSettings(input = {}) {
  const z12RadiusKm = Number(input.z12RadiusKm);
  const z14RadiusKm = Number(input.z14RadiusKm);
  const z16RadiusMeters = Number(input.z16RadiusMeters);
  const concurrency = Number(input.concurrency);

  return {
    z12RadiusKm: Number.isFinite(z12RadiusKm) ? Math.max(0, z12RadiusKm) : OFFLINE_TILE_DEFAULTS.z12RadiusKm,
    z14RadiusKm: Number.isFinite(z14RadiusKm) ? Math.max(0, z14RadiusKm) : OFFLINE_TILE_DEFAULTS.z14RadiusKm,
    z16RadiusMeters: Number.isFinite(z16RadiusMeters)
      ? Math.max(0, z16RadiusMeters)
      : OFFLINE_TILE_DEFAULTS.z16RadiusMeters,
    concurrency: Number.isFinite(concurrency)
      ? Math.min(12, Math.max(1, Math.round(concurrency)))
      : OFFLINE_TILE_DEFAULTS.concurrency
  };
}

function normalizeOfflineTileState(input = {}) {
  return {
    phase: String(input.phase || 'idle'),
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
  const minX = longitudeToTileX(bounds.west, zoom);
  const maxX = longitudeToTileX(bounds.east, zoom);
  const minY = latitudeToTileY(bounds.north, zoom);
  const maxY = latitudeToTileY(bounds.south, zoom);
  const tiles = [];

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      tiles.push({ z: zoom, x, y });
    }
  }

  return tiles;
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
