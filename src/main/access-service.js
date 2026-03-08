const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const util = require('node:util');
const { execFile } = require('node:child_process');
const { PEOPLE_TABLE, SERVICE_TABLE } = require('./data-store');

const execFileAsync = util.promisify(execFile);
const JAVA_MAIN_CLASS = 'bridge.AccessBridge';
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

async function importAccessDatabase({ app, store, accessDbPath, onProgress, sourceFingerprint }) {
  const password = loadAccessPassword();
  if (!password) {
    throw new Error(
      'Nie znaleziono hasla do Accessa. Oczekiwany plik: ~/secrets/acces_db_tata z export ACCES_PASSWORD="..."'
    );
  }

  const initialFingerprint = sourceFingerprint || (await getAccessFileFingerprint(accessDbPath));
  store.setSetting('accessDbPath', accessDbPath);
  store.clearStagedImportedData();

  try {
    const tablesPayload = await runAccessBridge(app, ['tables', accessDbPath, password]);
    const tables = Array.isArray(tablesPayload.tables) ? tablesPayload.tables : [];

    let importedRows = 0;
    const pageSize = 200;

    if (typeof onProgress === 'function') {
      onProgress({
        phase: 'preparing',
        tableName: null,
        totalTables: tables.length,
        importedRows,
        message: 'Przygotowanie bezpiecznego reimportu.'
      });
    }

    for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
      const tableName = tables[tableIndex];
      const meta = await runAccessBridge(app, ['columns', accessDbPath, password, tableName]);
      store.saveStagedImportedTable({
        name: tableName,
        rowCount: 0,
        columns: meta.columns || []
      });

      let offset = 0;
      let totalForTable = 0;
      while (true) {
        const chunk = await runAccessBridge(app, [
          'export-table',
          accessDbPath,
          password,
          tableName,
          String(pageSize),
          String(offset)
        ]);

        const rows = Array.isArray(chunk.rows) ? chunk.rows : [];
        if (rows.length === 0) {
          break;
        }

        totalForTable += rows.length;
        importedRows += rows.length;
        store.saveStagedImportedRows(tableName, rows);

        if (tableName === PEOPLE_TABLE) {
          store.saveStagedPeopleRows(rows);
        }

        if (tableName === SERVICE_TABLE) {
          store.saveStagedServiceCards(rows);
        }

        offset += rows.length;
        if (typeof onProgress === 'function') {
          onProgress({
            phase: 'import',
            tableName,
            tableIndex,
            totalTables: tables.length,
            importedRows,
            importedRowsForTable: totalForTable
          });
        }

        await yieldToEventLoop();
      }

      store.saveStagedImportedTable({
        name: tableName,
        rowCount: totalForTable,
        columns: meta.columns || []
      });

      await yieldToEventLoop();
    }

    const finalFingerprint = await getAccessFileFingerprint(accessDbPath);
    if (finalFingerprint !== initialFingerprint) {
      throw new Error(
        'Plik Access zmienil sie w trakcie importu. Poprzedni snapshot pozostaje aktywny; reimport zostanie sprobowany ponownie.'
      );
    }

    store.finalizeStagedImport(accessDbPath);
    if (typeof onProgress === 'function') {
      onProgress({
        phase: 'promote',
        tableName: null,
        totalTables: tables.length,
        importedRows,
        message: 'Podmiana aktywnego snapshotu SQLite.'
      });
    }

    store.promoteStagedImport({
      sourcePath: accessDbPath,
      sourceFingerprint: finalFingerprint
    });

    if (typeof onProgress === 'function') {
      onProgress({
        phase: 'completed',
        tableName: null,
        totalTables: tables.length,
        importedRows
      });
    }

    return store.getDashboardSummary();
  } catch (error) {
    store.clearStagedImportedData();
    throw error;
  }
}

async function geocodePendingPeople({ store, apiKey, limit = 50, onProgress }) {
  const effectiveApiKey = apiKey || loadGoogleMapsApiKey() || store.getSetting('googleMapsApiKey');
  if (!effectiveApiKey) {
    throw new Error('Brak klucza Google Maps API do geokodowania.');
  }

  const pending = store.listPendingGeocodes(limit);
  let resolved = 0;
  let failed = 0;

  for (let index = 0; index < pending.length; index++) {
    const person = pending[index];
    try {
      const geocode = await geocodeAddress(effectiveApiKey, person.routeAddress);
      store.updatePersonCoordinates({
        sourceRowId: person.sourceRowId,
        lat: geocode.lat,
        lng: geocode.lng,
        coordinateSource: 'google-maps',
        geocodeStatus: 'ready',
        geocodeError: null
      });
      resolved++;
    } catch (error) {
      store.updatePersonCoordinates({
        sourceRowId: person.sourceRowId,
        lat: null,
        lng: null,
        coordinateSource: 'google-maps',
        geocodeStatus: 'error',
        geocodeError: error.message
      });
      failed++;
    }

    if (typeof onProgress === 'function') {
      onProgress({
        phase: 'geocoding',
        current: index + 1,
        total: pending.length,
        resolved,
        failed
      });
    }
  }

  return {
    total: pending.length,
    resolved,
    failed
  };
}

