const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { loadAccessPassword, loadGoogleMapsApiKey } = require('./access-service');

const TRASA_CONTAINER_PREFIX = Buffer.from('MAPSHORTNER_TRASA_V1\n', 'utf8');

function exportTrasaArchive({ app, store, targetPath, appVersion }) {
  const outputPath = ensureTrasaExtension(targetPath);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapshortner-trasa-'));
  const snapshotPath = path.join(tempDir, 'mapshortner.sqlite');

  try {
    store.exportSnapshot(snapshotPath);
    const reports = store.getExportReports();
    const secrets = collectSecrets();

    const databaseZip = createDatabaseZip(snapshotPath);
    const reportsZip = createReportsZip(reports);
    const secretsZip = createSecretsZip(secrets);
    const manifest = buildManifest({
      appVersion,
      outputPath,
      reports,
      secrets
    });

    const archive = new AdmZip();
    archive.addFile('manifest.json', bufferOfJson(manifest));
    archive.addFile('database.zip', databaseZip.toBuffer());
    archive.addFile('reports.zip', reportsZip.toBuffer());
    archive.addFile('secrets.zip', secretsZip.toBuffer());
    archive.addFile(
      'README.txt',
      Buffer.from(
        [
          'Pakiet .trasa zawiera pelny snapshot SQLite, raporty JSON oraz sekrety.',
          'Jest zapisywany jako wlasny kontener aplikacji Elrond - wyszukiwanie trasy, a nie jako surowy plik ZIP.',
          'Traktuj ten plik jak dane wrazliwe i przechowuj go bezpiecznie.',
          ''
        ].join('\n'),
        'utf8'
      )
    );
    fs.writeFileSync(outputPath, wrapTrasaArchiveBuffer(archive.toBuffer()));

    return {
      outputPath,
      sizeBytes: fs.statSync(outputPath).size,
      manifest
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function importTrasaArchive({ app, trasaPath, targetDbPath }) {
  const archive = new AdmZip(readTrasaArchiveBuffer(trasaPath));
  const manifest = readManifest(archive);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapshortner-trasa-import-'));

  try {
    restoreDatabaseFromArchive({
      archive,
      targetDbPath,
      tempDir
    });

    const importedSecrets = restoreSecretsFromArchive({
      app,
      archive
    });

    return {
      manifest,
      importedSecrets
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function ensureTrasaExtension(targetPath) {
  return targetPath.toLowerCase().endsWith('.trasa') ? targetPath : `${targetPath}.trasa`;
}

function wrapTrasaArchiveBuffer(zipBuffer) {
  return Buffer.concat([TRASA_CONTAINER_PREFIX, zipBuffer]);
}

function readTrasaArchiveBuffer(trasaPath) {
  const payload = fs.readFileSync(trasaPath);

  if (payload.subarray(0, TRASA_CONTAINER_PREFIX.length).equals(TRASA_CONTAINER_PREFIX)) {
    return payload.subarray(TRASA_CONTAINER_PREFIX.length);
  }

  return payload;
}

function createDatabaseZip(snapshotPath) {
  const zip = new AdmZip();
  zip.addLocalFile(snapshotPath, 'database');
  return zip;
}

function createReportsZip(reports) {
  const zip = new AdmZip();
  addJsonFile(zip, 'dashboard-summary.json', reports.dashboardSummary);
  addJsonFile(zip, 'import-tables.json', reports.importTables);
  addJsonFile(zip, 'map-data.json', reports.mapData);
  addJsonFile(zip, 'people-report.json', reports.people);
  addJsonFile(zip, 'google-map-report.json', reports.googleMapReport);
  addJsonFile(zip, 'service-cards-report.json', reports.serviceCards);
  addJsonFile(zip, 'local-notes-report.json', reports.notes);
  addJsonFile(zip, 'export-metadata.json', { generatedAt: reports.generatedAt });
  return zip;
}

function createSecretsZip(secrets) {
  const zip = new AdmZip();
  if (secrets.googleMapsApiKey) {
    zip.addFile(
      'secrets/google_maps_api.env',
      Buffer.from(formatExportFile('GOOGLE_MAPS_API_KEY', secrets.googleMapsApiKey), 'utf8')
    );
  }
  if (secrets.accessPassword) {
    zip.addFile(
      'secrets/access_db_password.env',
      Buffer.from(formatExportFile('ACCES_PASSWORD', secrets.accessPassword), 'utf8')
    );
  }
  return zip;
}

function buildManifest({ appVersion, outputPath, reports, secrets }) {
  return {
    format: 'mapshortner.trasa',
    version: 2,
    exportedAt: new Date().toISOString(),
    applicationVersion: appVersion || null,
    archiveName: path.basename(outputPath),
    container: {
      type: 'wrapped-zip',
      wrapper: 'mapshortner-header-v1'
    },
    contains: {
      databaseZip: 'database.zip',
      reportsZip: 'reports.zip',
      secretsZip: 'secrets.zip'
    },
    stats: reports.dashboardSummary?.stats || {},
    importMeta: reports.dashboardSummary?.importMeta || null,
    secretsIncluded: {
      googleMapsApiKey: Boolean(secrets.googleMapsApiKey),
      accessPassword: Boolean(secrets.accessPassword)
    }
  };
}

function collectSecrets() {
  return {
    googleMapsApiKey: loadGoogleMapsApiKey(),
    accessPassword: loadAccessPassword()
  };
}

function restoreDatabaseFromArchive({ archive, targetDbPath, tempDir }) {
  const dbZipEntry = archive.getEntry('database.zip');
  if (!dbZipEntry) {
    throw new Error('Pakiet .trasa nie zawiera database.zip.');
  }

  const nestedZip = new AdmZip(dbZipEntry.getData());
  const dbEntry = nestedZip
    .getEntries()
    .find((entry) => !entry.isDirectory && path.basename(entry.entryName).endsWith('.sqlite'));

  if (!dbEntry) {
    throw new Error('Pakiet .trasa nie zawiera snapshotu SQLite.');
  }

  fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
  removeDatabaseSidecars(targetDbPath);

  const tempSnapshotPath = path.join(tempDir, path.basename(targetDbPath));
  fs.writeFileSync(tempSnapshotPath, dbEntry.getData());
  fs.copyFileSync(tempSnapshotPath, targetDbPath);
}

function restoreSecretsFromArchive({ app, archive }) {
  const secretsDir = resolveSecretsDir(app);
  fs.mkdirSync(secretsDir, { recursive: true });

  const secretsZipEntry = archive.getEntry('secrets.zip');
  if (!secretsZipEntry) {
    return {
      googleMapsApiKey: false,
      accessPassword: false
    };
  }

  const nestedZip = new AdmZip(secretsZipEntry.getData());
  const imported = {
    googleMapsApiKey: false,
    accessPassword: false
  };

  const googleEntry = nestedZip.getEntry('secrets/google_maps_api.env');
  if (googleEntry) {
    fs.writeFileSync(path.join(secretsDir, 'google_maps_api'), googleEntry.getData(), {
      mode: 0o600
    });
    imported.googleMapsApiKey = true;
  }

  const accessEntry = nestedZip.getEntry('secrets/access_db_password.env');
  if (accessEntry) {
    fs.writeFileSync(path.join(secretsDir, 'acces_db_tata'), accessEntry.getData(), {
      mode: 0o600
    });
    imported.accessPassword = true;
  }

  return imported;
}

function resolveSecretsDir(app) {
  try {
    return path.join(app.getPath('home'), 'secrets');
  } catch (error) {
    return path.join(os.homedir(), 'secrets');
  }
}

function removeDatabaseSidecars(targetDbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${targetDbPath}${suffix}`, { force: true });
  }
}

function readManifest(archive) {
  const entry = archive.getEntry('manifest.json');
  if (!entry) {
    throw new Error('Pakiet .trasa nie zawiera manifest.json.');
  }
  return JSON.parse(entry.getData().toString('utf8'));
}

function addJsonFile(zip, fileName, payload) {
  zip.addFile(`reports/${fileName}`, bufferOfJson(payload));
}

function bufferOfJson(payload) {
  return Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function formatExportFile(key, value) {
  return `export ${key}="${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"\n`;
}

module.exports = {
  exportTrasaArchive,
  importTrasaArchive
};
