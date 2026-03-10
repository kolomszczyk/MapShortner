import {
  escapeHtml,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  initShell,
  renderKeyValueList,
  summarizePath
} from './app-shell.js';
import { initDashboardPanel } from './dashboard-panel.js';

initShell('map');

const mapEl = document.getElementById('service-map');
const mapBoardEl = document.querySelector('.map-board');
const mapContentGroupEl = document.querySelector('.map-content-group');
const mapInfoPanelEl = document.querySelector('.map-info-panel');
const settingsButtonEl = document.querySelector('.settings-gear-button');
const statsButtonEl = document.querySelector('[data-map-tool="stats"]');
const selectionButtonEl = document.querySelector('[data-map-tool="selection"]');
const overviewViewEl = document.querySelector('[data-map-view="overview"]');
const settingsViewEl = document.querySelector('[data-map-view="settings"]');
const overviewAccessPathEl = document.querySelector('[data-map-overview-access-path]');
const overviewImportedAtEl = document.querySelector('[data-map-overview-imported-at]');
const overviewDefaultEls = document.querySelectorAll('[data-map-overview-default]');
const selectionHeaderEl = document.querySelector('[data-map-selection-header]');
const selectionTitleEl = document.querySelector('[data-map-selection-title]');
const selectionCopyEl = document.querySelector('[data-map-selection-copy]');
const selectionMetaEl = document.querySelector('[data-map-selection-meta]');
const selectionExtraEl = document.querySelector('[data-map-selection-extra]');

const DEFAULT_PERSON_MARKER_STYLE = {
  radius: 7,
  color: '#23412e',
  weight: 2,
  fillColor: '#4db06f',
  fillOpacity: 0.9
};
const ACTIVE_PERSON_MARKER_STYLE = {
  radius: 9,
  color: '#7f3512',
  weight: 3,
  fillColor: '#f1a167',
  fillOpacity: 1
};

const POLAND_BOUNDS = [
  [49.0, 14.1],
  [54.9, 24.2]
];

const MARKER_BATCH_SIZE = 250;
const VISIBLE_BOUNDS_PADDING = 0.08;
const TILE_URL_TEMPLATE = 'maptiles://tiles/{z}/{x}/{y}.png';
const MIN_WHEEL_ZOOM_SNAP = 0.05;
const WHEEL_LINE_HEIGHT_PX = 18;
const WHEEL_PAGE_HEIGHT_FACTOR = 0.85;
const WHEEL_ZOOM_MULTIPLIER = 5;
const BUTTON_ZOOM_STEP = 1;
const HOVER_POPUP_DELAY_MS = 400;
const LAST_SELECTED_PERSON_STORAGE_KEY = 'map:lastSelectedPersonId';
const PERSON_SELECTION_HISTORY_STORAGE_KEY = 'map:personSelectionHistory';
const PERSON_SELECTION_HISTORY_STATE_KIND = 'map-person-selection';

let mapInstance;
let peopleLayer;
let customLayer;
let personRenderer;
let allPeople = [];
let allCustomPoints = [];
let visiblePeopleMarkers = new Map();
let visibleCustomMarkers = new Map();
let markerSyncGeneration = 0;
let resizeTimer;
let isSettingsOpen = false;
let activeSelection = null;
let selectionRequestToken = 0;
let infoPanelMode = 'selection';
let selectionPanelState = {
  kind: 'empty'
};
let latestOverviewSummary = null;
let personSelectionHistory = {
  entries: [],
  index: -1
};
let isPersonSelectionHistoryReady = false;

settingsButtonEl?.addEventListener('click', () => {
  toggleSettingsPanel();
});

statsButtonEl?.addEventListener('click', () => {
  if (isSettingsOpen) {
    toggleSettingsPanel(false);
  }
  setInfoPanelMode('stats');
});

selectionButtonEl?.addEventListener('click', () => {
  if (isSettingsOpen) {
    toggleSettingsPanel(false);
  }
  setInfoPanelMode('selection');
});

window.addEventListener('popstate', (event) => {
  handlePersonSelectionPopState(event);
});

window.addEventListener('mouseup', (event) => {
  handleMouseHistoryNavigation(event);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isSettingsOpen) {
    toggleSettingsPanel(false);
  }
});

window.appApi.onOperationStatus(async (payload) => {
  if (
    payload?.status === 'completed' &&
    (payload.type === 'import' || payload.type === 'trasa-import' || payload.type === 'geocoding')
  ) {
    await loadPoints();
  }
});

syncInfoToolButtons();
renderEmptySelection();
bootstrap();

async function bootstrap() {
  const bootstrapData = await window.appApi.getBootstrap();
  renderOverviewSummary(bootstrapData.summary);
  initDashboardPanel({
    root: settingsViewEl,
    bootstrapData,
    onSummaryUpdated: renderOverviewSummary,
    readyMessage: 'Panel dashboardu na mapie gotowy.'
  });
  buildMap();
  requestAnimationFrame(() => {
    loadPoints().catch((error) => {
      console.error('Map points load failed', error);
    });
  });
}

