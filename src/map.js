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
const searchButtonEl = document.querySelector('[data-map-tool="search"]');
const historyButtonEl = document.querySelector('[data-map-tool="history"]');
const filterButtonEl = document.querySelector('[data-map-tool="filter"]');
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
const MAX_PERSON_SELECTION_HISTORY_ENTRIES = 100;
const PERSON_SELECTION_HISTORY_STATE_KIND = 'map-person-selection';
const MAP_PERSON_SEARCH_LIMIT = 100;
const MAP_PERSON_SEARCH_DEBOUNCE_MS = 160;
const LAST_OPENED_MAP_PANEL_STORAGE_KEY = 'map:lastOpenedPanelState';
const MAP_DATE_FILTER_STORAGE_KEY = 'map:dateFilterState';
const DEFAULT_INFO_PANEL_MODE = 'selection';
const SETTINGS_PANEL_STORAGE_STATE = 'settings';
const INFO_PANEL_MODES = ['stats', 'selection', 'search', 'history', 'filter'];
const MONTH_LABELS = ['Styczen', 'Luty', 'Marzec', 'Kwiecien', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpien', 'Wrzesien', 'Pazdziernik', 'Listopad', 'Grudzien'];
const EARLIEST_COMPARABLE_DATE = '0001-01-01';
const LATEST_COMPARABLE_DATE = '9999-12-31';
const restoredMapPanelState = readStoredMapPanelState();
const restoredMapDateFilterState = readStoredMapDateFilterState();

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
let isSettingsOpen = restoredMapPanelState.activePanel === SETTINGS_PANEL_STORAGE_STATE;
let activeSelection = null;
let selectionRequestToken = 0;
let infoPanelMode = restoredMapPanelState.infoPanelMode;
let selectionPanelState = {
  kind: 'empty'
};
let latestOverviewSummary = null;
let personSelectionHistory = {
  entries: [],
  index: -1
};
let isPersonSelectionHistoryReady = false;
let mapDateFilterHasInvalidRange = hasInvalidMapDateRangeDraft(restoredMapDateFilterState);
let mapDateFilter = mapDateFilterHasInvalidRange
  ? normalizeMapDateFilter({})
  : normalizeMapDateFilter(restoredMapDateFilterState);
let mapDateFilterOptions = [];
let mapDateFilterDraft = resolveMapDateFilterDraft(restoredMapDateFilterState, mapDateFilter);
let mapDateFilterApplyTimer = null;
let personSearchTimer = null;
let personSearchRequestToken = 0;
let personSearchState = {
  query: '',
  results: [],
  isLoading: false,
  hasLoaded: false
};

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

searchButtonEl?.addEventListener('click', () => {
  if (isSettingsOpen) {
    toggleSettingsPanel(false);
  }
  if (infoPanelMode === 'search') {
    focusMapSearchInput();
    return;
  }
  setInfoPanelMode('search');
});

historyButtonEl?.addEventListener('click', () => {
  if (isSettingsOpen) {
    toggleSettingsPanel(false);
  }
  setInfoPanelMode('history');
});

filterButtonEl?.addEventListener('click', () => {
  if (isSettingsOpen) {
    toggleSettingsPanel(false);
  }
  setInfoPanelMode('filter');
});

selectionExtraEl?.addEventListener('click', (event) => {
  const filterResultButton = event.target.closest('[data-map-filter-source-row-id]');
  if (filterResultButton && infoPanelMode === 'filter') {
    const sourceRowId = filterResultButton.getAttribute('data-map-filter-source-row-id');
    const person = allPeople.find((entry) => entry.sourceRowId === sourceRowId);
    if (!person) {
      return;
    }

    focusSelectionOnMap(person);
    void selectPersonPoint(person, visiblePeopleMarkers.get(buildPersonKey(person)) || null, {
      panelMode: 'selection'
    });
    return;
  }

  const searchResultButton = event.target.closest('[data-map-search-source-row-id]');
  if (searchResultButton && infoPanelMode === 'search') {
    const sourceRowId = searchResultButton.getAttribute('data-map-search-source-row-id');
    const searchResult = personSearchState.results.find((entry) => entry.sourceRowId === sourceRowId);
    if (!searchResult) {
      return;
    }

    const mapPerson = allPeople.find((entry) => entry.sourceRowId === sourceRowId) || searchResult;
    focusSelectionOnMap(mapPerson);
    void selectPersonPoint(mapPerson, visiblePeopleMarkers.get(buildPersonKey(mapPerson)) || null, {
      panelMode: 'selection'
    });
    return;
  }

  const clearSearchButton = event.target.closest('[data-map-person-search-clear]');
  if (clearSearchButton && infoPanelMode === 'search') {
    updatePersonSearchQuery('', { immediate: true });
    return;
  }

  const resetFilterButton = event.target.closest('[data-map-date-filter-reset]');
  if (resetFilterButton && infoPanelMode === 'filter') {
    mapDateFilterDraft = buildMapDateFilterDraft({});
    mapDateFilterHasInvalidRange = false;
    persistMapDateFilterState();
    void applyMapDateFilter({});
    return;
  }

  const historyRowButton = event.target.closest('[data-history-source-row-id]');
  if (historyRowButton && infoPanelMode === 'history') {
    const sourceRowId = historyRowButton.getAttribute('data-history-source-row-id');
    const person = allPeople.find((entry) => entry.sourceRowId === sourceRowId);
    if (!person) {
      return;
    }

    focusSelectionOnMap(person);
    void selectPersonPoint(person, visiblePeopleMarkers.get(buildPersonKey(person)) || null, {
      panelMode: 'selection'
    });
  }

  const historyNavButton = event.target.closest('[data-history-nav]');
  if (!historyNavButton || infoPanelMode !== 'history') {
    return;
  }

  if (historyNavButton.getAttribute('data-history-nav') === 'back') {
    if (personSelectionHistory.index > 0) {
      history.back();
    }
    return;
  }

  if (personSelectionHistory.index < personSelectionHistory.entries.length - 1) {
    history.forward();
  }
});

selectionExtraEl?.addEventListener('input', (event) => {
  const searchField = event.target.closest('[data-map-person-search-input]');
  if (!searchField || infoPanelMode !== 'search') {
    return;
  }

  updatePersonSearchQuery(searchField.value);
});

selectionExtraEl?.addEventListener('change', (event) => {
  const filterField = event.target.closest('[data-map-date-filter-form] select');
  if (!filterField || infoPanelMode !== 'filter') {
    return;
  }

  const filterForm = filterField.closest('[data-map-date-filter-form]');
  if (!filterForm) {
    return;
  }

  const formData = new FormData(filterForm);
  mapDateFilterDraft = normalizeMapDateFilterDraft({
    fromMonth: formData.get('fromMonth'),
    fromYear: formData.get('fromYear'),
    toMonth: formData.get('toMonth'),
    toYear: formData.get('toYear')
  });
  mapDateFilterHasInvalidRange = hasInvalidMapDateRangeDraft(mapDateFilterDraft);
  persistMapDateFilterState();
  paintFilterPanel();
  scheduleMapDateFilterApply();
});

selectionExtraEl?.addEventListener('submit', (event) => {
  const searchForm = event.target.closest('[data-map-person-search-form]');
  if (searchForm && infoPanelMode === 'search') {
    event.preventDefault();
    const formData = new FormData(searchForm);
    updatePersonSearchQuery(formData.get('query') || '', { immediate: true });
    return;
  }

  const filterForm = event.target.closest('[data-map-date-filter-form]');
  if (!filterForm || infoPanelMode !== 'filter') {
    return;
  }

  event.preventDefault();
  const formData = new FormData(filterForm);
  mapDateFilterDraft = normalizeMapDateFilterDraft({
    fromMonth: formData.get('fromMonth'),
    fromYear: formData.get('fromYear'),
    toMonth: formData.get('toMonth'),
    toYear: formData.get('toYear')
  });
  mapDateFilterHasInvalidRange = hasInvalidMapDateRangeDraft(mapDateFilterDraft);
  persistMapDateFilterState();
  void applyMapDateFilter({
    ...mapDateFilterDraft
  });
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
    if (payload.type === 'import' || payload.type === 'trasa-import') {
      await loadMapDateFilterOptions();
    }
    await loadPoints();
  }
});

