const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PEOPLE_TABLE = 'PC Dane właściciela i pompy';
const SERVICE_TABLE = 'Karta serwisowa';
const ACTIVE_IMPORT_TABLES = Object.freeze({
  importMeta: 'import_meta',
  importedTables: 'imported_tables',
  importedTableRows: 'imported_table_rows',
  peopleCache: 'people_cache',
  serviceCards: 'service_cards'
});
const ACTIVE_IMPORT_INDEXES = Object.freeze({
  importedRowsByTable: 'idx_imported_table_rows_table_name',
  importedRowsBySource: 'idx_imported_table_rows_source_row_id',
  peopleSearch: 'idx_people_cache_search_text',
  peopleCoordinates: 'idx_people_cache_coordinates',
  serviceCardsOwner: 'idx_service_cards_owner'
});
const STAGING_IMPORT_TABLES = Object.freeze({
  importMeta: 'staging_import_meta',
  importedTables: 'staging_imported_tables',
  importedTableRows: 'staging_imported_table_rows',
  peopleCache: 'staging_people_cache',
  serviceCards: 'staging_service_cards'
});
const STAGING_IMPORT_INDEXES = Object.freeze({
  importedRowsByTable: 'idx_staging_imported_table_rows_table_name',
  importedRowsBySource: 'idx_staging_imported_table_rows_source_row_id',
  peopleSearch: 'idx_staging_people_cache_search_text',
  peopleCoordinates: 'idx_staging_people_cache_coordinates',
  serviceCardsOwner: 'idx_staging_service_cards_owner'
});

function createDataStore(app) {
  const dbDirectory = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dbDirectory, { recursive: true });

  const dbPath = path.join(dbDirectory, 'mapshortner.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA synchronous = NORMAL;');

  initSchema(db);

  return {
    dbPath,
    close: () => closeStore(db),
    exportSnapshot: (targetPath) => exportSnapshot(db, targetPath),
    getSetting: (key) => getSetting(db, key),
    setSetting: (key, value) => setSetting(db, key, value),
    clearImportedData: () => clearImportedData(db),
    clearStagedImportedData: () => clearStagedImportedData(db),
    saveImportedTable: (table) => saveImportedTable(db, table),
    saveStagedImportedTable: (table) => saveStagedImportedTable(db, table),
    saveImportedRows: (tableName, rows) => saveImportedRows(db, tableName, rows),
    saveStagedImportedRows: (tableName, rows) => saveStagedImportedRows(db, tableName, rows),
    savePeopleRows: (rows) => savePeopleRows(db, rows),
    saveStagedPeopleRows: (rows) => saveStagedPeopleRows(db, rows),
    saveServiceCards: (rows) => saveServiceCards(db, rows),
    saveStagedServiceCards: (rows) => saveStagedServiceCards(db, rows),
    finalizeImport: (sourcePath) => finalizeImport(db, sourcePath),
    finalizeStagedImport: (sourcePath) => finalizeStagedImport(db, sourcePath),
    promoteStagedImport: (input) => promoteStagedImport(db, input),
    getDashboardSummary: () => getDashboardSummary(db),
    getImportTables: () => getImportTables(db),
    getTableRows: (input) => getTableRows(db, input),
    listPeople: (input) => listPeople(db, input),
    getPersonDetails: (sourceRowId) => getPersonDetails(db, sourceRowId),
    listMapPoints: (input) => listMapPoints(db, input),
    listPendingGeocodes: (limit) => listPendingGeocodes(db, limit),
    updatePersonCoordinates: (payload) => updatePersonCoordinates(db, payload),
    addNote: (payload) => addNote(db, payload),
    listNotes: (entityType, entityId) => listNotes(db, entityType, entityId),
    addCustomPoint: (payload) => addCustomPoint(db, payload),
    listCustomPoints: () => listCustomPoints(db),
    buildRoute: (input) => buildRoute(db, input),
    getExportReports: () => getExportReports(db)
  };
}

function closeStore(db) {
  db.close();
}