function toggleSettingsPanel(forceState = !isSettingsOpen) {
  isSettingsOpen = Boolean(forceState);

  overviewViewEl.hidden = isSettingsOpen;
  settingsViewEl.hidden = !isSettingsOpen;
  overviewViewEl.classList.toggle('map-info-view-active', !isSettingsOpen);
  settingsViewEl.classList.toggle('map-info-view-active', isSettingsOpen);
  mapBoardEl?.classList.toggle('is-settings-open', isSettingsOpen);
  mapContentGroupEl?.classList.toggle('is-settings-open', isSettingsOpen);
  mapInfoPanelEl?.classList.toggle('is-settings-open', isSettingsOpen);
  settingsButtonEl?.classList.toggle('is-active', isSettingsOpen);
  settingsButtonEl?.setAttribute('aria-pressed', String(isSettingsOpen));

  requestAnimationFrame(() => {
    mapInstance?.invalidateSize();
  });
}

function renderOverviewSummary(summary) {
  latestOverviewSummary = summary || null;

  const statMap = {
    totalPeople: summary?.stats?.totalPeople,
    geocodedPeople: summary?.stats?.geocodedPeople,
    pendingGeocodes: summary?.stats?.pendingGeocodes,
    totalCustomPoints: summary?.stats?.totalCustomPoints
  };

  Object.entries(statMap).forEach(([key, value]) => {
    document.querySelectorAll(`[data-map-overview-stat="${key}"]`).forEach((target) => {
      target.textContent = formatNumber(value || 0);
    });
  });

  if (overviewAccessPathEl) {
    overviewAccessPathEl.textContent = summarizePath(
      summary?.settings?.accessDbPath || summary?.importMeta?.source_path
    );
  }

  if (overviewImportedAtEl) {
    overviewImportedAtEl.textContent = summary?.importMeta?.imported_at
      ? formatDateTime(summary.importMeta.imported_at)
      : 'Jeszcze nie importowano';
  }

  if (infoPanelMode === 'stats') {
    paintStatsSelection(summary);
  }
}

function buildMap() {
  if (typeof L === 'undefined') {
    mapEl.innerHTML = `
      <div class="map-error">
        Nie udalo sie zaladowac biblioteki mapy.
      </div>
    `;
    return;
  }

  mapInstance = L.map(mapEl, {
    attributionControl: false,
    preferCanvas: true,
    zoomControl: true,
    scrollWheelZoom: false,
    zoomSnap: MIN_WHEEL_ZOOM_SNAP,
    zoomDelta: BUTTON_ZOOM_STEP,
    minZoom: 2,
    maxZoom: 18
  });
  personRenderer = L.canvas({ padding: 0.5 });

  mapInstance.getContainer().classList.add('offline-map');
  installAcceleratedWheelZoom(mapInstance);
  L.tileLayer(TILE_URL_TEMPLATE, {
    keepBuffer: 3,
    minZoom: 2,
    maxZoom: 18,
    updateWhenIdle: false,
    crossOrigin: false
  }).addTo(mapInstance);

  focusPoland();
  peopleLayer = L.layerGroup().addTo(mapInstance);
  customLayer = L.layerGroup().addTo(mapInstance);
  mapInstance.on('moveend zoomend', () => {
    scheduleVisibleMarkerSync();
  });

  requestAnimationFrame(() => {
    mapInstance.invalidateSize();
  });
}

window.addEventListener('resize', () => {
  if (!mapInstance) {
    return;
  }

  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    mapInstance?.invalidateSize();
  }, 120);
});

async function loadPoints() {
  if (!mapInstance) {
    return;
  }

  const payload = await window.appApi.getMapPoints({
    query: '',
    includeUnresolved: false
  });

  allPeople = payload.people || [];
  allCustomPoints = payload.customPoints || [];
  const nextPerson = resolveCurrentPersonSelection(allPeople);

  clearActiveSelection({ resetPanel: !nextPerson });

  if (nextPerson) {
    focusSelectionOnMap(nextPerson);
    void selectPersonPoint(nextPerson, null, { historyMode: 'restore' });
  }

  scheduleVisibleMarkerSync(0);
}

function focusPoland() {
  mapInstance.fitBounds(POLAND_BOUNDS, {
    padding: [24, 24]
  });
}

function installAcceleratedWheelZoom(map) {
  const container = map.getContainer();
  let lastWheelAt = 0;

  container.addEventListener(
    'wheel',
    (event) => {
      if (!map._loaded) {
        return;
      }

      event.preventDefault();

      const delta = buildWheelZoomDelta(event, lastWheelAt, container);
      lastWheelAt = performance.now();

      if (!delta) {
        return;
      }

      const zoomPoint = map.mouseEventToContainerPoint(event);
      const nextZoom = clampMapZoom(map, map.getZoom() + delta);

      if (Math.abs(nextZoom - map.getZoom()) < 0.001) {
        return;
      }

      map.setZoomAround(zoomPoint, nextZoom, false);
    },
    { passive: false }
  );
}