syncSettingsPanelVisibility();
renderCurrentInfoPanel();
bootstrap();

async function bootstrap() {
  const [bootstrapData] = await Promise.all([
    window.appApi.getBootstrap(),
    loadMapDateFilterOptions(),
    hydratePersonSelectionHistory()
  ]);
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
  syncSettingsPanelVisibility();
  persistMapPanelState();

  requestAnimationFrame(() => {
    mapInstance?.invalidateSize();
  });
}

function syncSettingsPanelVisibility() {
  overviewViewEl.hidden = isSettingsOpen;
  settingsViewEl.hidden = !isSettingsOpen;
  overviewViewEl.classList.toggle('map-info-view-active', !isSettingsOpen);
  settingsViewEl.classList.toggle('map-info-view-active', isSettingsOpen);
  mapBoardEl?.classList.toggle('is-settings-open', isSettingsOpen);
  mapContentGroupEl?.classList.toggle('is-settings-open', isSettingsOpen);
  mapInfoPanelEl?.classList.toggle('is-settings-open', isSettingsOpen);
  settingsButtonEl?.classList.toggle('is-active', isSettingsOpen);
  settingsButtonEl?.setAttribute('aria-pressed', String(isSettingsOpen));
  syncInfoToolButtons();
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

  const payload = await window.appApi.getMapPoints(buildMapPointsRequest());
  const shouldAutoSelectPerson = infoPanelMode !== 'filter';

  allPeople = payload.people || [];
  allCustomPoints = payload.customPoints || [];
  const nextPerson = shouldAutoSelectPerson
    ? hasActiveMapDateFilter()
      ? resolveVisiblePersonSelection(allPeople)
      : resolveCurrentPersonSelection(allPeople)
    : null;

  clearActiveSelection({ resetPanel: shouldAutoSelectPerson ? !nextPerson : false });

  if (nextPerson) {
    focusSelectionOnMap(nextPerson);
    void selectPersonPoint(nextPerson, null, { historyMode: 'restore' });
  }

  if (infoPanelMode === 'history') {
    paintHistorySelection();
  }

  if (infoPanelMode === 'filter') {
    paintFilterPanel();
  }

  if (infoPanelMode === 'search' && personSearchState.hasLoaded) {
    void loadPersonSearchResults(personSearchState.query, { showLoadingState: false });
  }

  scheduleVisibleMarkerSync(0);
}