function exportSnapshot(db, targetPath) {
  fs.rmSync(targetPath, { force: true });
  const safeTargetPath = targetPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${safeTargetPath}'`);
  return targetPath;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    ${buildImportSchemaSql(ACTIVE_IMPORT_TABLES, ACTIVE_IMPORT_INDEXES)}
    ${buildImportSchemaSql(STAGING_IMPORT_TABLES, STAGING_IMPORT_INDEXES)}

    CREATE TABLE IF NOT EXISTS local_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_local_notes_entity
      ON local_notes(entity_type, entity_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS custom_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      address_text TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function buildImportSchemaSql(tables, indexes) {
  return `
    CREATE TABLE IF NOT EXISTS ${tables.importMeta} (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      source_path TEXT,
      imported_at TEXT,
      tables_count INTEGER DEFAULT 0,
      rows_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ${tables.importedTables} (
      name TEXT PRIMARY KEY,
      row_count INTEGER DEFAULT 0,
      columns_json TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ${tables.importedTableRows} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      source_row_id TEXT,
      raw_json TEXT NOT NULL,
      search_text TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ${indexes.importedRowsByTable}
      ON ${tables.importedTableRows}(table_name);

    CREATE INDEX IF NOT EXISTS ${indexes.importedRowsBySource}
      ON ${tables.importedTableRows}(source_row_id);

    CREATE TABLE IF NOT EXISTS ${tables.peopleCache} (
      source_row_id TEXT PRIMARY KEY,
      full_name TEXT,
      company_name TEXT,
      email TEXT,
      phone TEXT,
      address_text TEXT,
      street TEXT,
      city TEXT,
      county TEXT,
      commune TEXT,
      region TEXT,
      postal_code TEXT,
      country TEXT,
      route_address TEXT,
      lat REAL,
      lng REAL,
      coordinate_source TEXT,
      geocode_status TEXT NOT NULL DEFAULT 'pending',
      geocode_error TEXT,
      installed_at TEXT,
      last_visit_at TEXT,
      last_payment_at TEXT,
      planned_visit_at TEXT,
      declined_visit_at TEXT,
      device_vendor TEXT,
      device_model TEXT,
      payer_name TEXT,
      current_amount REAL,
      total_paid REAL,
      notes_summary TEXT,
      raw_json TEXT NOT NULL,
      search_text TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ${indexes.peopleSearch}
      ON ${tables.peopleCache}(search_text);

    CREATE INDEX IF NOT EXISTS ${indexes.peopleCoordinates}
      ON ${tables.peopleCache}(lat, lng);

    CREATE TABLE IF NOT EXISTS ${tables.serviceCards} (
      source_row_id TEXT PRIMARY KEY,
      owner_source_row_id TEXT,
      card_date TEXT,
      technician TEXT,
      device TEXT,
      address_text TEXT,
      card_type TEXT,
      event_type TEXT,
      gross_income REAL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ${indexes.serviceCardsOwner}
      ON ${tables.serviceCards}(owner_source_row_id);
  `;
}

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(db, key, value) {
  db.prepare(`
    INSERT INTO settings(key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function clearImportedData(db) {
  clearImportData(db, ACTIVE_IMPORT_TABLES);
}

function clearStagedImportedData(db) {
  clearImportData(db, STAGING_IMPORT_TABLES);
}

function clearImportData(db, tables) {
  db.exec(`
    DELETE FROM ${tables.importedTables};
    DELETE FROM ${tables.importedTableRows};
    DELETE FROM ${tables.peopleCache};
    DELETE FROM ${tables.serviceCards};
    DELETE FROM ${tables.importMeta};
  `);
}

function saveImportedTable(db, table) {
  saveImportedTableWithTables(db, ACTIVE_IMPORT_TABLES, table);
}

function saveStagedImportedTable(db, table) {
  saveImportedTableWithTables(db, STAGING_IMPORT_TABLES, table);
}

function saveImportedTableWithTables(db, tables, table) {
  const importedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO ${tables.importedTables}(name, row_count, columns_json, imported_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      row_count = excluded.row_count,
      columns_json = excluded.columns_json,
      imported_at = excluded.imported_at
  `).run(table.name, table.rowCount || 0, JSON.stringify(table.columns || []), importedAt);
}

function saveImportedRows(db, tableName, rows) {
  saveImportedRowsWithTables(db, ACTIVE_IMPORT_TABLES, tableName, rows);
}

function saveStagedImportedRows(db, tableName, rows) {
  saveImportedRowsWithTables(db, STAGING_IMPORT_TABLES, tableName, rows);
}

function saveImportedRowsWithTables(db, tables, tableName, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const importedAt = new Date().toISOString();
  const insertRow = db.prepare(`
    INSERT INTO ${tables.importedTableRows}(table_name, source_row_id, raw_json, search_text, imported_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  runInTransaction(db, () => {
    for (const row of rows) {
      const sourceRowId = getSourceRowId(row);
      insertRow.run(
        tableName,
        sourceRowId,
        JSON.stringify(row),
        buildSearchTextFromValues(row),
        importedAt
      );
    }
  });
}

function savePeopleRows(db, rows) {
  savePeopleRowsWithTables(db, ACTIVE_IMPORT_TABLES, rows);
}

function saveStagedPeopleRows(db, rows) {
  savePeopleRowsWithTables(db, STAGING_IMPORT_TABLES, rows);
}

function savePeopleRowsWithTables(db, tables, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const upsert = db.prepare(`
    INSERT INTO ${tables.peopleCache} (
      source_row_id,
      full_name,
      company_name,
      email,
      phone,
      address_text,
      street,
      city,
      county,
      commune,
      region,
      postal_code,
      country,
      route_address,
      lat,
      lng,
      coordinate_source,
      geocode_status,
      geocode_error,
      installed_at,
      last_visit_at,
      last_payment_at,
      planned_visit_at,
      declined_visit_at,
      device_vendor,
      device_model,
      payer_name,
      current_amount,
      total_paid,
      notes_summary,
      raw_json,
      search_text,
      imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_row_id) DO UPDATE SET
      full_name = excluded.full_name,
      company_name = excluded.company_name,
      email = excluded.email,
      phone = excluded.phone,
      address_text = excluded.address_text,
      street = excluded.street,
      city = excluded.city,
      county = excluded.county,
      commune = excluded.commune,
      region = excluded.region,
      postal_code = excluded.postal_code,
      country = excluded.country,
      route_address = excluded.route_address,
      lat = COALESCE(${tables.peopleCache}.lat, excluded.lat),
      lng = COALESCE(${tables.peopleCache}.lng, excluded.lng),
      coordinate_source = COALESCE(${tables.peopleCache}.coordinate_source, excluded.coordinate_source),
      geocode_status = CASE
        WHEN ${tables.peopleCache}.lat IS NOT NULL AND ${tables.peopleCache}.lng IS NOT NULL
          THEN ${tables.peopleCache}.geocode_status
        ELSE excluded.geocode_status
      END,
      geocode_error = excluded.geocode_error,
      installed_at = excluded.installed_at,
      last_visit_at = CASE
        WHEN ${tables.peopleCache}.last_visit_at IS NULL THEN excluded.last_visit_at
        WHEN excluded.last_visit_at IS NULL THEN ${tables.peopleCache}.last_visit_at
        ELSE MAX(${tables.peopleCache}.last_visit_at, excluded.last_visit_at)
      END,
      last_payment_at = CASE
        WHEN ${tables.peopleCache}.last_payment_at IS NULL THEN excluded.last_payment_at
        WHEN excluded.last_payment_at IS NULL THEN ${tables.peopleCache}.last_payment_at
        ELSE MAX(${tables.peopleCache}.last_payment_at, excluded.last_payment_at)
      END,
      planned_visit_at = CASE
        WHEN ${tables.peopleCache}.planned_visit_at IS NULL THEN excluded.planned_visit_at
        WHEN excluded.planned_visit_at IS NULL THEN ${tables.peopleCache}.planned_visit_at
        ELSE MAX(${tables.peopleCache}.planned_visit_at, excluded.planned_visit_at)
      END,
      declined_visit_at = CASE
        WHEN ${tables.peopleCache}.declined_visit_at IS NULL THEN excluded.declined_visit_at
        WHEN excluded.declined_visit_at IS NULL THEN ${tables.peopleCache}.declined_visit_at
        ELSE MAX(${tables.peopleCache}.declined_visit_at, excluded.declined_visit_at)
      END,
      device_vendor = excluded.device_vendor,
      device_model = excluded.device_model,
      payer_name = excluded.payer_name,
      current_amount = excluded.current_amount,
      total_paid = excluded.total_paid,
      notes_summary = excluded.notes_summary,
      raw_json = excluded.raw_json,
      search_text = excluded.search_text,
      imported_at = excluded.imported_at
  `);

  runInTransaction(db, () => {
    for (const row of rows) {
      const person = mapPersonRow(row);
      upsert.run(
        person.sourceRowId,
        person.fullName,
        person.companyName,
        person.email,
        person.phone,
        person.addressText,
        person.street,
        person.city,
        person.county,
        person.commune,
        person.region,
        person.postalCode,
        person.country,
        person.routeAddress,
        person.lat,
        person.lng,
        person.coordinateSource,
        person.geocodeStatus,
        person.geocodeError,
        person.installedAt,
        person.lastVisitAt,
        person.lastPaymentAt,
        person.plannedVisitAt,
        person.declinedVisitAt,
        person.deviceVendor,
        person.deviceModel,
        person.payerName,
        person.currentAmount,
        person.totalPaid,
        person.notesSummary,
        JSON.stringify(row),
        person.searchText,
        person.importedAt
      );
    }
  });
}

function saveServiceCards(db, rows) {
  saveServiceCardsWithTables(db, ACTIVE_IMPORT_TABLES, rows);
}

function saveStagedServiceCards(db, rows) {
  saveServiceCardsWithTables(db, STAGING_IMPORT_TABLES, rows);
}

function saveServiceCardsWithTables(db, tables, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const upsert = db.prepare(`
    INSERT INTO ${tables.serviceCards}(
      source_row_id,
      owner_source_row_id,
      card_date,
      technician,
      device,
      address_text,
      card_type,
      event_type,
      gross_income,
      raw_json,
      imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_row_id) DO UPDATE SET
      owner_source_row_id = excluded.owner_source_row_id,
      card_date = excluded.card_date,
      technician = excluded.technician,
      device = excluded.device,
      address_text = excluded.address_text,
      card_type = excluded.card_type,
      event_type = excluded.event_type,
      gross_income = excluded.gross_income,
      raw_json = excluded.raw_json,
      imported_at = excluded.imported_at
  `);

  runInTransaction(db, () => {
    for (const row of rows) {
      const mapped = mapServiceCardRow(row);
      upsert.run(
        mapped.sourceRowId,
        mapped.ownerSourceRowId,
        mapped.cardDate,
        mapped.technician,
        mapped.device,
        mapped.addressText,
        mapped.cardType,
        mapped.eventType,
        mapped.grossIncome,
        JSON.stringify(row),
        mapped.importedAt
      );
    }
  });
}

function finalizeImport(db, sourcePath) {
  finalizeImportWithTables(db, ACTIVE_IMPORT_TABLES, sourcePath);
}

function finalizeStagedImport(db, sourcePath) {
  finalizeImportWithTables(db, STAGING_IMPORT_TABLES, sourcePath);
}

function finalizeImportWithTables(db, tables, sourcePath) {
  const importedAt = new Date().toISOString();
  const tablesCount = db.prepare(`SELECT COUNT(*) AS total FROM ${tables.importedTables}`).get().total;
  const rowsCount = db.prepare(`SELECT COUNT(*) AS total FROM ${tables.importedTableRows}`).get().total;

  db.prepare(`
    INSERT INTO ${tables.importMeta}(id, source_path, imported_at, tables_count, rows_count)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_path = excluded.source_path,
      imported_at = excluded.imported_at,
      tables_count = excluded.tables_count,
      rows_count = excluded.rows_count
  `).run(sourcePath, importedAt, tablesCount, rowsCount);

  db.exec(`
    UPDATE ${tables.peopleCache}
    SET last_visit_at = (
      SELECT MAX(card_date)
      FROM ${tables.serviceCards}
      WHERE owner_source_row_id = ${tables.peopleCache}.source_row_id
    )
    WHERE EXISTS (
      SELECT 1
      FROM ${tables.serviceCards}
      WHERE owner_source_row_id = ${tables.peopleCache}.source_row_id
    );
  `);

  db.exec(`
    UPDATE ${tables.peopleCache}
    SET geocode_status = CASE
      WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 'ready'
      WHEN route_address IS NULL OR route_address = '' THEN 'missing-address'
      ELSE 'pending'
    END
  `);
}

function promoteStagedImport(db, input = {}) {
  runInTransaction(db, () => {
    db.exec('DROP TABLE IF EXISTS temp_preserved_people_coordinates;');
    db.exec(`
      CREATE TEMP TABLE temp_preserved_people_coordinates AS
      SELECT
        source_row_id,
        route_address,
        lat,
        lng,
        coordinate_source,
        geocode_status,
        geocode_error
      FROM ${ACTIVE_IMPORT_TABLES.peopleCache}
      WHERE lat IS NOT NULL AND lng IS NOT NULL;

      DELETE FROM ${ACTIVE_IMPORT_TABLES.importedTables};
      DELETE FROM ${ACTIVE_IMPORT_TABLES.importedTableRows};
      DELETE FROM ${ACTIVE_IMPORT_TABLES.peopleCache};
      DELETE FROM ${ACTIVE_IMPORT_TABLES.serviceCards};
      DELETE FROM ${ACTIVE_IMPORT_TABLES.importMeta};

      INSERT INTO ${ACTIVE_IMPORT_TABLES.importedTables}(name, row_count, columns_json, imported_at)
      SELECT name, row_count, columns_json, imported_at
      FROM ${STAGING_IMPORT_TABLES.importedTables};

      INSERT INTO ${ACTIVE_IMPORT_TABLES.importedTableRows}(
        table_name,
        source_row_id,
        raw_json,
        search_text,
        imported_at
      )
      SELECT
        table_name,
        source_row_id,
        raw_json,
        search_text,
        imported_at
      FROM ${STAGING_IMPORT_TABLES.importedTableRows};

      INSERT INTO ${ACTIVE_IMPORT_TABLES.peopleCache}(
        source_row_id,
        full_name,
        company_name,
        email,
        phone,
        address_text,
        street,
        city,
        county,
        commune,
        region,
        postal_code,
        country,
        route_address,
        lat,
        lng,
        coordinate_source,
        geocode_status,
        geocode_error,
        installed_at,
        last_visit_at,
        last_payment_at,
        planned_visit_at,
        declined_visit_at,
        device_vendor,
        device_model,
        payer_name,
        current_amount,
        total_paid,
        notes_summary,
        raw_json,
        search_text,
        imported_at
      )
      SELECT
        staging.source_row_id,
        staging.full_name,
        staging.company_name,
        staging.email,
        staging.phone,
        staging.address_text,
        staging.street,
        staging.city,
        staging.county,
        staging.commune,
        staging.region,
        staging.postal_code,
        staging.country,
        staging.route_address,
        CASE
          WHEN staging.lat IS NOT NULL AND staging.lng IS NOT NULL THEN staging.lat
          WHEN preserved.route_address = staging.route_address THEN preserved.lat
          ELSE NULL
        END,
        CASE
          WHEN staging.lat IS NOT NULL AND staging.lng IS NOT NULL THEN staging.lng
          WHEN preserved.route_address = staging.route_address THEN preserved.lng
          ELSE NULL
        END,
        CASE
          WHEN staging.lat IS NOT NULL AND staging.lng IS NOT NULL THEN staging.coordinate_source
          WHEN preserved.route_address = staging.route_address
            AND preserved.lat IS NOT NULL
            AND preserved.lng IS NOT NULL
            THEN preserved.coordinate_source
          ELSE staging.coordinate_source
        END,
        CASE
          WHEN staging.lat IS NOT NULL AND staging.lng IS NOT NULL THEN staging.geocode_status
          WHEN preserved.route_address = staging.route_address
            AND preserved.lat IS NOT NULL
            AND preserved.lng IS NOT NULL
            THEN preserved.geocode_status
          ELSE staging.geocode_status
        END,
        CASE
          WHEN staging.lat IS NOT NULL AND staging.lng IS NOT NULL THEN staging.geocode_error
          WHEN preserved.route_address = staging.route_address
            AND preserved.lat IS NOT NULL
            AND preserved.lng IS NOT NULL
            THEN preserved.geocode_error
          ELSE staging.geocode_error
        END,
        staging.installed_at,
        staging.last_visit_at,
        staging.last_payment_at,
        staging.planned_visit_at,
        staging.declined_visit_at,
        staging.device_vendor,
        staging.device_model,
        staging.payer_name,
        staging.current_amount,
        staging.total_paid,
        staging.notes_summary,
        staging.raw_json,
        staging.search_text,
        staging.imported_at
      FROM ${STAGING_IMPORT_TABLES.peopleCache} AS staging
      LEFT JOIN temp_preserved_people_coordinates AS preserved
        ON preserved.source_row_id = staging.source_row_id;

      INSERT INTO ${ACTIVE_IMPORT_TABLES.serviceCards}(
        source_row_id,
        owner_source_row_id,
        card_date,
        technician,
        device,
        address_text,
        card_type,
        event_type,
        gross_income,
        raw_json,
        imported_at
      )
      SELECT
        source_row_id,
        owner_source_row_id,
        card_date,
        technician,
        device,
        address_text,
        card_type,
        event_type,
        gross_income,
        raw_json,
        imported_at
      FROM ${STAGING_IMPORT_TABLES.serviceCards};

      INSERT INTO ${ACTIVE_IMPORT_TABLES.importMeta}(id, source_path, imported_at, tables_count, rows_count)
      SELECT id, source_path, imported_at, tables_count, rows_count
      FROM ${STAGING_IMPORT_TABLES.importMeta};
    `);

    setSetting(db, 'lastImportedAccessPath', input.sourcePath || '');
    setSetting(db, 'lastImportedAccessFingerprint', input.sourceFingerprint || '');
    clearImportData(db, STAGING_IMPORT_TABLES);
    db.exec('DROP TABLE IF EXISTS temp_preserved_people_coordinates;');
  });
}

function runInTransaction(db, callback) {
  db.exec('BEGIN');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function getDashboardSummary(db) {
  const importMeta = db.prepare(`
    SELECT source_path, imported_at, tables_count, rows_count
    FROM import_meta
    WHERE id = 1
  `).get();

  const peopleStats = db.prepare(`
    SELECT
      COUNT(*) AS total_people,
      SUM(CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 1 ELSE 0 END) AS geocoded_people,
      SUM(CASE WHEN geocode_status = 'pending' THEN 1 ELSE 0 END) AS pending_geocodes
    FROM people_cache
  `).get();

  const noteStats = db.prepare(`
    SELECT COUNT(*) AS total_notes
    FROM local_notes
  `).get();

  const tableStats = db.prepare(`
    SELECT COUNT(*) AS total_tables
    FROM imported_tables
  `).get();

  const cardsStats = db.prepare(`
    SELECT COUNT(*) AS total_cards
    FROM service_cards
  `).get();

  return {
    importMeta: importMeta || null,
    stats: {
      totalTables: Number(tableStats.total_tables || 0),
      totalRows: Number(importMeta?.rows_count || 0),
      totalPeople: Number(peopleStats.total_people || 0),
      geocodedPeople: Number(peopleStats.geocoded_people || 0),
      pendingGeocodes: Number(peopleStats.pending_geocodes || 0),
      totalServiceCards: Number(cardsStats.total_cards || 0),
      totalNotes: Number(noteStats.total_notes || 0),
      totalCustomPoints: Number(
        db.prepare('SELECT COUNT(*) AS total FROM custom_points').get().total || 0
      )
    },
    settings: {
      accessDbPath: getSetting(db, 'accessDbPath'),
      googleMapsApiKey: getSetting(db, 'googleMapsApiKey')
    }
  };
}

function getImportTables(db) {
  const rows = db.prepare(`
    SELECT name, row_count AS rowCount, columns_json AS columnsJson, imported_at AS importedAt
    FROM imported_tables
    ORDER BY name COLLATE NOCASE ASC
  `).all();

  return rows.map((row) => ({
    name: row.name,
    rowCount: Number(row.rowCount || 0),
    importedAt: row.importedAt,
    columns: safeJsonParse(row.columnsJson, [])
  }));
}

function getTableRows(db, input = {}) {
  const tableName = input.tableName || PEOPLE_TABLE;
  const query = (input.query || '').trim().toLowerCase();
  const page = Math.max(1, Number(input.page || 1));
  const pageSize = Math.min(200, Math.max(10, Number(input.pageSize || 25)));
  const offset = (page - 1) * pageSize;

  const countQuery = query
    ? db.prepare(`
        SELECT COUNT(*) AS total
        FROM imported_table_rows
        WHERE table_name = ? AND search_text LIKE ?
      `)
    : db.prepare(`
        SELECT COUNT(*) AS total
        FROM imported_table_rows
        WHERE table_name = ?
      `);

  const rowsQuery = query
    ? db.prepare(`
        SELECT id, table_name AS tableName, source_row_id AS sourceRowId, raw_json AS rawJson
        FROM imported_table_rows
        WHERE table_name = ? AND search_text LIKE ?
        ORDER BY id ASC
        LIMIT ? OFFSET ?
      `)
    : db.prepare(`
        SELECT id, table_name AS tableName, source_row_id AS sourceRowId, raw_json AS rawJson
        FROM imported_table_rows
        WHERE table_name = ?
        ORDER BY id ASC
        LIMIT ? OFFSET ?
      `);

  const searchValue = `%${query}%`;
  const total = query
    ? countQuery.get(tableName, searchValue).total
    : countQuery.get(tableName).total;
  const rows = query
    ? rowsQuery.all(tableName, searchValue, pageSize, offset)
    : rowsQuery.all(tableName, pageSize, offset);

  return {
    tableName,
    page,
    pageSize,
    total: Number(total || 0),
    rows: rows.map((row) => ({
      id: row.id,
      tableName: row.tableName,
      sourceRowId: row.sourceRowId,
      data: safeJsonParse(row.rawJson, {})
    }))
  };
}

function listPeople(db, input = {}) {
  const query = (input.query || '').trim();
  const limit = Math.min(500, Math.max(25, Number(input.limit || 100)));
  const searchPatterns = buildPeopleSearchPatterns(query);
  const searchExpression = `
    LOWER(
      COALESCE(search_text, '') || ' ' ||
      COALESCE(raw_json, '') || ' ' ||
      COALESCE(full_name, '') || ' ' ||
      COALESCE(company_name, '') || ' ' ||
      COALESCE(city, '') || ' ' ||
      COALESCE(address_text, '') || ' ' ||
      COALESCE(route_address, '') || ' ' ||
      COALESCE(phone, '') || ' ' ||
      COALESCE(email, '') || ' ' ||
      COALESCE(installed_at, '') || ' ' ||
      COALESCE(last_visit_at, '') || ' ' ||
      COALESCE(last_payment_at, '') || ' ' ||
      COALESCE(planned_visit_at, '') || ' ' ||
      COALESCE(declined_visit_at, '') || ' ' ||
      COALESCE(notes_summary, '')
    )
  `;

  const sql = searchPatterns.length
    ? `
      SELECT
        source_row_id AS sourceRowId,
        full_name AS fullName,
        company_name AS companyName,
        city,
        address_text AS addressText,
        route_address AS routeAddress,
        phone,
        email,
        lat,
        lng,
        geocode_status AS geocodeStatus,
        last_visit_at AS lastVisitAt,
        last_payment_at AS lastPaymentAt,
        planned_visit_at AS plannedVisitAt,
        total_paid AS totalPaid
      FROM people_cache
      WHERE ${searchPatterns.map(() => `${searchExpression} LIKE ?`).join(' OR ')}
      ORDER BY full_name COLLATE NOCASE ASC
      LIMIT ?
    `
    : `
      SELECT
        source_row_id AS sourceRowId,
        full_name AS fullName,
        company_name AS companyName,
        city,
        address_text AS addressText,
        route_address AS routeAddress,
        phone,
        email,
        lat,
        lng,
        geocode_status AS geocodeStatus,
        last_visit_at AS lastVisitAt,
        last_payment_at AS lastPaymentAt,
        planned_visit_at AS plannedVisitAt,
        total_paid AS totalPaid
      FROM people_cache
      ORDER BY full_name COLLATE NOCASE ASC
      LIMIT ?
    `;

  const rows = searchPatterns.length
    ? db.prepare(sql).all(...searchPatterns, limit)
    : db.prepare(sql).all(limit);

  return rows.map(normalizePeopleRow);
}

function getPersonDetails(db, sourceRowId) {
  const person = db.prepare(`
    SELECT *
    FROM people_cache
    WHERE source_row_id = ?
  `).get(sourceRowId);

  if (!person) {
    return null;
  }

  const serviceCards = db.prepare(`
    SELECT
      source_row_id AS sourceRowId,
      card_date AS cardDate,
      technician,
      device,
      address_text AS addressText,
      card_type AS cardType,
      event_type AS eventType,
      gross_income AS grossIncome,
      raw_json AS rawJson
    FROM service_cards
    WHERE owner_source_row_id = ?
    ORDER BY card_date DESC
    LIMIT 50
  `).all(sourceRowId);

  return {
    person: {
      ...normalizePeopleRow(person),
      raw: safeJsonParse(person.raw_json, {})
    },
    serviceCards: serviceCards.map((row) => ({
      sourceRowId: row.sourceRowId,
      cardDate: row.cardDate,
      technician: row.technician,
      device: row.device,
      addressText: row.addressText,
      cardType: row.cardType,
      eventType: row.eventType,
      grossIncome: row.grossIncome,
      raw: safeJsonParse(row.rawJson, {})
    })),
    notes: listNotes(db, 'person', sourceRowId)
  };
}

function listMapPoints(db, input = {}) {
  const query = (input.query || '').trim().toLowerCase();
  const includeUnresolved = Boolean(input.includeUnresolved);
  const whereFragments = [];
  const params = [];

  if (!includeUnresolved) {
    whereFragments.push('lat IS NOT NULL AND lng IS NOT NULL');
  }

  if (query) {
    whereFragments.push('search_text LIKE ?');
    params.push(`%${query}%`);
  }

  const whereClause = whereFragments.length > 0 ? `WHERE ${whereFragments.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT
      source_row_id AS sourceRowId,
      full_name AS fullName,
      company_name AS companyName,
      address_text AS addressText,
      route_address AS routeAddress,
      city,
      region,
      phone,
      email,
      lat,
      lng,
      geocode_status AS geocodeStatus,
      coordinate_source AS coordinateSource,
      last_visit_at AS lastVisitAt,
      last_payment_at AS lastPaymentAt,
      planned_visit_at AS plannedVisitAt,
      total_paid AS totalPaid
    FROM people_cache
    ${whereClause}
    ORDER BY full_name COLLATE NOCASE ASC
  `).all(...params);

  return {
    people: filterPeopleByDateRange(rows.map(normalizePeopleRow), input),
    customPoints: listCustomPoints(db)
  };
}

function listPendingGeocodes(db, limit = 50) {
  return db.prepare(`
    SELECT
      source_row_id AS sourceRowId,
      full_name AS fullName,
      route_address AS routeAddress
    FROM people_cache
    WHERE geocode_status = 'pending'
      AND route_address IS NOT NULL
      AND route_address != ''
    ORDER BY full_name COLLATE NOCASE ASC
    LIMIT ?
  `).all(Math.max(1, Number(limit || 50)));
}

function updatePersonCoordinates(db, payload) {
  db.prepare(`
    UPDATE people_cache
    SET
      lat = ?,
      lng = ?,
      coordinate_source = ?,
      geocode_status = ?,
      geocode_error = ?
    WHERE source_row_id = ?
  `).run(
    payload.lat,
    payload.lng,
    payload.coordinateSource,
    payload.geocodeStatus,
    payload.geocodeError || null,
    payload.sourceRowId
  );
}

function addNote(db, payload) {
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO local_notes(entity_type, entity_id, message, created_at)
    VALUES (?, ?, ?, ?)
  `).run(payload.entityType, payload.entityId, payload.message.trim(), createdAt);

  return listNotes(db, payload.entityType, payload.entityId);
}

function listNotes(db, entityType, entityId) {
  return db.prepare(`
    SELECT id, entity_type AS entityType, entity_id AS entityId, message, created_at AS createdAt
    FROM local_notes
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at DESC
  `).all(entityType, entityId);
}

function addCustomPoint(db, payload) {
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO custom_points(label, address_text, lat, lng, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(payload.label.trim(), payload.addressText || null, payload.lat, payload.lng, createdAt);

  return listCustomPoints(db);
}

function listCustomPoints(db) {
  return db.prepare(`
    SELECT id, label, address_text AS addressText, lat, lng, created_at AS createdAt
    FROM custom_points
    ORDER BY created_at DESC
  `).all();
}

function buildRoute(db, input = {}) {
  const originLat = Number(input.originLat);
  const originLng = Number(input.originLng);
  if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
    throw new Error('Brak poprawnych wspolrzednych startowych dla trasy.');
  }

  const weights = {
    distance: Number(input.distanceWeight || 0.8),
    lastVisit: Number(input.lastVisitWeight || 1)
  };
  const limit = Math.min(50, Math.max(3, Number(input.limit || 12)));
  const candidates = filterPeopleByDateRange(
    listPeople(db, { query: input.query || '', limit: 1000 }).filter(
      (row) => Number.isFinite(row.lat) && Number.isFinite(row.lng)
    ),
    input
  );

  const scored = candidates.map((row) => {
    const distanceKm = haversineKm(originLat, originLng, row.lat, row.lng);
    const daysSinceVisit = getDaysSince(row.lastVisitAt);
    const routeScore = daysSinceVisit * weights.lastVisit - distanceKm * weights.distance;

    return {
      ...row,
      distanceKm,
      daysSinceVisit,
      routeScore
    };
  });

  scored.sort((left, right) => right.routeScore - left.routeScore);
  const selected = scored.slice(0, limit);

  const ordered = [];
  let currentLat = originLat;
  let currentLng = originLng;
  const pool = [...selected];

  while (pool.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < pool.length; index++) {
      const distance = haversineKm(currentLat, currentLng, pool[index].lat, pool[index].lng);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    const [nextPoint] = pool.splice(bestIndex, 1);
    ordered.push({
      ...nextPoint,
      hopDistanceKm: bestDistance
    });
    currentLat = nextPoint.lat;
    currentLng = nextPoint.lng;
  }

  return {
    origin: { lat: originLat, lng: originLng },
    total: ordered.length,
    points: ordered
  };
}

function filterPeopleByDateRange(rows, input = {}) {
  const field = normalizeDateField(input.dateField);
  let from = normalizeDateOnly(input.dateFrom);
  let to = normalizeDateOnly(input.dateTo);

  if (!from && !to) {
    return rows;
  }

  if (from && to && from > to) {
    [from, to] = [to, from];
  }

  return rows.filter((row) => {
    const value = normalizeDateOnly(row?.[field]);
    if (!value) {
      return false;
    }
    if (from && value < from) {
      return false;
    }
    if (to && value > to) {
      return false;
    }
    return true;
  });
}

function getExportReports(db) {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    dashboardSummary: getDashboardSummary(db),
    importTables: getImportTables(db),
    mapData: listMapPoints(db, { includeUnresolved: true }),
    people: db.prepare(`
      SELECT
        source_row_id AS sourceRowId,
        full_name AS fullName,
        company_name AS companyName,
        city,
        address_text AS addressText,
        route_address AS routeAddress,
        phone,
        email,
        lat,
        lng,
        geocode_status AS geocodeStatus,
        last_visit_at AS lastVisitAt,
        last_payment_at AS lastPaymentAt,
        planned_visit_at AS plannedVisitAt,
        total_paid AS totalPaid
      FROM people_cache
      ORDER BY full_name COLLATE NOCASE ASC
    `).all().map(normalizePeopleRow),
    notes: db.prepare(`
      SELECT id, entity_type AS entityType, entity_id AS entityId, message, created_at AS createdAt
      FROM local_notes
      ORDER BY created_at DESC
    `).all(),
    googleMapReport: db.prepare(`
      SELECT
        source_row_id AS sourceRowId,
        full_name AS fullName,
        route_address AS routeAddress,
        lat,
        lng,
        geocode_status AS geocodeStatus,
        coordinate_source AS coordinateSource,
        geocode_error AS geocodeError,
        last_visit_at AS lastVisitAt
      FROM people_cache
      ORDER BY full_name COLLATE NOCASE ASC
    `).all().map(normalizePeopleRowForExport),
    serviceCards: db.prepare(`
      SELECT
        source_row_id AS sourceRowId,
        owner_source_row_id AS ownerSourceRowId,
        card_date AS cardDate,
        technician,
        device,
        address_text AS addressText,
        card_type AS cardType,
        event_type AS eventType,
        gross_income AS grossIncome
      FROM service_cards
      ORDER BY card_date DESC
    `).all()
  };
}

function mapPersonRow(row) {
  const importedAt = new Date().toISOString();
  const fullName = [pickValue(row, 'Imię'), pickValue(row, 'Nazwisko')].filter(Boolean).join(' ').trim();
  const addressText = joinParts(
    pickValue(row, 'Adres'),
    pickValue(row, 'Ulica'),
    pickValue(row, 'Kod pocztowy'),
    pickValue(row, 'Miejscowość'),
    pickValue(row, 'Gmina'),
    pickValue(row, 'Powiat'),
    pickValue(row, 'Województwo')
  );
  const routeAddress = joinParts(
    pickValue(row, 'Ulica') || pickValue(row, 'Adres'),
    joinParts(pickValue(row, 'Kod pocztowy'), pickValue(row, 'Miejscowość')),
    pickValue(row, 'Powiat'),
    pickValue(row, 'Województwo'),
    'Polska'
  );
  const lat = toNumber(row.lat || row.Lat || row.latitude || row.Latitude);
  const lng = toNumber(row.lng || row.Lng || row.longitude || row.Longitude);

  const person = {
    sourceRowId: getSourceRowId(row),
    fullName: fullName || pickValue(row, 'Firma') || 'Bez nazwy',
    companyName: pickValue(row, 'Firma'),
    email: pickValue(row, 'Adres e-mail'),
    phone: joinParts(
      pickValue(row, 'Telefon komórkowy'),
      pickValue(row, 'Telefon służbowy'),
      pickValue(row, 'Telefon domowy')
    ),
    addressText,
    street: pickValue(row, 'Ulica'),
    city: pickValue(row, 'Miejscowość'),
    county: pickValue(row, 'Powiat'),
    commune: pickValue(row, 'Gmina'),
    region: pickValue(row, 'Województwo'),
    postalCode: pickValue(row, 'Kod pocztowy'),
    country: pickValue(row, 'Kraj/region') || 'Polska',
    routeAddress,
    lat,
    lng,
    coordinateSource: lat != null && lng != null ? 'access' : null,
    geocodeStatus: lat != null && lng != null ? 'ready' : routeAddress ? 'pending' : 'missing-address',
    geocodeError: null,
    installedAt: normalizeDate(pickValue(row, 'Data montaźu')),
    lastVisitAt: normalizeDate(pickValue(row, 'Data ost wizy')),
    lastPaymentAt: normalizeDate(pickValue(row, 'Data os płatnści')),
    plannedVisitAt: normalizeDate(pickValue(row, 'Nast Wizyta  plan')),
    declinedVisitAt: normalizeDate(pickValue(row, 'Data odmowy wizyty planowej')),
    deviceVendor: pickValue(row, 'Producent'),
    deviceModel: pickValue(row, 'Model'),
    payerName: pickValue(row, 'Płatnik'),
    currentAmount: toNumber(pickValue(row, 'Kwota')),
    totalPaid: toNumber(pickValue(row, 'Suma wpłat')),
    notesSummary: stripHtml(pickValue(row, 'Uwagi')),
    importedAt
  };

  return {
    ...person,
    searchText: buildPersonSearchText(person, row)
  };
}

function mapServiceCardRow(row) {
  return {
    sourceRowId: getSourceRowId(row),
    ownerSourceRowId: stringifyId(pickValue(row, 'IDNazwisko')),
    cardDate: normalizeDate(pickValue(row, 'Datakarty')),
    technician: pickValue(row, 'Serwisant'),
    device: pickValue(row, 'Urządzenie'),
    addressText: pickValue(row, 'Adres'),
    cardType: pickValue(row, 'Rodzaj') || pickValue(row, 'Typ Karty'),
    eventType: pickValue(row, 'Typ zdarzenia'),
    grossIncome: toNumber(pickValue(row, 'Dochódbrutto')),
    importedAt: new Date().toISOString()
  };
}

function normalizePeopleRow(row) {
  return {
    sourceRowId: stringifyId(row.sourceRowId || row.source_row_id),
    fullName: row.fullName || row.full_name || null,
    companyName: row.companyName || row.company_name || null,
    city: row.city || null,
    addressText: row.addressText || row.address_text || null,
    routeAddress: row.routeAddress || row.route_address || null,
    phone: row.phone || null,
    email: row.email || null,
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    geocodeStatus: row.geocodeStatus || row.geocode_status || null,
    coordinateSource: row.coordinateSource || row.coordinate_source || null,
    lastVisitAt: row.lastVisitAt || row.last_visit_at || null,
    lastPaymentAt: row.lastPaymentAt || row.last_payment_at || null,
    plannedVisitAt: row.plannedVisitAt || row.planned_visit_at || null,
    totalPaid: row.totalPaid == null ? null : Number(row.totalPaid)
  };
}

function normalizePeopleRowForExport(row) {
  return {
    sourceRowId: stringifyId(row.sourceRowId || row.source_row_id),
    fullName: row.fullName || row.full_name || null,
    routeAddress: row.routeAddress || row.route_address || null,
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    geocodeStatus: row.geocodeStatus || row.geocode_status || null,
    coordinateSource: row.coordinateSource || row.coordinate_source || null,
    geocodeError: row.geocodeError || row.geocode_error || null,
    lastVisitAt: row.lastVisitAt || row.last_visit_at || null
  };
}

function pickValue(row, key) {
  if (!row || typeof row !== 'object') {
    return null;
  }
  return row[key] == null ? null : row[key];
}

function getSourceRowId(row) {
  const candidates = [
    row?.ID,
    row?.Identyfikator,
    row?.id,
    row?.Id,
    row?.Nr,
    row?.nr
  ];

  for (const candidate of candidates) {
    const value = stringifyId(candidate);
    if (value) {
      return value;
    }
  }

  return buildSearchTextFromValues(row).slice(0, 120);
}

function stringifyId(value) {
  if (value == null || value === '') {
    return null;
  }
  return String(value);
}

function buildSearchTextFromValues(value) {
  if (value == null) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.map((entry) => buildSearchTextFromValues(entry)).join(' ').trim().toLowerCase();
  }

  if (typeof value === 'object') {
    return Object.values(value)
      .map((entry) => buildSearchTextFromValues(entry))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
}

function buildPeopleSearchPatterns(query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const patterns = new Set([normalizedQuery]);
  const normalizedDate = normalizeLooseDateQuery(normalizedQuery);

  if (normalizedDate) {
    for (const variant of buildSearchableDateVariants(normalizedDate)) {
      patterns.add(variant);
    }
  }

  return Array.from(patterns, (pattern) => `%${pattern}%`);
}

function normalizeLooseDateQuery(value) {
  const match = String(value || '')
    .trim()
    .match(/^(\d{1,4})[.\-/](\d{1,2})[.\-/](\d{1,4})$/);

  if (!match) {
    return null;
  }

  let year = null;
  let month = null;
  let day = null;

  if (match[1].length === 4) {
    year = match[1];
    month = match[2];
    day = match[3];
  } else if (match[3].length === 4) {
    day = match[1];
    month = match[2];
    year = match[3];
  } else {
    return null;
  }

  const normalized = normalizeDate(`${year}-${month}-${day}`);
  return normalized ? normalized.slice(0, 10) : null;
}

function buildPersonSearchText(person, row) {
  return buildSearchTextFromValues([
    row,
    person,
    buildSearchableDateVariants(person.installedAt),
    buildSearchableDateVariants(person.lastVisitAt),
    buildSearchableDateVariants(person.lastPaymentAt),
    buildSearchableDateVariants(person.plannedVisitAt),
    buildSearchableDateVariants(person.declinedVisitAt)
  ]);
}

function buildSearchableDateVariants(value) {
  const normalized = normalizeDate(value);
  if (!normalized) {
    return [];
  }

  const dateOnly = normalized.slice(0, 10);
  const [year, month, day] = dateOnly.split('-');

  return [
    normalized,
    dateOnly,
    `${day}.${month}.${year}`,
    `${day}-${month}-${year}`,
    `${day}/${month}/${year}`
  ];
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function joinParts(...parts) {
  const unique = [];
  for (const part of parts) {
    const normalized = part == null ? '' : String(part).trim();
    if (!normalized) {
      continue;
    }
    if (!unique.includes(normalized)) {
      unique.push(normalized);
    }
  }
  return unique.join(', ');
}

function stripHtml(value) {
  if (!value) {
    return null;
  }
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function normalizeDateOnly(value) {
  const normalized = normalizeDate(value);
  return normalized ? normalized.slice(0, 10) : null;
}

function normalizeDateField(value) {
  const allowed = new Set(['lastVisitAt', 'lastPaymentAt', 'plannedVisitAt']);
  return allowed.has(value) ? value : 'lastVisitAt';
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const radiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusKm * c;
}

function getDaysSince(value) {
  if (!value) {
    return 999;
  }
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) {
    return 999;
  }
  const diffMs = Date.now() - then;
  return Math.max(0, Math.round(diffMs / 86400000));
}

module.exports = {
  PEOPLE_TABLE,
  SERVICE_TABLE,
  createDataStore
};