function buildWheelZoomDelta(event, previousWheelAt, container) {
  const pixelDeltaY = normalizeWheelDeltaToPixels(
    event.deltaY,
    event.deltaMode,
    container.clientHeight || mapEl.clientHeight || 0
  );
  const pixelDeltaX = normalizeWheelDeltaToPixels(
    event.deltaX,
    event.deltaMode,
    container.clientWidth || mapEl.clientWidth || 0
  );
  const dominantDelta = pixelDeltaY || pixelDeltaX;

  if (!dominantDelta) {
    return 0;
  }

  const now = performance.now();
  const elapsed = previousWheelAt ? now - previousWheelAt : Number.POSITIVE_INFINITY;
  const isTouchpad = isLikelyTouchpadWheel(event, pixelDeltaX, pixelDeltaY);
  const magnitude = Math.abs(dominantDelta);
  const baseStep = isTouchpad
    ? clampNumber(magnitude / 220, 0.04, 0.24)
    : clampNumber(Math.max(magnitude / 120, 1) * 0.24, 0.24, 0.52);
  const acceleration = isTouchpad
    ? getTouchpadWheelAcceleration(elapsed)
    : getMouseWheelAcceleration(elapsed);

  return -Math.sign(dominantDelta) * baseStep * acceleration * WHEEL_ZOOM_MULTIPLIER;
}

function normalizeWheelDeltaToPixels(delta, deltaMode, viewportSize) {
  if (!delta) {
    return 0;
  }

  if (deltaMode === 1) {
    return delta * WHEEL_LINE_HEIGHT_PX;
  }

  if (deltaMode === 2) {
    return delta * Math.max(viewportSize, 1) * WHEEL_PAGE_HEIGHT_FACTOR;
  }

  return delta;
}

function isLikelyTouchpadWheel(event, pixelDeltaX, pixelDeltaY) {
  if (event.ctrlKey) {
    return true;
  }

  if (event.deltaMode !== 0) {
    return false;
  }

  const dominantMagnitude = Math.max(Math.abs(pixelDeltaX), Math.abs(pixelDeltaY));
  return (
    Math.abs(pixelDeltaX) > 0 ||
    !Number.isInteger(event.deltaY) ||
    !Number.isInteger(event.deltaX) ||
    dominantMagnitude < 48
  );
}

function getMouseWheelAcceleration(elapsed) {
  if (elapsed < 50) {
    return 2.75;
  }

  if (elapsed < 100) {
    return 2.1;
  }

  if (elapsed < 170) {
    return 1.55;
  }

  return 1;
}

function getTouchpadWheelAcceleration(elapsed) {
  if (elapsed < 18) {
    return 1.65;
  }

  if (elapsed < 40) {
    return 1.3;
  }

  return 1;
}

