const fs = require('node:fs');
const path = require('node:path');
const { net } = require('electron');

const TILE_CACHE_VERSION = 'v1';
const TILE_SERVER_URL_TEMPLATE =
  process.env.MAPSHORTNER_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9n6ukAAAAASUVORK5CYII=',
  'base64'
);

function createMapTileService({ app, log, protocol }) {
  const cacheRoot = path.join(app.getPath('userData'), 'map-tiles', TILE_CACHE_VERSION);
  const inFlightDownloads = new Map();
  let protocolRegistered = false;

  async function registerProtocol() {
    if (protocolRegistered) {
      return;
    }

    fs.mkdirSync(cacheRoot, { recursive: true });
    protocol.handle('maptiles', handleTileRequest);
    protocolRegistered = true;
  }

  async function handleTileRequest(request) {
    const tile = parseTileRequest(request.url);
    if (!tile) {
      return buildTileResponse(TRANSPARENT_PNG, 'image/png', 'no-store');
    }

    try {
      const result = await readOrFetchTile(tile);
      return buildTileResponse(result.buffer, result.contentType, 'public, max-age=31536000, immutable');
    } catch (error) {
      log.warn('Map tile request failed', {
        url: request.url,
        error: error?.message || String(error)
      });
      return buildTileResponse(TRANSPARENT_PNG, 'image/png', 'no-store');
    }
  }

  async function readOrFetchTile(tile) {
    const cachePath = buildCachePath(tile);
    const cached = readCachedTile(cachePath);
    if (cached) {
      return cached;
    }

    const pendingKey = cachePath;
    if (!inFlightDownloads.has(pendingKey)) {
      inFlightDownloads.set(
        pendingKey,
        downloadAndCacheTile(tile, cachePath).finally(() => {
          inFlightDownloads.delete(pendingKey);
        })
      );
    }

    return inFlightDownloads.get(pendingKey);
  }

  function readCachedTile(cachePath) {
    if (!fs.existsSync(cachePath)) {
      return null;
    }

    return {
      buffer: fs.readFileSync(cachePath),
      contentType: 'image/png'
    };
  }

  async function downloadAndCacheTile(tile, cachePath) {
    const remoteUrl = buildRemoteTileUrl(tile);
    const response = await net.fetch(remoteUrl, {
      headers: {
        'User-Agent': `MapShortner/${app.getVersion()}`
      }
    });

    if (!response.ok) {
      throw new Error(`Tile server returned ${response.status} for ${remoteUrl}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, buffer);

    return {
      buffer,
      contentType: response.headers.get('content-type') || 'image/png'
    };
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

  return {
    registerProtocol
  };
}

module.exports = {
  createMapTileService
};
