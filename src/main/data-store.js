const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PEOPLE_TABLE = 'PC Dane właściciela i pompy';
const SERVICE_TABLE = 'Karta serwisowa';

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
    getSetting: (key) => getSetting(db, key),
    setSetting: (key, value) => setSetting(db, key, value),
    clearImportedData: () => clearImportedData(db),
    saveImportedTable: (table) => saveImportedTable(db, table),
    saveImportedRows: (tableName, rows) => saveImportedRows(db, tableName, rows),
    savePeopleRows: (rows) => savePeopleRows(db, rows),
    saveServiceCards: (rows) => saveServiceCards(db, rows),
    finalizeImport: (sourcePath) => finalizeImport(db, sourcePath),
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
    buildRoute: (input) => buildRoute(db, input)
  };
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS import_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      source_path TEXT,
      imported_at TEXT,
      tables_count INTEGER DEFAULT 0,
      rows_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS imported_tables (
      name TEXT PRIMARY KEY,
      row_count INTEGER DEFAULT 0,
      columns_json TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS imported_table_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      source_row_id TEXT,
      raw_json TEXT NOT NULL,
      search_text TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_imported_table_rows_table_name
      ON imported_table_rows(table_name);

    CREATE INDEX IF NOT EXISTS idx_imported_table_rows_source_row_id
      ON imported_table_rows(source_row_id);

    CREATE TABLE IF NOT EXISTS people_cache (
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

    CREATE INDEX IF NOT EXISTS idx_people_cache_search_text
      ON people_cache(search_text);

    CREATE INDEX IF NOT EXISTS idx_people_cache_coordinates
      ON people_cache(lat, lng);

    CREATE TABLE IF NOT EXISTS service_cards (
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

    CREATE INDEX IF NOT EXISTS idx_service_cards_owner
      ON service_cards(owner_source_row_id);

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
  db.exec(`
    DELETE FROM imported_tables;
    DELETE FROM imported_table_rows;
    DELETE FROM people_cache;
    DELETE FROM service_cards;
    DELETE FROM import_meta;
  `);
}

function saveImportedTable(db, table) {
  const importedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO imported_tables(name, row_count, columns_json, imported_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      row_count = excluded.row_count,
      columns_json = excluded.columns_json,
      imported_at = excluded.imported_at
  `).run(table.name, table.rowCount || 0, JSON.stringify(table.columns || []), importedAt);
}

function saveImportedRows(db, tableName, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const importedAt = new Date().toISOString();
  const insertRow = db.prepare(`
    INSERT INTO imported_table_rows(table_name, source_row_id, raw_json, search_text, imported_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
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
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function savePeopleRows(db, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const upsert = db.prepare(`
    INSERT INTO people_cache (
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
      lat = COALESCE(people_cache.lat, excluded.lat),
      lng = COALESCE(people_cache.lng, excluded.lng),
      coordinate_source = COALESCE(people_cache.coordinate_source, excluded.coordinate_source),
      geocode_status = CASE
        WHEN people_cache.lat IS NOT NULL AND people_cache.lng IS NOT NULL THEN people_cache.geocode_status
        ELSE excluded.geocode_status
      END,
      geocode_error = excluded.geocode_error,
      installed_at = excluded.installed_at,
      last_visit_at = CASE
        WHEN people_cache.last_visit_at IS NULL THEN excluded.last_visit_at
        WHEN excluded.last_visit_at IS NULL THEN people_cache.last_visit_at
        ELSE MAX(people_cache.last_visit_at, excluded.last_visit_at)
      END,
      last_payment_at = CASE
        WHEN people_cache.last_payment_at IS NULL THEN excluded.last_payment_at
        WHEN excluded.last_payment_at IS NULL THEN people_cache.last_payment_at
        ELSE MAX(people_cache.last_payment_at, excluded.last_payment_at)
      END,
      planned_visit_at = CASE
        WHEN people_cache.planned_visit_at IS NULL THEN excluded.planned_visit_at
        WHEN excluded.planned_visit_at IS NULL THEN people_cache.planned_visit_at
        ELSE MAX(people_cache.planned_visit_at, excluded.planned_visit_at)
      END,
      declined_visit_at = CASE
        WHEN people_cache.declined_visit_at IS NULL THEN excluded.declined_visit_at
        WHEN excluded.declined_visit_at IS NULL THEN people_cache.declined_visit_at
        ELSE MAX(people_cache.declined_visit_at, excluded.declined_visit_at)
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

  db.exec('BEGIN');
  try {
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
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function saveServiceCards(db, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const upsert = db.prepare(`
    INSERT INTO service_cards(
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

  db.exec('BEGIN');
  try {
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
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function finalizeImport(db, sourcePath) {
  const importedAt = new Date().toISOString();
  const tablesCount = db.prepare('SELECT COUNT(*) AS total FROM imported_tables').get().total;
  const rowsCount = db.prepare('SELECT COUNT(*) AS total FROM imported_table_rows').get().total;

  db.prepare(`
    INSERT INTO import_meta(id, source_path, imported_at, tables_count, rows_count)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_path = excluded.source_path,
      imported_at = excluded.imported_at,
      tables_count = excluded.tables_count,
      rows_count = excluded.rows_count
  `).run(sourcePath, importedAt, tablesCount, rowsCount);

  db.exec(`
    UPDATE people_cache
    SET last_visit_at = (
      SELECT MAX(card_date)
      FROM service_cards
      WHERE owner_source_row_id = people_cache.source_row_id
    )
    WHERE EXISTS (
      SELECT 1
      FROM service_cards
      WHERE owner_source_row_id = people_cache.source_row_id
    );
  `);

  db.exec(`
    UPDATE people_cache
    SET geocode_status = CASE
      WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 'ready'
      WHEN route_address IS NULL OR route_address = '' THEN 'missing-address'
      ELSE 'pending'
    END
  `);
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
  const query = (input.query || '').trim().toLowerCase();
  const limit = Math.min(500, Math.max(25, Number(input.limit || 100)));

  const sql = query
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
      WHERE search_text LIKE ?
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

  const rows = query
    ? db.prepare(sql).all(`%${query}%`, limit)
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
    people: rows.map(normalizePeopleRow),
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
    lastVisit: Number(input.lastVisitWeight || 1),
    lastPayment: Number(input.lastPaymentWeight || 1.2)
  };
  const limit = Math.min(50, Math.max(3, Number(input.limit || 12)));
  const candidates = listPeople(db, { query: input.query || '', limit: 1000 }).filter(
    (row) => Number.isFinite(row.lat) && Number.isFinite(row.lng)
  );

  const scored = candidates.map((row) => {
    const distanceKm = haversineKm(originLat, originLng, row.lat, row.lng);
    const daysSinceVisit = getDaysSince(row.lastVisitAt);
    const daysSincePayment = getDaysSince(row.lastPaymentAt);
    const routeScore =
      daysSinceVisit * weights.lastVisit +
      daysSincePayment * weights.lastPayment -
      distanceKm * weights.distance;

    return {
      ...row,
      distanceKm,
      daysSinceVisit,
      daysSincePayment,
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

  return {
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
    searchText: buildSearchTextFromValues({
      ...row,
      fullName,
      routeAddress
    }),
    importedAt
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