function clampMapZoom(map, zoom) {
  return clampNumber(zoom, map.getMinZoom(), map.getMaxZoom());
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function scheduleVisibleMarkerSync(delayMs = 0) {
  if (delayMs <= 0) {
    syncVisibleMarkers();
    return;
  }

  setTimeout(() => {
    syncVisibleMarkers();
  }, delayMs);
}

function syncVisibleMarkers() {
  if (!mapInstance) {
    return;
  }

  const bounds = mapInstance.getBounds().pad(VISIBLE_BOUNDS_PADDING);
  const nextPeople = allPeople.filter((person) => isPointVisible(bounds, person));
  const nextCustomPoints = allCustomPoints.filter((point) => isPointVisible(bounds, point));
  const nextVisiblePeopleKeys = new Set(nextPeople.map((person) => buildPersonKey(person)));
  const nextVisibleCustomKeys = new Set(nextCustomPoints.map((point) => buildCustomPointKey(point)));

  for (const [key, marker] of visiblePeopleMarkers.entries()) {
    if (!nextVisiblePeopleKeys.has(key)) {
      peopleLayer.removeLayer(marker);
      visiblePeopleMarkers.delete(key);
    }
  }

  for (const [key, marker] of visibleCustomMarkers.entries()) {
    if (!nextVisibleCustomKeys.has(key)) {
      customLayer.removeLayer(marker);
      visibleCustomMarkers.delete(key);
    }
  }

  const peopleToAdd = nextPeople.filter((person) => !visiblePeopleMarkers.has(buildPersonKey(person)));
  const customPointsToAdd = nextCustomPoints.filter(
    (point) => !visibleCustomMarkers.has(buildCustomPointKey(point))
  );

  markerSyncGeneration += 1;
  scheduleMarkerRender({
    generation: markerSyncGeneration,
    people: peopleToAdd,
    customPoints: customPointsToAdd,
    peopleIndex: 0,
    customPointIndex: 0
  });
}

function scheduleMarkerRender(state) {
  requestAnimationFrame(() => {
    renderMarkerBatch(state);
  });
}

function renderMarkerBatch(state) {
  if (state.generation !== markerSyncGeneration) {
    return;
  }

  let processed = 0;

  while (state.peopleIndex < state.people.length && processed < MARKER_BATCH_SIZE) {
    const person = state.people[state.peopleIndex];
    state.peopleIndex += 1;

    if (!Number.isFinite(person.lat) || !Number.isFinite(person.lng)) {
      continue;
    }

    const key = buildPersonKey(person);
    if (visiblePeopleMarkers.has(key)) {
      continue;
    }

    const marker = L.circleMarker([person.lat, person.lng], {
      ...DEFAULT_PERSON_MARKER_STYLE,
      renderer: personRenderer
    });
    attachLazyPopup(marker, () => buildPersonPopupHtml(person), () => {
      void selectPersonPoint(person, marker, { panelMode: 'selection' });
    });

    if (activeSelection?.key === key) {
      applyMarkerSelection(marker, 'person');
      activeSelection.marker = marker;
    }

    peopleLayer.addLayer(marker);
    visiblePeopleMarkers.set(key, marker);
    processed += 1;
  }

  while (state.customPointIndex < state.customPoints.length && processed < MARKER_BATCH_SIZE) {
    const point = state.customPoints[state.customPointIndex];
    state.customPointIndex += 1;

    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      continue;
    }

    const key = buildCustomPointKey(point);
    if (visibleCustomMarkers.has(key)) {
      continue;
    }

    const marker = L.marker([point.lat, point.lng], {
      title: point.label
    });
    attachLazyPopup(marker, () => buildCustomPointPopupHtml(point), () => {
      selectCustomPoint(point, marker, { panelMode: 'selection' });
    });

    if (activeSelection?.key === key) {
      applyMarkerSelection(marker, 'custom');
      activeSelection.marker = marker;
    }

    customLayer.addLayer(marker);
    visibleCustomMarkers.set(key, marker);
    processed += 1;
  }

  if (state.peopleIndex < state.people.length || state.customPointIndex < state.customPoints.length) {
    scheduleMarkerRender(state);
  }
}

function isPointVisible(bounds, point) {
  if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) {
    return false;
  }

  return bounds.contains([point.lat, point.lng]);
}

function buildPersonKey(person) {
  return `person:${person.sourceRowId}`;
}

function buildCustomPointKey(point) {
  return `custom:${point.id}`;
}

function resolveCurrentPersonSelection(people) {
  if (!Array.isArray(people) || people.length === 0) {
    personSelectionHistory = {
      entries: [],
      index: -1
    };
    persistPersonSelectionHistory();
    replaceCurrentPersonHistoryState(null);
    return null;
  }

  if (!isPersonSelectionHistoryReady) {
    initializePersonSelectionHistory(people);
  }

  const currentPersonId = personSelectionHistory.entries[personSelectionHistory.index];
  const currentPerson = currentPersonId
    ? people.find((person) => person.sourceRowId === currentPersonId)
    : null;

  if (currentPerson) {
    return currentPerson;
  }

  const fallbackPerson = resolveInitialSelectionFallback(people);
  if (!fallbackPerson) {
    return null;
  }

  personSelectionHistory = {
    entries: [fallbackPerson.sourceRowId],
    index: 0
  };
  persistPersonSelectionHistory();
  replaceCurrentPersonHistoryState(fallbackPerson.sourceRowId);
  return fallbackPerson;
}

function initializePersonSelectionHistory(people) {
  const availablePersonIds = new Set(people.map((person) => person.sourceRowId));
  const storedHistory = readPersonSelectionHistory();
  const nextEntries = Array.isArray(storedHistory?.entries)
    ? storedHistory.entries.filter((sourceRowId) => availablePersonIds.has(sourceRowId))
    : [];
  const nextIndex = clampHistoryIndex(storedHistory?.index, nextEntries.length);

  if (nextEntries.length > 0) {
    personSelectionHistory = {
      entries: nextEntries.slice(0, nextIndex + 1),
      index: nextIndex
    };
  } else {
    const fallbackPerson = resolveInitialSelectionFallback(people);
    personSelectionHistory = fallbackPerson
      ? {
          entries: [fallbackPerson.sourceRowId],
          index: 0
        }
      : {
          entries: [],
          index: -1
        };
  }

  persistPersonSelectionHistory();
  rebuildBrowserHistoryFromPersonSelectionHistory();
  isPersonSelectionHistoryReady = true;
}

function resolveInitialSelectionFallback(people) {
  const lastSelectedPersonId = readLastSelectedPersonId();
  if (lastSelectedPersonId) {
    const matchingPerson = people.find((person) => person.sourceRowId === lastSelectedPersonId);
    if (matchingPerson) {
      return matchingPerson;
    }
  }

  return people[0];
}