function buildMapPointsRequest() {
  const payload = {
    query: '',
    includeUnresolved: false
  };

  if (!hasActiveMapDateFilter()) {
    return payload;
  }

  return {
    ...payload,
    dateField: 'lastVisitAt',
    dateFrom: mapDateFilter.dateFrom || undefined,
    dateTo: mapDateFilter.dateTo || undefined
  };
}

function scheduleMapDateFilterApply() {
  if (mapDateFilterApplyTimer) {
    window.clearTimeout(mapDateFilterApplyTimer);
    mapDateFilterApplyTimer = null;
  }

  mapDateFilterApplyTimer = window.setTimeout(() => {
    mapDateFilterApplyTimer = null;
    void applyMapDateFilter({
      ...mapDateFilterDraft
    });
  }, 0);
}

function hasActiveMapDateFilter() {
  return Boolean(mapDateFilter.dateFrom || mapDateFilter.dateTo);
}

function hasMapDateFilterDraftValue(input = mapDateFilterDraft) {
  const draft = normalizeMapDateFilterDraft(input);
  return Boolean(draft.fromMonth || draft.fromYear || draft.toMonth || draft.toYear);
}

async function applyMapDateFilter(nextFilter) {
  const normalizedFilter = normalizeMapDateFilter(nextFilter);
  mapDateFilterDraft = resolveMapDateFilterDraft(nextFilter, normalizedFilter);
  mapDateFilterHasInvalidRange = hasInvalidMapDateRangeDraft(mapDateFilterDraft);
  persistMapDateFilterState();

  if (mapDateFilterHasInvalidRange) {
    if (infoPanelMode === 'filter') {
      paintFilterPanel();
    }
    return;
  }

  const didChange =
    normalizedFilter.dateFrom !== mapDateFilter.dateFrom || normalizedFilter.dateTo !== mapDateFilter.dateTo;

  mapDateFilter = normalizedFilter;
  syncInfoToolButtons();

  if (!didChange) {
    if (infoPanelMode === 'filter') {
      paintFilterPanel();
    }
    return;
  }

  await loadPoints();
}

function normalizeMapDateFilter(input = {}) {
  let dateFrom = '';
  let dateTo = '';
  const normalizedFromMonth = normalizeMonthNumberInputValue(input?.fromMonth);
  const normalizedFromYear = normalizeYearInputValue(input?.fromYear);
  const normalizedToMonth = normalizeMonthNumberInputValue(input?.toMonth);
  const normalizedToYear = normalizeYearInputValue(input?.toYear);

  if (normalizedFromYear) {
    dateFrom = `${normalizedFromYear}-${normalizedFromMonth || '01'}-01`;
  } else if (normalizeMonthInputValue(input?.monthFrom)) {
    dateFrom = `${normalizeMonthInputValue(input?.monthFrom)}-01`;
  } else {
    dateFrom = normalizeDateInputValue(input?.dateFrom);
  }

  if (normalizedToYear) {
    dateTo = normalizedToMonth
      ? getMonthEndDate(`${normalizedToYear}-${normalizedToMonth}`)
      : `${normalizedToYear}-12-31`;
  } else if (normalizeMonthInputValue(input?.monthTo)) {
    dateTo = getMonthEndDate(normalizeMonthInputValue(input?.monthTo));
  } else {
    dateTo = normalizeDateInputValue(input?.dateTo);
  }

  return {
    dateFrom,
    dateTo
  };
}

function normalizeDateInputValue(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    const exactDateMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}$/);
    if (exactDateMatch) {
      return exactDateMatch[0];
    }

    const isoDateMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
    if (isoDateMatch) {
      return isoDateMatch[0];
    }
  }

  if (!value) {
    return '';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return parsedDate.toISOString().slice(0, 10);
}

function normalizeMapDateFilterDraft(input = {}) {
  return {
    fromMonth: normalizeMonthNumberInputValue(input?.fromMonth),
    fromYear: normalizeYearInputValue(input?.fromYear),
    toMonth: normalizeMonthNumberInputValue(input?.toMonth),
    toYear: normalizeYearInputValue(input?.toYear)
  };
}

function hasInvalidMapDateRangeDraft(input = mapDateFilterDraft) {
  const draft = normalizeMapDateFilterDraft(input);
  const fromDate = buildDraftStartComparableDate(draft);
  const toDate = buildDraftEndComparableDate(draft);
  if (!fromDate || !toDate) {
    return false;
  }

  return Boolean(fromDate && toDate && fromDate > toDate);
}

function buildDraftStartComparableDate(draft) {
  if (!draft?.fromYear) {
    return EARLIEST_COMPARABLE_DATE;
  }

  const month = draft.fromMonth || '01';
  return `${draft.fromYear}-${month}-01`;
}