async function geocodeOrigin({ store, address, apiKey }) {
  const effectiveApiKey = apiKey || loadGoogleMapsApiKey() || store.getSetting('googleMapsApiKey');
  if (!effectiveApiKey) {
    throw new Error('Brak klucza Google Maps API do geokodowania punktu startowego.');
  }

  return geocodeAddress(effectiveApiKey, address);
}

function loadAccessPassword() {
  return loadExportedSecret(path.join(os.homedir(), 'secrets', 'acces_db_tata'), [
    'ACCES_PASSWORD',
    'ACCESS_PASSWORD'
  ]);
}

function loadGoogleMapsApiKey() {
  const direct = process.env.GOOGLE_MAPS_API_KEY;
  if (direct) {
    return direct;
  }

  return loadExportedSecret(path.join(os.homedir(), 'secrets', 'google_maps_api'), [
    'GOOGLE_MAPS_API_KEY'
  ]);
}

function loadExportedSecret(secretFile, variableNames) {
  for (const variableName of variableNames) {
    if (process.env[variableName]) {
      return process.env[variableName];
    }
  }

  if (!fs.existsSync(secretFile)) {
    return null;
  }

  const content = fs.readFileSync(secretFile, 'utf8');
  for (const variableName of variableNames) {
    const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(new RegExp(`${escaped}\\s*=\\s*["']?([^"'\\n]+)["']?`));
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

async function runAccessBridge(app, args) {
  const bundledRoot = getBundledRoot(app);
  const { classPath } = await resolveBridgePaths(app);
  const { stdout } = await execFileAsync(
    'java',
    ['-cp', classPath, JAVA_MAIN_CLASS, ...args],
    {
      cwd: bundledRoot,
      maxBuffer: 1024 * 1024 * 64
    }
  );

  return JSON.parse(stdout);
}

async function resolveBridgePaths(app) {
  const bundledRoot = getBundledRoot(app);
  const bundledBuildDir = path.join(bundledRoot, 'tools', 'access-bridge', 'build');
  const buildMarker = path.join(bundledBuildDir, 'bridge', 'AccessBridge.class');

  if (fs.existsSync(buildMarker)) {
    return {
      classPath: buildClassPath(bundledRoot, bundledBuildDir)
    };
  }

  const runtimeBuildDir = path.join(app.getPath('userData'), 'runtime', 'access-bridge-build');
  const runtimeMarker = path.join(runtimeBuildDir, 'bridge', 'AccessBridge.class');
  if (!fs.existsSync(runtimeMarker)) {
    await compileAccessBridge({
      bundledRoot,
      runtimeBuildDir
    });
  }

  return {
    classPath: buildClassPath(bundledRoot, runtimeBuildDir)
  };
}

async function getAccessFileFingerprint(accessDbPath) {
  const stat = await fs.promises.stat(accessDbPath);
  return `${Math.trunc(stat.size)}:${Math.trunc(stat.mtimeMs)}`;
}

function yieldToEventLoop() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

async function compileAccessBridge({ bundledRoot, runtimeBuildDir }) {
  const sourceDir = path.join(bundledRoot, 'tools', 'access-bridge', 'src', 'bridge');
  const sources = fs
    .readdirSync(sourceDir)
    .filter((name) => name.endsWith('.java'))
    .map((name) => path.join(sourceDir, name));

  if (sources.length === 0) {
    throw new Error('Brak plikow zrodlowych mostka Accessa do kompilacji.');
  }

  fs.mkdirSync(runtimeBuildDir, { recursive: true });

  const libraryClassPath = buildLibraryClassPath(bundledRoot);
  await execFileAsync(
    'javac',
    ['-cp', libraryClassPath, '-d', runtimeBuildDir, ...sources],
    {
      cwd: bundledRoot,
      maxBuffer: 1024 * 1024 * 16
    }
  );
}

function buildClassPath(bundledRoot, buildDir) {
  return [buildDir, buildLibraryClassPath(bundledRoot)].join(path.delimiter);
}

function buildLibraryClassPath(bundledRoot) {
  return [
    path.join(bundledRoot, 'vendor', 'ucanaccess', 'UCanAccess-5.0.1.bin', 'lib', '*'),
    path.join(bundledRoot, 'vendor', 'ucanaccess', 'jackcess-encrypt-3.0.0.jar'),
    path.join(bundledRoot, 'vendor', 'ucanaccess', 'bcprov-jdk15on-1.60.jar')
  ].join(path.delimiter);
}

function getBundledRoot(app) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked');
  }
  return app.getAppPath();
}

async function geocodeAddress(apiKey, address) {
  const url = new URL(GOOGLE_GEOCODE_URL);
  url.searchParams.set('address', address);
  url.searchParams.set('key', apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Maps API zwrocilo HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.status !== 'OK' || !Array.isArray(payload.results) || payload.results.length === 0) {
    throw new Error(payload.error_message || `Google Maps API status: ${payload.status}`);
  }

  const location = payload.results[0]?.geometry?.location;
  if (!location) {
    throw new Error('Brak wspolrzednych w odpowiedzi Google Maps API.');
  }

  return {
    lat: Number(location.lat),
    lng: Number(location.lng),
    formattedAddress: payload.results[0].formatted_address || address
  };
}

module.exports = {
  getAccessFileFingerprint,
  geocodeOrigin,
  geocodePendingPeople,
  importAccessDatabase,
  loadAccessPassword,
  loadGoogleMapsApiKey
};