function readPersonSelectionHistory() {
  try {
    const raw = window.localStorage.getItem(PERSON_SELECTION_HISTORY_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.entries)) {
      return null;
    }

    return {
      entries: parsed.entries.map((value) => String(value)),
      index: Number(parsed.index)
    };
  } catch (_error) {
    return null;
  }
}

function persistPersonSelectionHistory() {
  try {
    window.localStorage.setItem(
      PERSON_SELECTION_HISTORY_STORAGE_KEY,
      JSON.stringify(personSelectionHistory)
    );
  } catch (_error) {
    // Ignore storage failures and keep the current session working.
  }
}

function clampHistoryIndex(value, size) {
  if (size <= 0) {
    return -1;
  }

  const normalizedValue = Number.isInteger(Number(value)) ? Number(value) : size - 1;
  return Math.min(Math.max(normalizedValue, 0), size - 1);
}

function rebuildBrowserHistoryFromPersonSelectionHistory() {
  const currentEntries = personSelectionHistory.entries;

  if (currentEntries.length === 0 || personSelectionHistory.index < 0) {
    replaceCurrentPersonHistoryState(null);
    return;
  }

  history.replaceState(buildPersonHistoryState(currentEntries[0], 0), document.title);

  for (let index = 1; index <= personSelectionHistory.index; index += 1) {
    history.pushState(buildPersonHistoryState(currentEntries[index], index), document.title);
  }
}

function buildPersonHistoryState(sourceRowId, index) {
  return {
    kind: PERSON_SELECTION_HISTORY_STATE_KIND,
    sourceRowId: sourceRowId || null,
    historyIndex: index
  };
}

function replaceCurrentPersonHistoryState(sourceRowId) {
  const nextIndex = sourceRowId ? Math.max(personSelectionHistory.index, 0) : -1;
  history.replaceState(buildPersonHistoryState(sourceRowId, nextIndex), document.title);
}

function pushPersonSelectionToHistory(sourceRowId) {
  if (!sourceRowId) {
    return;
  }

  const currentSourceRowId = personSelectionHistory.entries[personSelectionHistory.index];
  if (currentSourceRowId === sourceRowId) {
    replaceCurrentPersonHistoryState(sourceRowId);
    return;
  }

  const nextEntries = personSelectionHistory.entries.slice(0, personSelectionHistory.index + 1);
  nextEntries.push(sourceRowId);
  personSelectionHistory = {
    entries: nextEntries,
    index: nextEntries.length - 1
  };
  persistPersonSelectionHistory();
  history.pushState(buildPersonHistoryState(sourceRowId, personSelectionHistory.index), document.title);
}

function syncPersonSelectionHistoryIndex(historyIndex, sourceRowId) {
  if (!sourceRowId) {
    personSelectionHistory = {
      entries: [],
      index: -1
    };
    persistPersonSelectionHistory();
    return;
  }

  const nextEntries = [...personSelectionHistory.entries];
  if (historyIndex >= nextEntries.length) {
    nextEntries.length = historyIndex + 1;
  }
  nextEntries[historyIndex] = sourceRowId;
  personSelectionHistory = {
    entries: nextEntries,
    index: historyIndex
  };
  persistPersonSelectionHistory();
}

function handlePersonSelectionPopState(event) {
  const state = event.state;
  if (state?.kind !== PERSON_SELECTION_HISTORY_STATE_KIND) {
    return;
  }

  const historyIndex = clampHistoryIndex(state.historyIndex, personSelectionHistory.entries.length || 1);
  const sourceRowId = state.sourceRowId ? String(state.sourceRowId) : null;

  syncPersonSelectionHistoryIndex(historyIndex, sourceRowId);

  if (!sourceRowId) {
    clearActiveSelection({ resetPanel: true });
    return;
  }

  const person = allPeople.find((entry) => entry.sourceRowId === sourceRowId);
  if (!person) {
    const fallbackPerson = resolveCurrentPersonSelection(allPeople);
    if (!fallbackPerson) {
      clearActiveSelection({ resetPanel: true });
      return;
    }

    focusSelectionOnMap(fallbackPerson);
    void selectPersonPoint(fallbackPerson, visiblePeopleMarkers.get(buildPersonKey(fallbackPerson)) || null, {
      historyMode: 'restore'
    });
    return;
  }

  focusSelectionOnMap(person);
  void selectPersonPoint(person, visiblePeopleMarkers.get(buildPersonKey(person)) || null, {
    historyMode: 'restore'
  });
}

function handleMouseHistoryNavigation(event) {
  if (event.button === 3) {
    event.preventDefault();
    event.stopPropagation();
    if (personSelectionHistory.index > 0) {
      history.back();
    }
    return;
  }

  if (event.button === 4) {
    event.preventDefault();
    event.stopPropagation();
    if (personSelectionHistory.index >= 0 && personSelectionHistory.index < personSelectionHistory.entries.length - 1) {
      history.forward();
    }
  }
}