function buildDraftEndComparableDate(draft) {
  if (!draft?.toYear) {
    return LATEST_COMPARABLE_DATE;
  }

  if (draft.toMonth) {
    return getMonthEndDate(`${draft.toYear}-${draft.toMonth}`);
  }

  return `${draft.toYear}-12-31`;
}

function normalizeMonthInputValue(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : '';
}

function normalizeMonthNumberInputValue(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return /^(0[1-9]|1[0-2])$/.test(trimmed) ? trimmed : '';
}

function normalizeYearInputValue(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return /^\d{4}$/.test(trimmed) ? trimmed : '';
}

function getMonthEndDate(monthValue) {
  const normalized = normalizeMonthInputValue(monthValue);
  if (!normalized) {
    return '';
  }

  const [yearPart, monthPart] = normalized.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 1 || monthIndex > 12) {
    return '';
  }

  const lastDay = new Date(Date.UTC(year, monthIndex, 0));
  return lastDay.toISOString().slice(0, 10);
}

function extractMonthValue(dateValue) {
  const normalizedDate = normalizeDateInputValue(dateValue);
  return normalizedDate ? normalizedDate.slice(0, 7) : '';
}

function extractYearValue(dateValue) {
  const monthValue = extractMonthValue(dateValue);
  return monthValue ? monthValue.slice(0, 4) : '';
}

function extractMonthNumberValue(dateValue) {
  const monthValue = extractMonthValue(dateValue);
  return monthValue ? monthValue.slice(5, 7) : '';
}

function buildMapDateFilterDraft(filter = {}) {
  return {
    fromMonth: extractMonthNumberValue(filter.dateFrom),
    fromYear: extractYearValue(filter.dateFrom),
    toMonth: extractMonthNumberValue(filter.dateTo),
    toYear: extractYearValue(filter.dateTo)
  };
}

function resolveMapDateFilterDraft(nextFilter = {}, normalizedFilter = mapDateFilter) {
  const nextDraft = normalizeMapDateFilterDraft(nextFilter);
  if (nextDraft.fromMonth || nextDraft.fromYear || nextDraft.toMonth || nextDraft.toYear) {
    return nextDraft;
  }

  return buildMapDateFilterDraft(normalizedFilter);
}

function formatMonthYear(monthValue) {
  const normalized = normalizeMonthInputValue(monthValue);
  if (!normalized) {
    return 'Brak';
  }

  const [yearPart, monthPart] = normalized.split('-');
  const monthIndex = Number(monthPart) - 1;
  return `${MONTH_LABELS[monthIndex] || monthPart} ${yearPart}`;
}

function buildMonthNumberOptionsMarkup(selectedValue) {
  const normalizedSelectedValue = normalizeMonthNumberInputValue(selectedValue);
  const options = ['<option value="">Miesiac</option>'];

  MONTH_LABELS.forEach((label, index) => {
    const monthValue = String(index + 1).padStart(2, '0');
    options.push(
      `<option value="${monthValue}"${monthValue === normalizedSelectedValue ? ' selected' : ''}>${escapeHtml(label)}</option>`
    );
  });

  return options.join('');
}

function buildYearOptionsMarkup(selectedValue) {
  const normalizedSelectedValue = normalizeYearInputValue(selectedValue);
  const values = getMapDateFilterYears();
  const options = ['<option value="">Rok</option>'];

  values.forEach((yearValue) => {
    options.push(
      `<option value="${yearValue}"${yearValue === normalizedSelectedValue ? ' selected' : ''}>${escapeHtml(yearValue)}</option>`
    );
  });

  return options.join('');
}

function getMapDateFilterYears() {
  const years = new Set(
    mapDateFilterOptions
      .map((monthValue) => normalizeMonthInputValue(monthValue))
      .filter(Boolean)
      .map((monthValue) => monthValue.slice(0, 4))
  );

  return Array.from(years).sort((left, right) => right.localeCompare(left));
}