function readLastSelectedPersonId() {
  try {
    return window.localStorage.getItem(LAST_SELECTED_PERSON_STORAGE_KEY);
  } catch (_error) {
    return null;
  }
}

function saveLastSelectedPersonId(sourceRowId) {
  if (!sourceRowId) {
    return;
  }

  try {
    window.localStorage.setItem(LAST_SELECTED_PERSON_STORAGE_KEY, sourceRowId);
  } catch (_error) {
    // Ignore storage failures and keep the current session working.
  }
}

function focusSelectionOnMap(person) {
  if (!mapInstance || !Number.isFinite(person?.lat) || !Number.isFinite(person?.lng)) {
    return;
  }

  mapInstance.panTo([person.lat, person.lng], {
    animate: false
  });
}

function attachLazyPopup(marker, buildHtml, onSelect) {
  let hoverPopupTimer = null;

  const clearHoverPopupTimer = () => {
    if (hoverPopupTimer) {
      window.clearTimeout(hoverPopupTimer);
      hoverPopupTimer = null;
    }
  };

  const ensurePopup = () => {
    if (!marker.getPopup()) {
      marker.bindPopup(buildHtml());
    }
  };

  marker.on('click', () => {
    clearHoverPopupTimer();
    ensurePopup();
    marker.openPopup();
    onSelect?.();
  });

  marker.on('mouseover', () => {
    clearHoverPopupTimer();
    hoverPopupTimer = window.setTimeout(() => {
      hoverPopupTimer = null;
      ensurePopup();
      marker.openPopup();
    }, HOVER_POPUP_DELAY_MS);
  });

  marker.on('mouseout', () => {
    clearHoverPopupTimer();
    marker.closePopup();
  });

  marker.on('remove', () => {
    clearHoverPopupTimer();
  });
}

async function selectPersonPoint(person, marker, options = {}) {
  const key = buildPersonKey(person);
  selectionRequestToken += 1;
  const requestToken = selectionRequestToken;

  saveLastSelectedPersonId(person.sourceRowId);
  if (options.historyMode !== 'restore') {
    pushPersonSelectionToHistory(person.sourceRowId);
  }
  setActiveSelection({
    key,
    type: 'person',
    marker
  });
  if (options.panelMode) {
    setInfoPanelMode(options.panelMode);
  }
  renderPersonSelectionState(person);

  const details = await window.appApi.getPersonDetails(person.sourceRowId);
  if (!details || requestToken !== selectionRequestToken || activeSelection?.key !== key) {
    return;
  }

  renderPersonSelection(details);
}

function selectCustomPoint(point, marker, options = {}) {
  selectionRequestToken += 1;
  setActiveSelection({
    key: buildCustomPointKey(point),
    type: 'custom',
    marker
  });
  if (options.panelMode) {
    setInfoPanelMode(options.panelMode);
  }
  renderCustomPointSelection(point);
}

function setActiveSelection(nextSelection) {
  if (activeSelection?.marker) {
    resetMarkerSelection(activeSelection.marker, activeSelection.type);
  }

  activeSelection = nextSelection;
  applyMarkerSelection(nextSelection.marker, nextSelection.type);
  overviewDefaultEls.forEach((element) => {
    element.hidden = true;
  });
}

function clearActiveSelection(options = {}) {
  selectionRequestToken += 1;

  if (activeSelection?.marker) {
    resetMarkerSelection(activeSelection.marker, activeSelection.type);
  }

  activeSelection = null;

  if (options.resetPanel !== false) {
    renderEmptySelection();
  }
}

function applyMarkerSelection(marker, type) {
  if (!marker) {
    return;
  }

  if (type === 'person' && typeof marker.setStyle === 'function') {
    marker.setStyle(ACTIVE_PERSON_MARKER_STYLE);
    marker.bringToFront?.();
    return;
  }

  if (type === 'custom' && typeof marker.setZIndexOffset === 'function') {
    marker.setZIndexOffset(1000);
  }
}

function resetMarkerSelection(marker, type) {
  if (!marker) {
    return;
  }

  if (type === 'person' && typeof marker.setStyle === 'function') {
    marker.setStyle(DEFAULT_PERSON_MARKER_STYLE);
    return;
  }

  if (type === 'custom' && typeof marker.setZIndexOffset === 'function') {
    marker.setZIndexOffset(0);
  }
}

function renderEmptySelection() {
  selectionPanelState = {
    kind: 'empty'
  };

  if (infoPanelMode !== 'selection') {
    return;
  }

  paintEmptySelection();
}

function paintEmptySelection() {
  overviewDefaultEls.forEach((element) => {
    element.hidden = true;
  });
  selectionHeaderEl.hidden = true;
  selectionTitleEl.textContent = '';
  selectionCopyEl.textContent = '';
  selectionCopyEl.hidden = true;
  selectionMetaEl.innerHTML = '';
  selectionMetaEl.hidden = true;
  selectionExtraEl.innerHTML = '';
  selectionExtraEl.hidden = true;
}

function renderPersonSelectionState(person) {
  selectionPanelState = {
    kind: 'person-loading',
    person
  };

  if (infoPanelMode !== 'selection') {
    return;
  }

  paintPersonSelectionState(person);
}

function paintPersonSelectionState(person) {
  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = person.fullName || person.companyName || 'Wybrana osoba';
  selectionCopyEl.textContent = person.routeAddress || person.addressText || 'Ladowanie szczegolow osoby...';
  selectionCopyEl.hidden = false;
  selectionMetaEl.innerHTML = renderKeyValueList([
    { label: 'Telefon', value: person.phone || 'Brak' },
    { label: 'E-mail', value: person.email || 'Brak' },
    { label: 'Ostatnia wizyta', value: formatDate(person.lastVisitAt) },
    { label: 'Ostatnia wplata', value: formatDate(person.lastPaymentAt) }
  ]);
  selectionMetaEl.hidden = false;
  selectionExtraEl.innerHTML = '<p class="empty-state">Ladowanie pelnych informacji o osobie...</p>';
  selectionExtraEl.hidden = false;
}

function renderPersonSelection(details) {
  selectionPanelState = {
    kind: 'person',
    details
  };

  if (infoPanelMode !== 'selection') {
    return;
  }

  paintPersonSelection(details);
}

function paintPersonSelection(details) {
  const person = details.person;
  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = person.fullName || person.companyName || 'Wybrana osoba';
  selectionCopyEl.textContent = person.routeAddress || person.addressText || 'Brak adresu';
  selectionCopyEl.hidden = false;
  selectionMetaEl.innerHTML = renderKeyValueList([
    { label: 'Telefon', value: person.phone || 'Brak' },
    { label: 'E-mail', value: person.email || 'Brak' },
    { label: 'Adres', value: person.addressText || person.routeAddress || 'Brak' },
    { label: 'Ostatnia wizyta', value: formatDate(person.lastVisitAt) },
    { label: 'Ostatnia wplata', value: formatDate(person.lastPaymentAt) },
    { label: 'Planowana wizyta', value: formatDate(person.plannedVisitAt) },
    { label: 'Suma wplat', value: formatMoney(person.totalPaid) },
    { label: 'Urzadzenie', value: [person.deviceVendor, person.deviceModel].filter(Boolean).join(' ') || 'Brak' }
  ]);
  selectionMetaEl.hidden = false;

  const cards = [];

  if (person.notesSummary) {
    cards.push(`
      <article class="list-card">
        <div class="list-card-heading">
          <strong>Uwagi</strong>
        </div>
        <p>${escapeHtml(person.notesSummary)}</p>
      </article>
    `);
  }

  if (details.serviceCards.length > 0) {
    cards.push(
      ...details.serviceCards.slice(0, 3).map(
        (card) => `
          <article class="list-card">
            <div class="list-card-heading">
              <strong>${escapeHtml(card.cardType || 'Karta serwisowa')}</strong>
              <span>${escapeHtml(formatDate(card.cardDate))}</span>
            </div>
            <p>${escapeHtml(card.technician || 'Brak serwisanta')}</p>
            <p>${escapeHtml(card.eventType || 'Brak typu zdarzenia')}</p>
          </article>
        `
      )
    );
  }

  if (details.notes.length > 0) {
    cards.push(
      ...details.notes.slice(0, 2).map(
        (note) => `
          <article class="list-card">
            <div class="list-card-heading">
              <strong>Notatka lokalna</strong>
              <span>${escapeHtml(formatDate(note.createdAt))}</span>
            </div>
            <p>${escapeHtml(note.message)}</p>
          </article>
        `
      )
    );
  }

  selectionExtraEl.innerHTML = cards.length
    ? cards.join('')
    : '<p class="empty-state">Brak dodatkowych informacji dla tej osoby.</p>';
  selectionExtraEl.hidden = false;
}

function renderCustomPointSelection(point) {
  selectionPanelState = {
    kind: 'custom',
    point
  };

  if (infoPanelMode !== 'selection') {
    return;
  }

  paintCustomPointSelection(point);
}

function paintCustomPointSelection(point) {
  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = point.label || 'Punkt lokalny';
  selectionCopyEl.textContent = point.addressText || 'Punkt lokalny zapisany recznie.';
  selectionCopyEl.hidden = false;
  selectionMetaEl.innerHTML = renderKeyValueList([
    { label: 'Typ', value: 'Punkt lokalny' },
    { label: 'Adres', value: point.addressText || 'Brak' },
    { label: 'Szerokosc', value: formatCoordinate(point.lat) },
    { label: 'Dlugosc', value: formatCoordinate(point.lng) },
    { label: 'Dodano', value: formatDateTime(point.createdAt) }
  ]);
  selectionMetaEl.hidden = false;
  selectionExtraEl.innerHTML = '<p class="empty-state">Ten punkt nie ma jeszcze dodatkowych notatek.</p>';
  selectionExtraEl.hidden = false;
}