async function loadMapDateFilterOptions() {
  const options = await window.appApi.getMapDateFilterOptions();
  mapDateFilterOptions = Array.isArray(options)
    ? options.filter((value) => normalizeMonthInputValue(value))
    : [];

  if (infoPanelMode === 'filter') {
    paintFilterPanel();
  }
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

function resolveVisiblePersonSelection(people) {
  if (!Array.isArray(people) || people.length === 0) {
    return null;
  }

  const currentPersonId = personSelectionHistory.entries[personSelectionHistory.index];
  if (currentPersonId) {
    const matchingPerson = people.find((person) => person.sourceRowId === currentPersonId);
    if (matchingPerson) {
      return matchingPerson;
    }
  }

  const activePersonId = activeSelection?.type === 'person' ? activeSelection.key.replace(/^person:/, '') : null;
  if (activePersonId) {
    const activePerson = people.find((person) => person.sourceRowId === activePersonId);
    if (activePerson) {
      return activePerson;
    }
  }

  const lastSelectedPersonId = readLastSelectedPersonId();
  if (lastSelectedPersonId) {
    const lastSelectedPerson = people.find((person) => person.sourceRowId === lastSelectedPersonId);
    if (lastSelectedPerson) {
      return lastSelectedPerson;
    }
  }

  return people[0];
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

function normalizePersonSelectionHistory(input) {
  const entries = Array.isArray(input?.entries)
    ? input.entries
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    : [];
  const trimmedEntries = entries.slice(-MAX_PERSON_SELECTION_HISTORY_ENTRIES);
  const removedEntriesCount = entries.length - trimmedEntries.length;
  const fallbackIndex = trimmedEntries.length > 0 ? trimmedEntries.length - 1 : -1;
  const rawIndex = Number(input?.index);
  const normalizedIndex = Number.isInteger(rawIndex) ? rawIndex - removedEntriesCount : fallbackIndex;

  if (trimmedEntries.length === 0) {
    return {
      entries: [],
      index: -1
    };
  }

  return {
    entries: trimmedEntries,
    index: clampHistoryIndex(normalizedIndex, trimmedEntries.length)
  };
}

function readPersonSelectionHistory() {
  try {
    const raw = window.localStorage.getItem(PERSON_SELECTION_HISTORY_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return normalizePersonSelectionHistory(JSON.parse(raw));
  } catch (_error) {
    return null;
  }
}

function writePersonSelectionHistoryCache(historyState) {
  const normalizedHistory = normalizePersonSelectionHistory(historyState);

  try {
    window.localStorage.setItem(
      PERSON_SELECTION_HISTORY_STORAGE_KEY,
      JSON.stringify(normalizedHistory)
    );
  } catch (_error) {
    // Ignore storage failures and keep the current session working.
  }

  return normalizedHistory;
}

function persistPersonSelectionHistory() {
  personSelectionHistory = writePersonSelectionHistoryCache(personSelectionHistory);
  void window.appApi.setMapSelectionHistory(personSelectionHistory).catch(() => {});

  if (infoPanelMode === 'history') {
    paintHistorySelection();
  }
}

async function hydratePersonSelectionHistory() {
  let persistedHistory = null;

  try {
    const storedHistory = await window.appApi.getMapSelectionHistory();
    if (storedHistory) {
      persistedHistory = normalizePersonSelectionHistory(storedHistory);
    }
  } catch (_error) {
    persistedHistory = null;
  }

  if (persistedHistory) {
    personSelectionHistory = persistedHistory;
    writePersonSelectionHistoryCache(persistedHistory);
    return;
  }

  const cachedHistory = readPersonSelectionHistory();
  if (!cachedHistory) {
    return;
  }

  personSelectionHistory = cachedHistory;
  persistPersonSelectionHistory();
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

function readStoredMapPanelState() {
  const defaultState = {
    activePanel: DEFAULT_INFO_PANEL_MODE,
    infoPanelMode: DEFAULT_INFO_PANEL_MODE
  };

  try {
    const raw = window.localStorage.getItem(LAST_OPENED_MAP_PANEL_STORAGE_KEY);
    if (!raw) {
      return defaultState;
    }

    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') {
      const activePanel = parsed === SETTINGS_PANEL_STORAGE_STATE
        ? SETTINGS_PANEL_STORAGE_STATE
        : normalizeInfoPanelMode(parsed);
      return {
        activePanel,
        infoPanelMode: activePanel === SETTINGS_PANEL_STORAGE_STATE
          ? DEFAULT_INFO_PANEL_MODE
          : activePanel
      };
    }

    const infoPanelMode = normalizeInfoPanelMode(parsed?.infoPanelMode);
    const activePanel = parsed?.activePanel === SETTINGS_PANEL_STORAGE_STATE
      ? SETTINGS_PANEL_STORAGE_STATE
      : normalizeInfoPanelMode(parsed?.activePanel || infoPanelMode);

    return {
      activePanel,
      infoPanelMode
    };
  } catch (_error) {
    return defaultState;
  }
}

function persistMapPanelState() {
  try {
    window.localStorage.setItem(
      LAST_OPENED_MAP_PANEL_STORAGE_KEY,
      JSON.stringify({
        activePanel: isSettingsOpen ? SETTINGS_PANEL_STORAGE_STATE : infoPanelMode,
        infoPanelMode: normalizeInfoPanelMode(infoPanelMode)
      })
    );
  } catch (_error) {
    // Ignore storage failures and keep the current session working.
  }
}

function readStoredMapDateFilterState() {
  try {
    const raw = window.localStorage.getItem(MAP_DATE_FILTER_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return normalizeMapDateFilterDraft(parsed);
  } catch (_error) {
    return {};
  }
}

function persistMapDateFilterState() {
  try {
    window.localStorage.setItem(
      MAP_DATE_FILTER_STORAGE_KEY,
      JSON.stringify(normalizeMapDateFilterDraft(mapDateFilterDraft))
    );
  } catch (_error) {
    // Ignore storage failures and keep the current session working.
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

  if (infoPanelMode === 'filter') {
    paintFilterPanel();
  }

  if (infoPanelMode === 'search') {
    paintSearchPanel();
  }
}

function clearActiveSelection(options = {}) {
  selectionRequestToken += 1;

  if (activeSelection?.marker) {
    resetMarkerSelection(activeSelection.marker, activeSelection.type);
  }

  activeSelection = null;

  if (infoPanelMode === 'filter') {
    paintFilterPanel();
  }

  if (infoPanelMode === 'search') {
    paintSearchPanel();
  }

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
  syncOverviewSpacing(false);
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
  syncOverviewSpacing(false);
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
  syncOverviewSpacing(false);
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
  syncOverviewSpacing(false);
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
  const nextMode = normalizeInfoPanelMode(mode);
  if (infoPanelMode === nextMode) {
    return;
  }

  infoPanelMode = nextMode;
  syncInfoToolButtons();
  persistMapPanelState();
  renderCurrentInfoPanel();
}

function renderCurrentInfoPanel() {
  if (infoPanelMode === 'stats') {
    paintStatsSelection(latestOverviewSummary);
    return;
  }

  if (infoPanelMode === 'history') {
    paintHistorySelection();
    return;
  }

  if (infoPanelMode === 'filter') {
    paintFilterPanel();
    return;
  }

  if (infoPanelMode === 'search') {
    paintSearchPanel();
    if (!personSearchState.hasLoaded) {
      void loadPersonSearchResults(personSearchState.query, { showLoadingState: true });
    } else if (!isSettingsOpen) {
      requestAnimationFrame(() => {
        focusMapSearchInput();
      });
    }
    return;
  }

  paintSelectionPanelState();
}

function normalizeInfoPanelMode(value) {
  return INFO_PANEL_MODES.includes(value) ? value : DEFAULT_INFO_PANEL_MODE;
}

function syncInfoToolButtons() {
  const shouldHighlightInfoMode = !isSettingsOpen;
  const isStatsMode = shouldHighlightInfoMode && infoPanelMode === 'stats';
  const isSelectionMode = shouldHighlightInfoMode && infoPanelMode === 'selection';
  const isSearchMode = shouldHighlightInfoMode && infoPanelMode === 'search';
  const isHistoryMode = shouldHighlightInfoMode && infoPanelMode === 'history';
  const isFilterMode =
    shouldHighlightInfoMode && (infoPanelMode === 'filter' || hasActiveMapDateFilter());

  statsButtonEl?.classList.toggle('is-active', isStatsMode);
  statsButtonEl?.setAttribute('aria-pressed', String(isStatsMode));

  selectionButtonEl?.classList.toggle('is-active', isSelectionMode);
  selectionButtonEl?.setAttribute('aria-pressed', String(isSelectionMode));

  searchButtonEl?.classList.toggle('is-active', isSearchMode);
  searchButtonEl?.setAttribute('aria-pressed', String(isSearchMode));

  historyButtonEl?.classList.toggle('is-active', isHistoryMode);
  historyButtonEl?.setAttribute('aria-pressed', String(isHistoryMode));

  filterButtonEl?.classList.toggle('is-active', isFilterMode);
  filterButtonEl?.setAttribute('aria-pressed', String(isFilterMode));
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
  syncOverviewSpacing(false);
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

function paintSearchPanel() {
  syncOverviewSpacing(false);
  overviewDefaultEls.forEach((element) => {
    element.hidden = true;
  });

  const query = personSearchState.query.trim();
  const resultCountLabel = personSearchState.isLoading
    ? 'Ladowanie...'
    : personSearchState.hasLoaded
      ? `${formatNumber(personSearchState.results.length)} wynikow`
      : 'Brak wynikow';
  const helperText = query
    ? `Wyszukiwanie po wszystkich polach i datach dla: ${query}`
    : 'Wpisz imie, nazwisko, adres, telefon albo date, np. 2025-03-10 lub 10.03.2025.';

  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = 'Wyszukiwanie osob';
  selectionCopyEl.hidden = true;
  selectionMetaEl.innerHTML = renderKeyValueList([
    { label: 'Zakres', value: 'Wszystkie pola rekordu' },
    { label: 'Zapytanie', value: query || 'Brak' },
    { label: 'Wyniki', value: resultCountLabel }
  ]);
  selectionMetaEl.hidden = false;
  selectionExtraEl.innerHTML = `
    <form class="time-filter-panel" data-map-person-search-form>
      <label class="field">
        <span>Szukaj po wszystkich polach, takze po datach</span>
        <div class="search-input-wrap">
          <span class="search-input-icon" aria-hidden="true">
            <i class="fa-solid fa-magnifying-glass"></i>
          </span>
          <input
            type="search"
            name="query"
            value="${escapeHtml(personSearchState.query)}"
            placeholder="Np. Nabialek, Przyrow, 600, 2025-03-10, 10.03.2025"
            data-map-person-search-input
          />
        </div>
      </label>
      <div class="time-filter-summary">
        <strong>${escapeHtml(resultCountLabel)}</strong>
        <span>${escapeHtml(helperText)}</span>
      </div>
      <div class="action-row">
        <button type="submit" class="button-strong">Szukaj</button>
        <button type="button" class="button-muted" data-map-person-search-clear${query ? '' : ' disabled'}>
          Wyczysc
        </button>
      </div>
      <div class="vertical-list compact-list">
        ${renderPersonSearchResults()}
      </div>
    </form>
  `;
  selectionExtraEl.hidden = false;

  if (!isSettingsOpen) {
    requestAnimationFrame(() => {
      focusMapSearchInput();
    });
  }
}

function renderPersonSearchResults() {
  if (personSearchState.isLoading && !personSearchState.hasLoaded) {
    return '<p class="empty-state">Ladowanie wynikow wyszukiwania...</p>';
  }

  if (personSearchState.results.length === 0) {
    return personSearchState.query.trim()
      ? '<p class="empty-state">Brak wynikow dla podanego zapytania.</p>'
      : '<p class="empty-state">Wpisz zapytanie, aby wyszukac osobe po wszystkich polach i datach.</p>';
  }

  const currentSelectedPersonId = getCurrentSelectedPersonSourceRowId();

  return personSearchState.results
    .map((person) => {
      const isVisibleOnMap = allPeople.some((entry) => entry.sourceRowId === person.sourceRowId);
      const isCurrent = person.sourceRowId === currentSelectedPersonId;
      const locationLabel = Number.isFinite(person.lat) && Number.isFinite(person.lng)
        ? isVisibleOnMap
          ? 'Widoczna na mapie'
          : 'Poza biezacym filtrem mapy'
        : 'Brak wspolrzednych';

      return `
        <button
          type="button"
          class="person-row map-history-row${isCurrent ? ' is-current' : ''}"
          data-map-search-source-row-id="${escapeHtml(person.sourceRowId)}"
        >
          <div class="list-card-heading">
            <strong>${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</strong>
          </div>
          <span>${escapeHtml(person.routeAddress || person.addressText || 'Brak adresu')}</span>
          <span>Ostatnia wizyta: ${escapeHtml(formatDate(person.lastVisitAt))}</span>
          <span>${escapeHtml(locationLabel)}</span>
        </button>
      `;
    })
    .join('');
}

function paintFilterPanel() {
  syncOverviewSpacing(false, true);
  overviewDefaultEls.forEach((element) => {
    element.hidden = true;
  });

  const fromMonth = mapDateFilterDraft.fromMonth;
  const fromYear = mapDateFilterDraft.fromYear;
  const toMonth = mapDateFilterDraft.toMonth;
  const toYear = mapDateFilterDraft.toYear;
  const hasMonthOptions = mapDateFilterOptions.length > 0;
  const filteredPeopleLabel = allPeople.length === 1 ? '1 osoba' : `${formatNumber(allPeople.length)} osob`;
  const isFromMonthActive = hasMonthOptions && Boolean(fromYear);
  const isToMonthActive = hasMonthOptions && Boolean(toYear);
  const hasInvalidDateRange = mapDateFilterHasInvalidRange;
  const hasDraftValue = hasMapDateFilterDraftValue();

  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = 'Filtr dat';
  selectionCopyEl.hidden = true;
  selectionMetaEl.innerHTML = '';
  selectionMetaEl.hidden = true;
  selectionExtraEl.innerHTML = `
    <form class="time-filter-panel" data-map-date-filter-form>
      <div class="filter-date-stack">
        <div class="field filter-date-box">
          <span>Data poczatkowa</span>
          <div class="filter-date-box-grid">
            <div class="select-wrap${hasInvalidDateRange ? ' is-invalid' : ''}">
              <select name="fromYear"${hasMonthOptions ? '' : ' disabled'}>
                ${buildYearOptionsMarkup(fromYear)}
              </select>
            </div>
            <div class="select-wrap${isFromMonthActive ? '' : ' is-dimmed'}${hasInvalidDateRange ? ' is-invalid' : ''}">
              <select name="fromMonth"${hasMonthOptions ? '' : ' disabled'}>
                ${buildMonthNumberOptionsMarkup(fromMonth)}
              </select>
            </div>
          </div>
        </div>
        <div class="field filter-date-box">
          <span>Data koncowa</span>
          <div class="filter-date-box-grid">
            <div class="select-wrap${hasInvalidDateRange ? ' is-invalid' : ''}">
              <select name="toYear"${hasMonthOptions ? '' : ' disabled'}>
                ${buildYearOptionsMarkup(toYear)}
              </select>
            </div>
            <div class="select-wrap${isToMonthActive ? '' : ' is-dimmed'}${hasInvalidDateRange ? ' is-invalid' : ''}">
              <select name="toMonth"${hasMonthOptions ? '' : ' disabled'}>
                ${buildMonthNumberOptionsMarkup(toMonth)}
              </select>
            </div>
          </div>
        </div>
      </div>
      <div class="action-row filter-action-row">
        <span class="filter-action-count">${escapeHtml(filteredPeopleLabel)}</span>
        <button type="button" data-map-date-filter-reset${hasDraftValue ? '' : ' disabled'}>
          Wyczysc
        </button>
      </div>
      <div class="vertical-list compact-list">
        ${renderMapDateFilterResults()}
      </div>
    </form>
  `;
  selectionExtraEl.hidden = false;
}

function renderMapDateFilterResults() {
  if (allPeople.length === 0) {
    return hasActiveMapDateFilter()
      ? '<p class="empty-state">Brak osob pasujacych do wybranego zakresu dat.</p>'
      : '<p class="empty-state">Brak osob dostepnych na mapie dla biezacych danych.</p>';
  }

  const currentSelectedPersonId = getCurrentSelectedPersonSourceRowId();

  return allPeople
    .map((person) => {
      const isCurrent = person.sourceRowId === currentSelectedPersonId;
      return `
        <button
          type="button"
          class="person-row map-history-row${isCurrent ? ' is-current' : ''}"
          data-map-filter-source-row-id="${escapeHtml(person.sourceRowId)}"
        >
          <div class="list-card-heading">
            <strong>${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</strong>
          </div>
          <span>${escapeHtml(person.routeAddress || person.addressText || 'Brak adresu')}</span>
          <span>Ostatnia wizyta: ${escapeHtml(formatDate(person.lastVisitAt))}</span>
        </button>
      `;
    })
    .join('');
}

function getCurrentSelectedPersonSourceRowId() {
  if (activeSelection?.type === 'person' && activeSelection.key) {
    return activeSelection.key.replace(/^person:/, '');
  }

  if (personSelectionHistory.index >= 0) {
    return personSelectionHistory.entries[personSelectionHistory.index] || null;
  }

  return null;
}

function updatePersonSearchQuery(nextQuery, options = {}) {
  personSearchState = {
    ...personSearchState,
    query: String(nextQuery || '')
  };

  const clearButton = selectionExtraEl?.querySelector('[data-map-person-search-clear]');
  if (clearButton) {
    clearButton.disabled = !personSearchState.query.trim();
  }

  if (personSearchTimer) {
    window.clearTimeout(personSearchTimer);
    personSearchTimer = null;
  }

  if (options.immediate) {
    void loadPersonSearchResults(personSearchState.query, { showLoadingState: true });
    return;
  }

  personSearchTimer = window.setTimeout(() => {
    personSearchTimer = null;
    void loadPersonSearchResults(personSearchState.query, { showLoadingState: true });
  }, MAP_PERSON_SEARCH_DEBOUNCE_MS);
}

async function loadPersonSearchResults(query, options = {}) {
  personSearchRequestToken += 1;
  const requestToken = personSearchRequestToken;
  const normalizedQuery = String(query || '');
  const showLoadingState = options.showLoadingState !== false;

  personSearchState = {
    ...personSearchState,
    query: normalizedQuery,
    isLoading: showLoadingState
  };

  if (infoPanelMode === 'search') {
    paintSearchPanel();
  }

  const results = await window.appApi.listPeople({
    query: normalizedQuery,
    limit: MAP_PERSON_SEARCH_LIMIT
  });

  if (requestToken !== personSearchRequestToken) {
    return;
  }

  personSearchState = {
    query: normalizedQuery,
    results: Array.isArray(results) ? results : [],
    isLoading: false,
    hasLoaded: true
  };

  if (infoPanelMode === 'search') {
    paintSearchPanel();
  }
}

function focusMapSearchInput() {
  const searchInput = selectionExtraEl?.querySelector('[data-map-person-search-input]');
  if (!searchInput) {
    return;
  }

  searchInput.focus();
  searchInput.setSelectionRange?.(searchInput.value.length, searchInput.value.length);
}

function paintHistorySelection() {
  syncOverviewSpacing(true);
  const historyEntries = personSelectionHistory.entries
    .map((sourceRowId, index) => {
      const person = allPeople.find((entry) => entry.sourceRowId === sourceRowId);
      return {
        index,
        sourceRowId,
        person
      };
    })
    .filter((entry) => entry.person)
    .reverse();

  overviewDefaultEls.forEach((element) => {
    element.hidden = true;
  });

  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = 'Historia przegladania';
  selectionCopyEl.textContent = '';
  selectionCopyEl.hidden = true;
  selectionMetaEl.innerHTML = '';
  selectionMetaEl.hidden = true;

  if (historyEntries.length === 0) {
    selectionExtraEl.innerHTML = '<p class="empty-state">Historia wyboru osob jest jeszcze pusta.</p>';
    selectionExtraEl.hidden = false;
    return;
  }

  selectionExtraEl.innerHTML = `
    ${historyEntries
      .map(({ index, sourceRowId, person }) => {
        const isCurrent = index === personSelectionHistory.index;
        return `
          <button
            type="button"
            class="person-row map-history-row${isCurrent ? ' is-current' : ''}"
            data-history-source-row-id="${escapeHtml(sourceRowId)}"
          >
            <div class="list-card-heading">
              <strong>${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</strong>
            </div>
            <span>${escapeHtml(person.routeAddress || person.addressText || 'Brak adresu')}</span>
            <span>Ostatnia wizyta: ${escapeHtml(formatDate(person.lastVisitAt))}</span>
          </button>
        `;
      })
      .join('')}
  `;
  selectionExtraEl.hidden = false;
}

function syncOverviewSpacing(isHistoryMode, isFilterMode = false) {
  overviewViewEl?.classList.toggle('map-info-view-history', Boolean(isHistoryMode));
  overviewViewEl?.classList.toggle('map-info-view-filter', Boolean(isFilterMode));
  selectionExtraEl?.classList.toggle('map-selection-cards-history', Boolean(isHistoryMode));
  selectionExtraEl?.classList.toggle('map-selection-cards-filter', Boolean(isFilterMode));
}