function formatCoordinate(value) {
  if (!Number.isFinite(Number(value))) {
    return 'Brak';
  }

  return Number(value).toFixed(5);
}

function buildPersonPopupHtml(person) {
  return `
    <strong>${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</strong><br>
    ${escapeHtml(person.routeAddress || person.addressText || 'Brak adresu')}<br>
    Ostatnia wizyta: ${escapeHtml(formatDate(person.lastVisitAt))}<br>
    Ostatnia wplata: ${escapeHtml(formatDate(person.lastPaymentAt))}
  `;
}

function buildCustomPointPopupHtml(point) {
  return `<strong>${escapeHtml(point.label)}</strong><br>${escapeHtml(point.addressText || 'Punkt lokalny')}`;
}

function setInfoPanelMode(mode) {
  const nextMode = mode === 'stats' ? 'stats' : 'selection';
  if (infoPanelMode === nextMode) {
    return;
  }

  infoPanelMode = nextMode;
  syncInfoToolButtons();

  if (infoPanelMode === 'stats') {
    paintStatsSelection(latestOverviewSummary);
    return;
  }

  paintSelectionPanelState();
}

function syncInfoToolButtons() {
  const isStatsMode = infoPanelMode === 'stats';

  statsButtonEl?.classList.toggle('is-active', isStatsMode);
  statsButtonEl?.setAttribute('aria-pressed', String(isStatsMode));

  selectionButtonEl?.classList.toggle('is-active', !isStatsMode);
  selectionButtonEl?.setAttribute('aria-pressed', String(!isStatsMode));
}

function paintSelectionPanelState() {
  switch (selectionPanelState.kind) {
    case 'person-loading':
      paintPersonSelectionState(selectionPanelState.person);
      return;
    case 'person':
      paintPersonSelection(selectionPanelState.details);
      return;
    case 'custom':
      paintCustomPointSelection(selectionPanelState.point);
      return;
    default:
      paintEmptySelection();
  }
}

function paintStatsSelection(summary) {
  const totalPeople = Number(summary?.stats?.totalPeople || 0);
  const geocodedPeople = Number(summary?.stats?.geocodedPeople || 0);
  const pendingGeocodes = Number(summary?.stats?.pendingGeocodes || 0);
  const totalRows = Number(summary?.stats?.totalRows || 0);
  const totalTables = Number(summary?.stats?.totalTables || 0);
  const totalServiceCards = Number(summary?.stats?.totalServiceCards || 0);
  const totalNotes = Number(summary?.stats?.totalNotes || 0);
  const totalCustomPoints = Number(summary?.stats?.totalCustomPoints || 0);
  const coveragePercent = totalPeople > 0 ? Math.round((geocodedPeople / totalPeople) * 100) : 0;

  overviewDefaultEls.forEach((element) => {
    element.hidden = true;
  });

  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = 'Statystyki';
  selectionCopyEl.textContent = 'Podsumowanie aktualnego importu, geokodowania i danych lokalnych.';
  selectionCopyEl.hidden = false;
  selectionMetaEl.innerHTML = renderKeyValueList([
    { label: 'Osoby', value: formatNumber(totalPeople) },
    { label: 'Z geokodem', value: formatNumber(geocodedPeople) },
    { label: 'Oczekuje na geokod', value: formatNumber(pendingGeocodes) },
    { label: 'Karty serwisowe', value: formatNumber(totalServiceCards) },
    { label: 'Notatki lokalne', value: formatNumber(totalNotes) },
    { label: 'Punkty lokalne', value: formatNumber(totalCustomPoints) },
    { label: 'Tabele', value: formatNumber(totalTables) },
    { label: 'Wiersze', value: formatNumber(totalRows) }
  ]);
  selectionMetaEl.hidden = false;
  selectionExtraEl.innerHTML = `
    <div class="map-stats-grid">
      <article class="list-card">
        <div class="list-card-heading">
          <strong>Pokrycie mapy</strong>
          <span>${escapeHtml(formatNumber(coveragePercent))}%</span>
        </div>
        <p>${escapeHtml(formatNumber(geocodedPeople))} z ${escapeHtml(formatNumber(totalPeople))} osob ma wspolrzedne.</p>
      </article>
      <article class="list-card">
        <div class="list-card-heading">
          <strong>Ostatni import</strong>
          <span>${escapeHtml(formatDateTime(summary?.importMeta?.imported_at))}</span>
        </div>
        <p>${escapeHtml(summary?.settings?.accessDbPath || summary?.importMeta?.source_path || 'Nie wybrano pliku Access.')}</p>
      </article>
    </div>
  `;
  selectionExtraEl.hidden = false;
}
