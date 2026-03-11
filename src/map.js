import {
  escapeHtml,
  formatDate,
  formatDateTime,
  formatNumber,
  initShell,
  pickRecordValue,
  renderRecordFields,
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

const PERSON_LOCATION_MARKER_OPACITY = 0.5;
const PERSON_LOCATION_HIGHLIGHT_MARKER_OPACITY = 1;
const DEFAULT_PERSON_MARKER_STYLE = {
  radius: 7,
  color: '#23412e',
  opacity: PERSON_LOCATION_MARKER_OPACITY,
  weight: 2,
  fillColor: '#4db06f',
  fillOpacity: PERSON_LOCATION_MARKER_OPACITY
};
const ACTIVE_PERSON_MARKER_STYLE = {
  radius: 9,
  color: '#7f3512',
  opacity: PERSON_LOCATION_HIGHLIGHT_MARKER_OPACITY,
  weight: 3,
  fillColor: '#f1a167',
  fillOpacity: PERSON_LOCATION_HIGHLIGHT_MARKER_OPACITY
};
const HOVER_PERSON_MARKER_STYLE = {
  radius: 9,
  color: '#1e4f86',
  opacity: PERSON_LOCATION_HIGHLIGHT_MARKER_OPACITY,
  weight: 3,
  fillColor: '#79b7ff',
  fillOpacity: PERSON_LOCATION_HIGHLIGHT_MARKER_OPACITY
};
const SUPPLEMENTAL_PERSON_ICON_SIZE = 26;
const SUPPLEMENTAL_PERSON_ICON_RADIUS = 9;

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
const HOVERED_PERSON_PREVIEW_DELAY_MS = 320;
const HOVERED_PERSON_RESTORE_DELAY_MS = 160;
const HOVERED_PERSON_PREVIEW_PAN_DURATION_MS = 560;
const HOVERED_PERSON_RESTORE_PAN_DURATION_MS = 420;
const LAST_SELECTED_PERSON_STORAGE_KEY = 'map:lastSelectedPersonId';
const LAST_SELECTED_PERSON_DETAILS_STORAGE_KEY = 'people:lastSelectedPersonDetails';
const PERSON_SELECTION_HISTORY_STORAGE_KEY = 'map:personSelectionHistory';
const MAX_PERSON_SELECTION_HISTORY_ENTRIES = 100;
const MAP_NAVIGATION_HISTORY_STATE_KIND = 'map-navigation';
const MAP_PERSON_SEARCH_BATCH_SIZE = 50;
const MAP_PERSON_SEARCH_DEBOUNCE_MS = 160;
const MAP_PERSON_SEARCH_SCROLL_THRESHOLD_PX = 120;
const MAP_PERSON_SEARCH_ROW_GAP_PX = 10;
const MAP_PERSON_SEARCH_ESTIMATED_ROW_HEIGHT_PX = 108;
const MAP_DATE_FILTER_BATCH_SIZE = 50;
const MAP_DATE_FILTER_SCROLL_THRESHOLD_PX = 120;
const MAP_DATE_FILTER_ROW_GAP_PX = 10;
const MAP_DATE_FILTER_ESTIMATED_ROW_HEIGHT_PX = 96;
const LAST_OPENED_MAP_PANEL_STORAGE_KEY = 'map:lastOpenedPanelState';
const MAP_VIEWPORT_STORAGE_KEY = 'map:viewportState';
const MAP_DATE_FILTER_STORAGE_KEY = 'map:dateFilterState';
const RAW_FIELDS_EXPANDED_STORAGE_KEY = 'person:rawFieldsExpanded';
const LEGACY_MAP_RAW_FIELDS_EXPANDED_STORAGE_KEY = 'map:rawFieldsExpanded';
const LEGACY_PEOPLE_RAW_FIELDS_EXPANDED_STORAGE_KEY = 'people:rawFieldsExpanded';
const DEFAULT_INFO_PANEL_MODE = 'selection';
const SETTINGS_PANEL_STORAGE_STATE = 'settings';
const INFO_PANEL_MODES = ['selection', 'search', 'history', 'filter'];
const MONTH_LABELS = ['Styczen', 'Luty', 'Marzec', 'Kwiecien', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpien', 'Wrzesien', 'Pazdziernik', 'Listopad', 'Grudzien'];
const EARLIEST_COMPARABLE_DATE = '0001-01-01';
const LATEST_COMPARABLE_DATE = '9999-12-31';
const restoredMapPanelState = readStoredMapPanelState();
const restoredMapViewportState = readStoredMapViewportState();
const restoredMapDateFilterState = readStoredMapDateFilterState();

let mapInstance;
let peopleLayer;
let supplementalPeopleLayer;
let customLayer;
let personRenderer;
let allPeople = [];
let allCustomPoints = [];
let visiblePeopleMarkers = new Map();
let supplementalPeopleMarkers = new Map();
let visibleCustomMarkers = new Map();
let knownPeopleBySourceRowId = new Map();
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
let navigationHistoryState = {
  currentId: 0,
  maxId: 0
};
let shouldRestoreMapViewportOnNextLoad = Boolean(restoredMapViewportState);
let mapDateFilterHasInvalidRange = hasInvalidMapDateRangeDraft(restoredMapDateFilterState);
let mapDateFilter = mapDateFilterHasInvalidRange
  ? normalizeMapDateFilter({})
  : normalizeMapDateFilter(restoredMapDateFilterState);
let mapDateFilterOptions = [];
let mapDateFilterDraft = resolveMapDateFilterDraft(restoredMapDateFilterState, mapDateFilter);
let mapDateFilterApplyTimer = null;
let personSearchTimer = null;
let personSearchRequestToken = 0;
let areMapRawFieldsExpanded = readStoredMapRawFieldsExpanded();
let personSearchState = {
  query: '',
  results: [],
  total: 0,
  isLoading: false,
  hasLoaded: false,
  hasMore: false
};
let mapSearchRowHeight = MAP_PERSON_SEARCH_ESTIMATED_ROW_HEIGHT_PX;
let mapDateFilterRenderedCount = 0;
let mapDateFilterRowHeight = MAP_DATE_FILTER_ESTIMATED_ROW_HEIGHT_PX;
let hoveredPersonSourceRowId = null;
let hoveredPersonPreviewedSourceRowId = null;
let hoveredPersonMapRestoreState = null;
let selectionExtraPointerState = {
  clientX: null,
  clientY: null,
  isInside: false
};
let hoveredPersonPointerSyncFrame = 0;
let hoveredPersonPointerSyncTimeout = 0;
let hoveredPersonPreviewTimer = 0;
let hoveredPersonRestoreTimer = 0;
let hoveredPersonMapAnimationFrame = 0;
let historyPeopleLoadingSourceRowIds = new Set();

settingsButtonEl?.addEventListener('click', () => {
  toggleSettingsPanel(undefined, { historyEntry: 'push' });
});

selectionButtonEl?.addEventListener('click', () => {
  openInfoPanelMode('selection');
});

searchButtonEl?.addEventListener('click', () => {
  if (!openInfoPanelMode('search')) {
    focusMapSearchInput();
  }
});

historyButtonEl?.addEventListener('click', () => {
  openInfoPanelMode('history');
});

filterButtonEl?.addEventListener('click', () => {
  openInfoPanelMode('filter');
});

selectionExtraEl?.addEventListener('click', (event) => {
  const rawFieldsToggleButton = event.target.closest('[data-map-toggle-raw-fields]');
  if (rawFieldsToggleButton && infoPanelMode === 'selection' && selectionPanelState.kind === 'person') {
    areMapRawFieldsExpanded = !areMapRawFieldsExpanded;
    persistMapRawFieldsExpanded();
    paintPersonSelection(selectionPanelState.details);
    return;
  }

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
    const person = findPersonBySourceRowId(sourceRowId);
    if (!person) {
      return;
    }

    focusSelectionOnMap(person);
    void selectPersonPoint(person, getPersonMarkerBySourceRowId(sourceRowId), {
      panelMode: 'selection'
    });
  }

  const historyNavButton = event.target.closest('[data-history-nav]');
  if (!historyNavButton || infoPanelMode !== 'history') {
    return;
  }

  if (historyNavButton.getAttribute('data-history-nav') === 'back') {
    if (navigationHistoryState.currentId > 0) {
      history.back();
    }
    return;
  }

  if (navigationHistoryState.currentId < navigationHistoryState.maxId) {
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

selectionExtraEl?.addEventListener('mouseover', (event) => {
  const personRow = event.target.closest('[data-map-hover-source-row-id]');
  if (!personRow || personRow.contains(event.relatedTarget)) {
    return;
  }

  setHoveredPersonSourceRowId(personRow.getAttribute('data-map-hover-source-row-id'));
});

selectionExtraEl?.addEventListener('mouseout', (event) => {
  const personRow = event.target.closest('[data-map-hover-source-row-id]');
  if (!personRow || personRow.contains(event.relatedTarget)) {
    return;
  }

  scheduleHoveredPersonSourceRowIdClear();
});

selectionExtraEl?.addEventListener('pointermove', (event) => {
  selectionExtraPointerState = {
    clientX: event.clientX,
    clientY: event.clientY,
    isInside: true
  };
  scheduleHoveredPersonPointerSync();
});

selectionExtraEl?.addEventListener('pointerleave', () => {
  selectionExtraPointerState = {
    clientX: null,
    clientY: null,
    isInside: false
  };
  scheduleHoveredPersonSourceRowIdClear();
});

selectionExtraEl?.addEventListener(
  'scroll',
  () => {
    scheduleHoveredPersonPointerSync({ afterLayout: true });
  },
  true
);

selectionExtraEl?.addEventListener(
  'wheel',
  (event) => {
    selectionExtraPointerState = {
      clientX: event.clientX,
      clientY: event.clientY,
      isInside: true
    };
    scheduleHoveredPersonPointerSync({ afterLayout: true });
  },
  { passive: true }
);

window.addEventListener('popstate', (event) => {
  handlePersonSelectionPopState(event);
});

window.addEventListener('mouseup', (event) => {
  handleMouseHistoryNavigation(event);
});

window.addEventListener('keydown', (event) => {
  if (handleKeyboardHistoryNavigation(event)) {
    return;
  }

  if (event.key === 'Escape' && isSettingsOpen) {
    toggleSettingsPanel(false, { historyEntry: 'push' });
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

function toggleSettingsPanel(forceState = !isSettingsOpen, options = {}) {
  const nextState = Boolean(forceState);
  if (isSettingsOpen === nextState) {
    return false;
  }

  isSettingsOpen = nextState;
  syncSettingsPanelVisibility();
  persistMapPanelState();
  syncNavigationHistoryState(options.historyEntry);

  requestAnimationFrame(() => {
    mapInstance?.invalidateSize();
  });

  return true;
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

  applyInitialMapViewport();
  peopleLayer = L.layerGroup().addTo(mapInstance);
  supplementalPeopleLayer = L.layerGroup().addTo(mapInstance);
  customLayer = L.layerGroup().addTo(mapInstance);
  mapInstance.on('moveend zoomend', () => {
    persistMapViewportState();
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

  const preserveViewport = shouldRestoreMapViewportOnNextLoad;
  clearHoveredPersonSourceRowId();
  const payload = await window.appApi.getMapPoints(buildMapPointsRequest());
  const shouldAutoSelectPerson = infoPanelMode !== 'filter';

  allPeople = payload.people || [];
  allCustomPoints = payload.customPoints || [];
  mapDateFilterRenderedCount = 0;
  mapDateFilterRowHeight = MAP_DATE_FILTER_ESTIMATED_ROW_HEIGHT_PX;
  cacheKnownPeople(allPeople);
  const nextPerson = shouldAutoSelectPerson
    ? hasActiveMapDateFilter()
      ? resolveVisiblePersonSelection(allPeople)
      : resolveCurrentPersonSelection(allPeople)
    : null;

  clearActiveSelection({ resetPanel: shouldAutoSelectPerson ? !nextPerson : false });

  if (nextPerson) {
    if (!preserveViewport) {
      focusSelectionOnMap(nextPerson);
    }
    void selectPersonPoint(nextPerson, null, { historyMode: 'restore' });
  }

  if (infoPanelMode === 'history') {
    paintHistorySelection();
  }

  if (infoPanelMode === 'filter') {
    paintFilterPanel();
  }

  if (infoPanelMode === 'search' && personSearchState.hasLoaded) {
    personSearchRequestToken += 1;
    void loadPersonSearchResults(personSearchState.query, {
      showLoadingState: false,
      reset: true,
      requestToken: personSearchRequestToken
    });
  }

  shouldRestoreMapViewportOnNextLoad = false;
  syncSupplementalPeopleMarkers();
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

function applyInitialMapViewport() {
  if (!restoredMapViewportState) {
    focusPoland();
    return;
  }

  mapInstance.setView(
    [restoredMapViewportState.center.lat, restoredMapViewportState.center.lng],
    clampMapZoom(mapInstance, restoredMapViewportState.zoom),
    { animate: false }
  );
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
    marker.__personSourceRowId = person.sourceRowId;
    attachLazyPopup(marker, () => buildPersonPopupHtml(person), () => {
      void selectPersonPoint(person, marker, { panelMode: 'selection' });
    });

    if (activeSelection?.key === key) {
      applyMarkerSelection(marker, 'person');
      activeSelection.marker = marker;
    }

    peopleLayer.addLayer(marker);
    visiblePeopleMarkers.set(key, marker);
    syncPersonMarkerAppearance(marker, person.sourceRowId);
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
  return buildPersonKeyFromSourceRowId(person?.sourceRowId);
}

function buildPersonKeyFromSourceRowId(sourceRowId) {
  if (!sourceRowId) {
    return '';
  }

  return `person:${sourceRowId}`;
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
    replaceCurrentNavigationState({
      sourceRowId: null,
      historyIndex: -1
    });
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
  replaceCurrentNavigationState({
    sourceRowId: fallbackPerson.sourceRowId,
    historyIndex: 0
  });
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
    navigationHistoryState = {
      currentId: 0,
      maxId: 0
    };
    replaceCurrentNavigationState({
      sourceRowId: null,
      historyIndex: -1
    });
    return;
  }

  navigationHistoryState = {
    currentId: 0,
    maxId: 0
  };
  history.replaceState(
    buildNavigationHistoryState({
      sourceRowId: currentEntries[0],
      historyIndex: 0,
      isSettingsPanelOpen: personSelectionHistory.index === 0 ? isSettingsOpen : false,
      infoMode: personSelectionHistory.index === 0 ? infoPanelMode : 'selection',
      navigationId: 0
    }),
    document.title
  );

  for (let index = 1; index <= personSelectionHistory.index; index += 1) {
    navigationHistoryState.currentId = index;
    navigationHistoryState.maxId = index;
    history.pushState(
      buildNavigationHistoryState({
        sourceRowId: currentEntries[index],
        historyIndex: index,
        isSettingsPanelOpen: index === personSelectionHistory.index ? isSettingsOpen : false,
        infoMode: index === personSelectionHistory.index ? infoPanelMode : 'selection',
        navigationId: index
      }),
      document.title
    );
  }

  navigationHistoryState.currentId = personSelectionHistory.index;
  navigationHistoryState.maxId = personSelectionHistory.index;
}

function buildNavigationHistoryState({
  sourceRowId = getCurrentSelectedPersonSourceRowId(),
  historyIndex = personSelectionHistory.index,
  isSettingsPanelOpen = isSettingsOpen,
  infoMode = infoPanelMode,
  navigationId = navigationHistoryState.currentId
} = {}) {
  return {
    kind: MAP_NAVIGATION_HISTORY_STATE_KIND,
    sourceRowId: sourceRowId || null,
    historyIndex: Number.isInteger(historyIndex) ? historyIndex : -1,
    infoPanelMode: normalizeInfoPanelMode(infoMode),
    isSettingsOpen: Boolean(isSettingsPanelOpen),
    navigationId: Number.isInteger(navigationId) && navigationId >= 0 ? navigationId : 0
  };
}

function replaceCurrentNavigationState({
  sourceRowId = getCurrentSelectedPersonSourceRowId(),
  historyIndex = sourceRowId ? Math.max(personSelectionHistory.index, 0) : -1,
  isSettingsPanelOpen = isSettingsOpen,
  infoMode = infoPanelMode
} = {}) {
  const nextState = buildNavigationHistoryState({
    sourceRowId,
    historyIndex,
    isSettingsPanelOpen,
    infoMode,
    navigationId: navigationHistoryState.currentId
  });

  history.replaceState(nextState, document.title);
  navigationHistoryState.maxId = Math.max(
    navigationHistoryState.maxId,
    navigationHistoryState.currentId
  );
}

function pushCurrentNavigationState({
  sourceRowId = getCurrentSelectedPersonSourceRowId(),
  historyIndex = sourceRowId ? Math.max(personSelectionHistory.index, 0) : -1,
  isSettingsPanelOpen = isSettingsOpen,
  infoMode = infoPanelMode
} = {}) {
  const nextNavigationId = navigationHistoryState.currentId + 1;
  const nextState = buildNavigationHistoryState({
    sourceRowId,
    historyIndex,
    isSettingsPanelOpen,
    infoMode,
    navigationId: nextNavigationId
  });

  history.pushState(nextState, document.title);
  navigationHistoryState.currentId = nextNavigationId;
  navigationHistoryState.maxId = nextNavigationId;
}

function syncNavigationHistoryState(historyEntry) {
  if (historyEntry === 'push') {
    pushCurrentNavigationState();
    return;
  }

  if (historyEntry === 'replace') {
    replaceCurrentNavigationState();
  }
}

function recordPersonSelectionHistory(sourceRowId) {
  if (!sourceRowId) {
    return false;
  }

  const currentSourceRowId = personSelectionHistory.entries[personSelectionHistory.index];
  if (currentSourceRowId === sourceRowId) {
    return false;
  }

  const nextEntries = personSelectionHistory.entries.slice(0, personSelectionHistory.index + 1);
  nextEntries.push(sourceRowId);
  personSelectionHistory = {
    entries: nextEntries,
    index: nextEntries.length - 1
  };
  persistPersonSelectionHistory();
  return true;
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
  if (state?.kind !== MAP_NAVIGATION_HISTORY_STATE_KIND) {
    return;
  }

  const sourceRowId = state.sourceRowId ? String(state.sourceRowId) : null;
  const shouldClearHistory = !sourceRowId && Number(state.historyIndex) < 0;
  navigationHistoryState.currentId = Number.isInteger(state.navigationId) ? state.navigationId : 0;
  navigationHistoryState.maxId = Math.max(
    navigationHistoryState.maxId,
    navigationHistoryState.currentId
  );

  if (sourceRowId) {
    const historyIndex = clampHistoryIndex(
      state.historyIndex,
      personSelectionHistory.entries.length || 1
    );
    syncPersonSelectionHistoryIndex(historyIndex, sourceRowId);
  } else if (shouldClearHistory) {
    syncPersonSelectionHistoryIndex(-1, null);
  }

  applyNavigationPanelState({
    infoMode: state.infoPanelMode,
    isSettingsPanelOpen: state.isSettingsOpen
  });

  if (!sourceRowId) {
    clearActiveSelection({ resetPanel: true });
    return;
  }

  const person = allPeople.find((entry) => entry.sourceRowId === sourceRowId);
  if (!person) {
    const hiddenPerson = findPersonBySourceRowId(sourceRowId);
    if (!hiddenPerson) {
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

    focusSelectionOnMap(hiddenPerson);
    void selectPersonPoint(hiddenPerson, getPersonMarkerBySourceRowId(sourceRowId), {
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
    if (navigationHistoryState.currentId > 0) {
      history.back();
    }
    return;
  }

  if (event.button === 4) {
    event.preventDefault();
    event.stopPropagation();
    if (navigationHistoryState.currentId < navigationHistoryState.maxId) {
      history.forward();
    }
  }
}

function handleKeyboardHistoryNavigation(event) {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }

  if (event.key === 'ArrowLeft') {
    if (navigationHistoryState.currentId > 0) {
      event.preventDefault();
      history.back();
    }
    return true;
  }

  if (event.key === 'ArrowRight') {
    if (navigationHistoryState.currentId < navigationHistoryState.maxId) {
      event.preventDefault();
      history.forward();
    }
    return true;
  }

  return false;
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

function readStoredMapViewportState() {
  try {
    const raw = window.localStorage.getItem(MAP_VIEWPORT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return normalizeMapViewportState(JSON.parse(raw));
  } catch (_error) {
    return null;
  }
}

function normalizeMapViewportState(input) {
  const lat = Number(input?.center?.lat);
  const lng = Number(input?.center?.lng);
  const zoom = Number(input?.zoom);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(zoom) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return {
    center: { lat, lng },
    zoom
  };
}

function persistMapViewportState() {
  if (!mapInstance) {
    return;
  }

  const center = mapInstance.getCenter?.();
  const zoom = mapInstance.getZoom?.();
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng) || !Number.isFinite(zoom)) {
    return;
  }

  try {
    window.localStorage.setItem(
      MAP_VIEWPORT_STORAGE_KEY,
      JSON.stringify({
        center: {
          lat: center.lat,
          lng: center.lng
        },
        zoom
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

function saveLastSelectedPersonDetails(details) {
  if (!details?.person?.sourceRowId) {
    return;
  }

  try {
    window.localStorage.setItem(
      LAST_SELECTED_PERSON_DETAILS_STORAGE_KEY,
      JSON.stringify(details)
    );
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

function focusPersonPreviewOnMap(person) {
  if (!mapInstance || !Number.isFinite(person?.lat) || !Number.isFinite(person?.lng)) {
    return;
  }

  animateHoveredPersonMapView({
    center: [person.lat, person.lng],
    zoom: mapInstance.getZoom(),
    durationMs: HOVERED_PERSON_PREVIEW_PAN_DURATION_MS
  });
}

function rememberMapViewBeforeHoveredPersonPreview() {
  if (hoveredPersonMapRestoreState || !mapInstance) {
    return;
  }

  const center = mapInstance.getCenter?.();
  const zoom = mapInstance.getZoom?.();
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng) || !Number.isFinite(zoom)) {
    return;
  }

  hoveredPersonMapRestoreState = {
    center: [center.lat, center.lng],
    zoom
  };
}

function restoreMapViewAfterHoveredPersonPreview() {
  if (!hoveredPersonMapRestoreState || !mapInstance) {
    return;
  }

  const { center, zoom } = hoveredPersonMapRestoreState;
  hoveredPersonMapRestoreState = null;
  hoveredPersonPreviewedSourceRowId = null;
  animateHoveredPersonMapView({
    center,
    zoom,
    durationMs: HOVERED_PERSON_RESTORE_PAN_DURATION_MS
  });
}

function discardHoveredPersonMapRestoreState() {
  hoveredPersonMapRestoreState = null;
  hoveredPersonPreviewedSourceRowId = null;
  stopHoveredPersonMapAnimation();
}

function animateHoveredPersonMapView({ center, zoom, durationMs }) {
  if (
    !mapInstance ||
    !Array.isArray(center) ||
    center.length < 2 ||
    !Number.isFinite(center[0]) ||
    !Number.isFinite(center[1]) ||
    !Number.isFinite(zoom)
  ) {
    return;
  }

  stopHoveredPersonMapAnimation();

  const currentCenter = mapInstance.getCenter?.();
  const currentZoom = mapInstance.getZoom?.();
  if (
    !currentCenter ||
    !Number.isFinite(currentCenter.lat) ||
    !Number.isFinite(currentCenter.lng) ||
    !Number.isFinite(currentZoom)
  ) {
    mapInstance.setView(center, zoom, { animate: false });
    return;
  }

  const startState = {
    lat: currentCenter.lat,
    lng: currentCenter.lng,
    zoom: currentZoom
  };
  const targetState = {
    lat: center[0],
    lng: center[1],
    zoom
  };

  if (
    Math.abs(startState.lat - targetState.lat) < 0.000001 &&
    Math.abs(startState.lng - targetState.lng) < 0.000001 &&
    Math.abs(startState.zoom - targetState.zoom) < 0.000001
  ) {
    mapInstance.setView(center, zoom, { animate: false });
    return;
  }

  const startedAt = performance.now();
  const totalDurationMs = Math.max(1, durationMs || 1);

  const step = (now) => {
    const rawProgress = Math.min(1, (now - startedAt) / totalDurationMs);
    const easedProgress = easeInOutQuint(rawProgress);
    const nextLat = interpolateNumber(startState.lat, targetState.lat, easedProgress);
    const nextLng = interpolateNumber(startState.lng, targetState.lng, easedProgress);
    const nextZoom = interpolateNumber(startState.zoom, targetState.zoom, easedProgress);

    mapInstance.setView([nextLat, nextLng], nextZoom, {
      animate: false
    });

    if (rawProgress >= 1) {
      hoveredPersonMapAnimationFrame = 0;
      return;
    }

    hoveredPersonMapAnimationFrame = window.requestAnimationFrame(step);
  };

  hoveredPersonMapAnimationFrame = window.requestAnimationFrame(step);
}

function stopHoveredPersonMapAnimation() {
  if (!hoveredPersonMapAnimationFrame) {
    return;
  }

  window.cancelAnimationFrame(hoveredPersonMapAnimationFrame);
  hoveredPersonMapAnimationFrame = 0;
}

function interpolateNumber(start, end, progress) {
  return start + (end - start) * progress;
}

function easeInOutQuint(progress) {
  if (progress <= 0) {
    return 0;
  }

  if (progress >= 1) {
    return 1;
  }

  return progress < 0.5
    ? 16 * Math.pow(progress, 5)
    : 1 - Math.pow(-2 * progress + 2, 5) / 2;
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
  clearHoveredPersonSourceRowId({ restoreMap: false });
  const key = buildPersonKey(person);
  selectionRequestToken += 1;
  const requestToken = selectionRequestToken;
  cacheKnownPeople([person]);
  const panelStateChanged = applySelectionPanelState(options.panelMode);

  saveLastSelectedPersonId(person.sourceRowId);
  if (options.historyMode !== 'restore') {
    const personHistoryChanged = recordPersonSelectionHistory(person.sourceRowId);
    if (personHistoryChanged || panelStateChanged) {
      pushCurrentNavigationState({
        sourceRowId: person.sourceRowId,
        historyIndex: personSelectionHistory.index
      });
    } else {
      replaceCurrentNavigationState({
        sourceRowId: person.sourceRowId,
        historyIndex: personSelectionHistory.index
      });
    }
  }
  setActiveSelection({
    key,
    type: 'person',
    marker
  });
  const ensuredMarker = ensurePersonMarkerVisible(person);
  if (activeSelection?.key === key) {
    activeSelection.marker = ensuredMarker;
    applyMarkerSelection(ensuredMarker, 'person');
  }
  renderPersonSelectionState(person);

  const details = await window.appApi.getPersonDetails(person.sourceRowId);
  if (!details || requestToken !== selectionRequestToken || activeSelection?.key !== key) {
    return;
  }

  cacheKnownPeople([details.person]);
  saveLastSelectedPersonDetails(details);
  renderPersonSelection(details);
}

function selectCustomPoint(point, marker, options = {}) {
  clearHoveredPersonSourceRowId({ restoreMap: false });
  selectionRequestToken += 1;
  applySelectionPanelState(options.panelMode);
  setActiveSelection({
    key: buildCustomPointKey(point),
    type: 'custom',
    marker
  });
  renderCustomPointSelection(point);
}

function setActiveSelection(nextSelection) {
  const previousSelection = activeSelection;
  activeSelection = nextSelection;
  if (previousSelection?.marker) {
    resetMarkerSelection(previousSelection.marker, previousSelection.type);
  }
  applyMarkerSelection(nextSelection.marker, nextSelection.type);
  syncSupplementalPeopleMarkers();
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
  const previousSelection = activeSelection;
  activeSelection = null;
  if (previousSelection?.marker) {
    resetMarkerSelection(previousSelection.marker, previousSelection.type);
  }
  syncSupplementalPeopleMarkers();

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

  if (type === 'person') {
    syncPersonMarkerAppearance(marker, marker.__personSourceRowId);
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

  if (type === 'person') {
    syncPersonMarkerAppearance(marker, marker.__personSourceRowId);
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
  clearHoveredPersonSourceRowId();
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
  clearHoveredPersonSourceRowId();
  syncOverviewSpacing(false);
  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = person.fullName || person.companyName || 'Wybrana osoba';
  selectionCopyEl.textContent = '';
  selectionCopyEl.hidden = true;
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
  clearHoveredPersonSourceRowId();
  syncOverviewSpacing(false);
  const person = details.person;
  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = person.fullName || person.companyName || 'Wybrana osoba';
  selectionCopyEl.textContent = '';
  selectionCopyEl.hidden = true;
  selectionMetaEl.innerHTML = renderKeyValueList([
    { label: 'Telefon', value: person.phone || 'Brak' },
    { label: 'E-mail', value: person.email || 'Brak' },
    { label: 'Adres', value: person.addressText || person.routeAddress || 'Brak' },
    { label: 'Ostatnia wizyta', value: formatDate(person.lastVisitAt) },
    { label: 'Ostatnia wplata', value: formatDate(person.lastPaymentAt) },
    ...buildPersonPrimaryDetailItems(person)
  ]);
  selectionMetaEl.hidden = false;

  const cards = [];

  const secondaryItems = buildPersonSecondaryDetailItems(person);
  if (secondaryItems.length > 0) {
    cards.push(`<div class="kv-grid detail-secondary-grid">${renderKeyValueList(secondaryItems)}</div>`);
  }

  if (person.notesSummary) {
    cards.push(`
      <article class="list-card detail-note-card">
        <div class="list-card-heading">
          <strong>Uwagi</strong>
        </div>
        <p class="detail-note-text">${escapeHtml(person.notesSummary)}</p>
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

  if (details.person.raw && Object.keys(details.person.raw).length > 0) {
    cards.push(`
      <article class="list-card">
        <div class="list-card-heading">
          <strong>Pelne dane z bazy</strong>
          <button
            type="button"
            class="button-muted section-toggle-button"
            data-map-toggle-raw-fields
            aria-expanded="${areMapRawFieldsExpanded ? 'true' : 'false'}"
          >
            ${areMapRawFieldsExpanded ? 'Ukryj' : 'Pokaz'}
          </button>
        </div>
        <div class="kv-grid kv-grid-compact"${areMapRawFieldsExpanded ? '' : ' hidden'}>
          ${renderRecordFields(details.person.raw)}
        </div>
      </article>
    `);
  }

  selectionExtraEl.innerHTML = cards.length
    ? cards.join('')
    : '<p class="empty-state">Brak dodatkowych informacji dla tej osoby.</p>';
  selectionExtraEl.hidden = false;
}

function buildPersonPrimaryDetailItems(person) {
  const raw = person.raw || {};
  const producer = person.deviceVendor || pickRecordValue(raw, ['Producent']);
  const installerCompany = pickRecordValue(raw, [
    'Firma montująca',
    'Firma montujaca',
    'Firma montazowa'
  ]);
  const geyserNumber = pickRecordValue(raw, ['Nr gejzer', 'Nr gejzera', 'Numer gejzer']);
  const items = [
    { label: 'Producent', value: producer || 'Brak' }
  ];

  if (
    installerCompany &&
    normalizeComparableText(installerCompany) !== normalizeComparableText(producer)
  ) {
    items.push({ label: 'Firma montujaca', value: installerCompany });
  }

  items.push(
    { label: 'Nr gejzer', value: geyserNumber || 'Brak' },
    { label: 'Data montazu', value: formatPersonInstallDate(person, raw) }
  );

  return items;
}

function buildPersonSecondaryDetailItems(person) {
  const raw = person.raw || {};
  const inspection = pickRecordValue(raw, ['Prze tn', 'Przegląd', 'Przeglad']);
  const softwareVersion = pickRecordValue(raw, ['Soft wersja', 'Wersja softwaru', 'Wersja software']);

  return [
    { label: 'Przeglad', value: inspection || 'Brak' },
    { label: 'Wersja softwaru', value: softwareVersion || 'Brak' }
  ];
}

function formatPersonInstallDate(person, raw) {
  if (person.installedAt) {
    return formatDate(person.installedAt);
  }

  return pickRecordValue(raw, ['Data montażu', 'Data montazu', 'Data montaźu']) || 'Brak';
}

function normalizeComparableText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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
  clearHoveredPersonSourceRowId();
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

function openInfoPanelMode(mode) {
  const nextMode = normalizeInfoPanelMode(mode);
  if (!isSettingsOpen && infoPanelMode === nextMode) {
    return false;
  }

  if (isSettingsOpen) {
    toggleSettingsPanel(false, { historyEntry: 'skip' });
  }

  setInfoPanelMode(nextMode, { historyEntry: 'skip' });
  pushCurrentNavigationState();
  return true;
}

function applyNavigationPanelState({
  infoMode = infoPanelMode,
  isSettingsPanelOpen = isSettingsOpen
} = {}) {
  const nextMode = normalizeInfoPanelMode(infoMode);
  let didChange = false;

  if (infoPanelMode !== nextMode) {
    setInfoPanelMode(nextMode, { historyEntry: 'skip' });
    didChange = true;
  }

  if (isSettingsOpen !== Boolean(isSettingsPanelOpen)) {
    toggleSettingsPanel(Boolean(isSettingsPanelOpen), { historyEntry: 'skip' });
    didChange = true;
  }

  return didChange;
}

function applySelectionPanelState(panelMode) {
  const nextMode = panelMode ? normalizeInfoPanelMode(panelMode) : null;
  let didChange = false;

  if (isSettingsOpen) {
    toggleSettingsPanel(false, { historyEntry: 'skip' });
    didChange = true;
  }

  if (nextMode && infoPanelMode !== nextMode) {
    setInfoPanelMode(nextMode, { historyEntry: 'skip' });
    didChange = true;
  }

  return didChange;
}

function setInfoPanelMode(mode, options = {}) {
  const nextMode = normalizeInfoPanelMode(mode);
  if (infoPanelMode === nextMode) {
    if (options.historyEntry === 'replace') {
      replaceCurrentNavigationState();
    }
    return false;
  }

  clearHoveredPersonSourceRowId();
  infoPanelMode = nextMode;
  syncInfoToolButtons();
  persistMapPanelState();
  renderCurrentInfoPanel();
  syncNavigationHistoryState(options.historyEntry);
  return true;
}

function renderCurrentInfoPanel() {
  if (infoPanelMode === 'history') {
    paintHistorySelection();
    return;
  }

  if (infoPanelMode === 'filter') {
    paintFilterPanel();
    return;
  }

  if (infoPanelMode === 'search') {
    paintSearchPanel({ shouldFocusInput: personSearchState.hasLoaded });
    if (!personSearchState.hasLoaded) {
      personSearchRequestToken += 1;
      void loadPersonSearchResults(personSearchState.query, {
        showLoadingState: true,
        reset: true,
        requestToken: personSearchRequestToken
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
  const isSelectionMode = shouldHighlightInfoMode && infoPanelMode === 'selection';
  const isSearchMode = shouldHighlightInfoMode && infoPanelMode === 'search';
  const isHistoryMode = shouldHighlightInfoMode && infoPanelMode === 'history';
  const isFilterMode =
    shouldHighlightInfoMode && (infoPanelMode === 'filter' || hasActiveMapDateFilter());

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

function paintSearchPanel(options = {}) {
  clearHoveredPersonSourceRowId();
  syncOverviewSpacing(false, false, true);
  overviewDefaultEls.forEach((element) => {
    element.hidden = true;
  });

  const query = personSearchState.query.trim();
  const searchCountLabel = personSearchState.isLoading && !personSearchState.hasLoaded
    ? 'Ladowanie...'
    : personSearchState.total === 1
      ? '1 osoba'
      : `${formatNumber(personSearchState.total)} osob`;
  const shouldFocusInput = options.shouldFocusInput === true;
  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = 'Wyszukiwanie osob';
  selectionCopyEl.hidden = true;
  selectionMetaEl.innerHTML = '';
  selectionMetaEl.hidden = true;
  selectionExtraEl.innerHTML = `
    <form class="time-filter-panel" data-map-person-search-form>
      <label class="field">
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
      <div class="action-row filter-action-row">
        <span class="filter-action-count">${escapeHtml(searchCountLabel)}</span>
        <button type="submit" class="button-strong">Szukaj</button>
        <button type="button" class="button-muted" data-map-person-search-clear${query ? '' : ' disabled'}>
          Wyczysc
        </button>
      </div>
    </form>
    <div class="vertical-list map-tool-results-list" data-map-person-search-results>
      ${renderPersonSearchResults()}
    </div>
  `;
  bindHoverTrackingToRenderedPersonLists();
  bindLazyLoadingToRenderedPersonSearchResults();
  selectionExtraEl.hidden = false;

  const resultsList = selectionExtraEl?.querySelector('[data-map-person-search-results]');
  if (resultsList && personSearchState.hasLoaded && personSearchState.results.length > 0) {
    syncMapSearchResultsTail(resultsList);
    updateMapSearchRowHeight(resultsList);
  }

  if (shouldFocusInput && !isSettingsOpen) {
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

  return renderPersonSearchRows(personSearchState.results, getCurrentSelectedPersonSourceRowId());
}

function renderPersonSearchRows(people, currentSelectedPersonId = null) {
  return people
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
          data-map-hover-source-row-id="${escapeHtml(person.sourceRowId)}"
        >
          <div class="list-card-heading">
            <strong>${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</strong>
          </div>
          <span>Ostatnia wizyta: ${escapeHtml(formatDate(person.lastVisitAt))}</span>
          <span>${escapeHtml(locationLabel)}</span>
        </button>
      `;
    })
    .join('');
}

function paintFilterPanel() {
  clearHoveredPersonSourceRowId();
  syncOverviewSpacing(false, true);
  overviewDefaultEls.forEach((element) => {
    element.hidden = true;
  });

  syncMapDateFilterRenderedCount();

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
    </form>
    <div class="vertical-list map-tool-results-list" data-map-date-filter-results>
      ${renderMapDateFilterResults()}
    </div>
  `;
  bindHoverTrackingToRenderedPersonLists();
  bindLazyLoadingToRenderedMapDateFilterResults();
  selectionExtraEl.hidden = false;

  const resultsList = selectionExtraEl?.querySelector('[data-map-date-filter-results]');
  if (resultsList && allPeople.length > 0) {
    syncMapDateFilterResultsTail(resultsList);
    updateMapDateFilterRowHeight(resultsList);
  }
}

function renderMapDateFilterResults() {
  if (allPeople.length === 0) {
    return hasActiveMapDateFilter()
      ? '<p class="empty-state">Brak osob pasujacych do wybranego zakresu dat.</p>'
      : '<p class="empty-state">Brak osob dostepnych na mapie dla biezacych danych.</p>';
  }

  return renderMapDateFilterRows(allPeople.slice(0, mapDateFilterRenderedCount), getCurrentSelectedPersonSourceRowId());
}

function renderMapDateFilterRows(people, currentSelectedPersonId = null) {
  if (!Array.isArray(people) || people.length === 0) {
    return '';
  }

  return people
    .map((person) => {
      const isCurrent = person.sourceRowId === currentSelectedPersonId;
      return `
        <button
          type="button"
          class="person-row map-history-row${isCurrent ? ' is-current' : ''}"
          data-map-filter-source-row-id="${escapeHtml(person.sourceRowId)}"
          data-map-hover-source-row-id="${escapeHtml(person.sourceRowId)}"
        >
          <div class="list-card-heading">
            <strong>${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</strong>
          </div>
          <span>Ostatnia wizyta: ${escapeHtml(formatDate(person.lastVisitAt))}</span>
        </button>
      `;
    })
    .join('');
}

function syncMapDateFilterRenderedCount() {
  if (allPeople.length === 0) {
    mapDateFilterRenderedCount = 0;
    return;
  }

  const nextCount = Math.max(mapDateFilterRenderedCount, MAP_DATE_FILTER_BATCH_SIZE);
  mapDateFilterRenderedCount = Math.min(allPeople.length, nextCount);
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
    personSearchRequestToken += 1;
    void loadPersonSearchResults(personSearchState.query, {
      showLoadingState: true,
      reset: true,
      requestToken: personSearchRequestToken
    });
    return;
  }

  personSearchTimer = window.setTimeout(() => {
    personSearchTimer = null;
    personSearchRequestToken += 1;
    void loadPersonSearchResults(personSearchState.query, {
      showLoadingState: true,
      reset: true,
      requestToken: personSearchRequestToken
    });
  }, MAP_PERSON_SEARCH_DEBOUNCE_MS);
}

async function loadPersonSearchResults(query, options = {}) {
  const requestToken = Number.isFinite(options.requestToken)
    ? options.requestToken
    : personSearchRequestToken;
  const normalizedQuery = String(query || '');
  const showLoadingState = options.showLoadingState !== false;
  const reset = options.reset !== false;
  personSearchState = reset
    ? {
        query: normalizedQuery,
        results: [],
        total: 0,
        isLoading: showLoadingState,
        hasLoaded: false,
        hasMore: false
      }
    : {
        ...personSearchState,
        query: normalizedQuery,
        isLoading: true
      };

  if (infoPanelMode === 'search' && reset) {
    paintSearchPanel({ shouldFocusInput: false });
  }

  const response = await window.appApi.listPeople({
    query: normalizedQuery,
    limit: MAP_PERSON_SEARCH_BATCH_SIZE,
    offset: reset ? 0 : personSearchState.results.length
  });

  if (requestToken !== personSearchRequestToken) {
    return;
  }

  const items = Array.isArray(response?.items) ? response.items : [];
  personSearchState = {
    query: normalizedQuery,
    results: reset ? items : [...personSearchState.results, ...items],
    total: Number(response?.total || 0),
    isLoading: false,
    hasLoaded: true,
    hasMore: Boolean(response?.hasMore)
  };
  cacheKnownPeople(items);

  if (infoPanelMode === 'search') {
    if (reset) {
      paintSearchPanel({ shouldFocusInput: false });
    } else {
      appendPersonSearchResults(items);
    }
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
  clearHoveredPersonSourceRowId();
  syncOverviewSpacing(true);
  const historyEntries = personSelectionHistory.entries
    .map((sourceRowId, index) => {
      const person = findPersonBySourceRowId(sourceRowId);
      return {
        index,
        sourceRowId,
        person
      };
    })
    .reverse();
  const missingSourceRowIds = historyEntries
    .filter((entry) => !entry.person)
    .map((entry) => entry.sourceRowId)
    .filter(Boolean);

  if (missingSourceRowIds.length > 0) {
    void loadMissingHistoryPeople(missingSourceRowIds);
  }

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
            class="person-row map-history-row${isCurrent ? ' is-current' : ''}${person ? '' : ' is-loading'}"
            data-history-source-row-id="${escapeHtml(sourceRowId)}"
            ${person ? `data-map-hover-source-row-id="${escapeHtml(sourceRowId)}"` : ''}
            ${person ? '' : 'disabled'}
          >
            <div class="list-card-heading">
              <strong>${escapeHtml(person?.fullName || person?.companyName || 'Ladowanie osoby...')}</strong>
            </div>
            <span>Ostatnia wizyta: ${escapeHtml(formatDate(person?.lastVisitAt))}</span>
          </button>
        `;
      })
      .join('')}
  `;
  bindHoverTrackingToRenderedPersonLists();
  selectionExtraEl.hidden = false;
}

function syncOverviewSpacing(isHistoryMode, isFilterMode = false, isSearchMode = false) {
  overviewViewEl?.classList.toggle('map-info-view-history', Boolean(isHistoryMode));
  overviewViewEl?.classList.toggle('map-info-view-filter', Boolean(isFilterMode));
  overviewViewEl?.classList.toggle('map-info-view-search', Boolean(isSearchMode));
  selectionExtraEl?.classList.toggle('map-selection-cards-history', Boolean(isHistoryMode));
  selectionExtraEl?.classList.toggle('map-selection-cards-filter', Boolean(isFilterMode));
  selectionExtraEl?.classList.toggle('map-selection-cards-search', Boolean(isSearchMode));
}

function bindHoverTrackingToRenderedPersonLists() {
  selectionExtraEl?.querySelectorAll('.map-tool-results-list').forEach((listElement) => {
    if (listElement.dataset.hoverTrackingBound === 'true') {
      return;
    }

    listElement.dataset.hoverTrackingBound = 'true';
    listElement.addEventListener('pointermove', (event) => {
      selectionExtraPointerState = {
        clientX: event.clientX,
        clientY: event.clientY,
        isInside: true
      };
      scheduleHoveredPersonPointerSync();
    });
    listElement.addEventListener(
      'wheel',
      (event) => {
        selectionExtraPointerState = {
          clientX: event.clientX,
          clientY: event.clientY,
          isInside: true
        };
        scheduleHoveredPersonPointerSync({ afterLayout: true });
      },
      { passive: true }
    );
    listElement.addEventListener('scroll', () => {
      scheduleHoveredPersonPointerSync({ afterLayout: true });
    });
  });

  syncHoveredPersonListRows();
}

function bindLazyLoadingToRenderedPersonSearchResults() {
  const listElement = selectionExtraEl?.querySelector('[data-map-person-search-results]');
  if (!listElement || listElement.dataset.lazyLoadingBound === 'true') {
    return;
  }

  listElement.dataset.lazyLoadingBound = 'true';
  listElement.addEventListener('scroll', () => {
    void maybeLoadMorePersonSearchResults(listElement);
  });
}

function bindLazyLoadingToRenderedMapDateFilterResults() {
  const listElement = selectionExtraEl?.querySelector('[data-map-date-filter-results]');
  if (!listElement || listElement.dataset.lazyLoadingBound === 'true') {
    return;
  }

  listElement.dataset.lazyLoadingBound = 'true';
  listElement.addEventListener('scroll', () => {
    maybeLoadMoreMapDateFilterResults(listElement);
  });
}

function maybeLoadMoreMapDateFilterResults(listElement) {
  if (infoPanelMode !== 'filter' || mapDateFilterRenderedCount >= allPeople.length) {
    return;
  }

  const loadedContentHeight = mapDateFilterRenderedCount * getMapDateFilterRowStride();
  const viewportBottom = listElement.scrollTop + listElement.clientHeight;
  if (viewportBottom + MAP_DATE_FILTER_SCROLL_THRESHOLD_PX < loadedContentHeight) {
    return;
  }

  appendMapDateFilterResults(listElement);
}

function appendMapDateFilterResults(listElement) {
  const nextRenderedCount = Math.min(allPeople.length, mapDateFilterRenderedCount + MAP_DATE_FILTER_BATCH_SIZE);
  const items = allPeople.slice(mapDateFilterRenderedCount, nextRenderedCount);
  if (items.length === 0) {
    return;
  }

  removeMapDateFilterResultsTail(listElement);
  listElement.insertAdjacentHTML(
    'beforeend',
    renderMapDateFilterRows(items, getCurrentSelectedPersonSourceRowId())
  );
  mapDateFilterRenderedCount = nextRenderedCount;
  syncMapDateFilterResultsTail(listElement);
  updateMapDateFilterRowHeight(listElement);
  syncHoveredPersonListRows();
}

async function maybeLoadMorePersonSearchResults(listElement) {
  if (infoPanelMode !== 'search' || personSearchState.isLoading || !personSearchState.hasMore) {
    return;
  }

  const loadedContentHeight = personSearchState.results.length * getMapSearchRowStride();
  const viewportBottom = listElement.scrollTop + listElement.clientHeight;
  if (viewportBottom + MAP_PERSON_SEARCH_SCROLL_THRESHOLD_PX < loadedContentHeight) {
    return;
  }

  showMapSearchLoadingState(listElement);
  await loadPersonSearchResults(personSearchState.query, {
    showLoadingState: false,
    reset: false,
    requestToken: personSearchRequestToken
  });
}

function appendPersonSearchResults(items) {
  const listElement = selectionExtraEl?.querySelector('[data-map-person-search-results]');
  if (!listElement) {
    paintSearchPanel({ shouldFocusInput: false });
    return;
  }

  removeMapSearchResultsTail(listElement);
  if (items.length > 0) {
    listElement.insertAdjacentHTML(
      'beforeend',
      renderPersonSearchRows(items, getCurrentSelectedPersonSourceRowId())
    );
  }
  syncMapSearchResultsTail(listElement);
  updateMapSearchRowHeight(listElement);
  updateMapSearchCountLabel();
  syncHoveredPersonListRows();
}

function updateMapSearchCountLabel() {
  const counterEl = selectionExtraEl?.querySelector('.filter-action-count');
  if (!counterEl) {
    return;
  }

  counterEl.textContent = personSearchState.total === 1
    ? '1 osoba'
    : `${formatNumber(personSearchState.total)} osob`;
}

function showMapSearchLoadingState(listElement) {
  if (listElement.querySelector('[data-map-search-loading-more]')) {
    return;
  }

  const loading = document.createElement('p');
  loading.className = 'empty-state';
  loading.dataset.mapSearchLoadingMore = 'true';
  loading.textContent = 'Ladowanie kolejnych wynikow...';
  listElement.appendChild(loading);
}

function removeMapSearchResultsTail(listElement) {
  removeMapSearchLoadingState(listElement);
  listElement.querySelector('[data-map-search-results-spacer]')?.remove();
}

function removeMapSearchLoadingState(listElement) {
  listElement.querySelector('[data-map-search-loading-more]')?.remove();
}

function syncMapSearchResultsTail(listElement) {
  removeMapSearchResultsTail(listElement);
  if (personSearchState.isLoading && personSearchState.hasLoaded) {
    showMapSearchLoadingState(listElement);
  }
  appendMapSearchResultsSpacer(listElement);
}

function appendMapSearchResultsSpacer(listElement) {
  const remainingCount = Math.max(0, personSearchState.total - personSearchState.results.length);
  if (remainingCount <= 0) {
    return;
  }

  const spacer = document.createElement('div');
  spacer.className = 'results-spacer';
  spacer.dataset.mapSearchResultsSpacer = 'true';
  spacer.style.height = `${Math.round(remainingCount * getMapSearchRowStride())}px`;
  spacer.setAttribute('aria-hidden', 'true');
  listElement.appendChild(spacer);
}

function updateMapSearchRowHeight(listElement) {
  const rows = Array.from(listElement.querySelectorAll('.person-row'));
  if (rows.length === 0) {
    return;
  }

  const nextHeight = Math.round(rows.reduce((sum, row) => sum + row.offsetHeight, 0) / rows.length);
  if (Number.isFinite(nextHeight) && nextHeight > 0 && nextHeight !== mapSearchRowHeight) {
    mapSearchRowHeight = nextHeight;
    const spacer = listElement.querySelector('[data-map-search-results-spacer]');
    if (spacer) {
      const remainingCount = Math.max(0, personSearchState.total - personSearchState.results.length);
      spacer.style.height = `${Math.round(remainingCount * getMapSearchRowStride())}px`;
    }
  }
}

function getMapSearchRowStride() {
  return mapSearchRowHeight + MAP_PERSON_SEARCH_ROW_GAP_PX;
}

function removeMapDateFilterResultsTail(listElement) {
  listElement.querySelector('[data-map-date-filter-results-spacer]')?.remove();
}

function syncMapDateFilterResultsTail(listElement) {
  removeMapDateFilterResultsTail(listElement);
  appendMapDateFilterResultsSpacer(listElement);
}

function appendMapDateFilterResultsSpacer(listElement) {
  const remainingCount = Math.max(0, allPeople.length - mapDateFilterRenderedCount);
  if (remainingCount <= 0) {
    return;
  }

  const spacer = document.createElement('div');
  spacer.className = 'results-spacer';
  spacer.dataset.mapDateFilterResultsSpacer = 'true';
  spacer.style.height = `${Math.round(remainingCount * getMapDateFilterRowStride())}px`;
  spacer.setAttribute('aria-hidden', 'true');
  listElement.appendChild(spacer);
}

function updateMapDateFilterRowHeight(listElement) {
  const rows = Array.from(listElement.querySelectorAll('.person-row'));
  if (rows.length === 0) {
    return;
  }

  const nextHeight = Math.round(rows.reduce((sum, row) => sum + row.offsetHeight, 0) / rows.length);
  if (Number.isFinite(nextHeight) && nextHeight > 0 && nextHeight !== mapDateFilterRowHeight) {
    mapDateFilterRowHeight = nextHeight;
    const spacer = listElement.querySelector('[data-map-date-filter-results-spacer]');
    if (spacer) {
      const remainingCount = Math.max(0, allPeople.length - mapDateFilterRenderedCount);
      spacer.style.height = `${Math.round(remainingCount * getMapDateFilterRowStride())}px`;
    }
  }
}

function getMapDateFilterRowStride() {
  return mapDateFilterRowHeight + MAP_DATE_FILTER_ROW_GAP_PX;
}

function cacheKnownPeople(people) {
  if (!Array.isArray(people)) {
    return;
  }

  people.forEach((person) => {
    if (!person?.sourceRowId) {
      return;
    }

    knownPeopleBySourceRowId.set(person.sourceRowId, person);
  });
}

function isPersonIncludedInCurrentMapData(sourceRowId) {
  if (!sourceRowId) {
    return false;
  }

  return allPeople.some((entry) => entry.sourceRowId === sourceRowId);
}

function scheduleHoveredPersonPointerSync(options = {}) {
  if (options.afterLayout) {
    if (hoveredPersonPointerSyncTimeout) {
      window.clearTimeout(hoveredPersonPointerSyncTimeout);
    }
    hoveredPersonPointerSyncTimeout = window.setTimeout(() => {
      hoveredPersonPointerSyncTimeout = 0;
      runHoveredPersonPointerSync();
    }, 0);
    return;
  }

  runHoveredPersonPointerSync();
}

function runHoveredPersonPointerSync() {
  if (hoveredPersonPointerSyncTimeout) {
    window.clearTimeout(hoveredPersonPointerSyncTimeout);
    hoveredPersonPointerSyncTimeout = 0;
  }

  if (hoveredPersonPointerSyncFrame) {
    return;
  }

  hoveredPersonPointerSyncFrame = window.requestAnimationFrame(() => {
    hoveredPersonPointerSyncFrame = 0;
    syncHoveredPersonFromPointer();
  });
}

function syncHoveredPersonFromPointer() {
  if (!selectionExtraEl || !selectionExtraPointerState.isInside) {
    return;
  }

  const { clientX, clientY } = selectionExtraPointerState;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return;
  }

  const hoveredElement = document.elementFromPoint(clientX, clientY);
  if (!hoveredElement || !selectionExtraEl.contains(hoveredElement)) {
    scheduleHoveredPersonSourceRowIdClear();
    return;
  }

  const personRow = hoveredElement.closest('[data-map-hover-source-row-id]');
  if (!personRow || !selectionExtraEl.contains(personRow)) {
    scheduleHoveredPersonSourceRowIdClear();
    return;
  }

  setHoveredPersonSourceRowId(personRow.getAttribute('data-map-hover-source-row-id'));
}

function setHoveredPersonSourceRowId(sourceRowId) {
  const normalizedSourceRowId = typeof sourceRowId === 'string' ? sourceRowId : '';
  cancelHoveredPersonRestore();

  if (hoveredPersonSourceRowId === normalizedSourceRowId) {
    if (normalizedSourceRowId && hoveredPersonPreviewedSourceRowId !== normalizedSourceRowId) {
      scheduleHoveredPersonPreview(normalizedSourceRowId);
    }
    return;
  }

  const previousSourceRowId = hoveredPersonSourceRowId;
  hoveredPersonSourceRowId = normalizedSourceRowId;
  syncHoveredPersonListRows();
  syncSupplementalPeopleMarkers();
  syncPersonMarkerAppearanceBySourceRowId(previousSourceRowId);

  if (!hoveredPersonSourceRowId) {
    cancelHoveredPersonPreview();
    return;
  }

  const person = findPersonBySourceRowId(hoveredPersonSourceRowId);
  if (!person) {
    clearHoveredPersonSourceRowId();
    return;
  }

  const marker = getPersonMarkerBySourceRowId(hoveredPersonSourceRowId);
  syncPersonMarkerAppearance(marker, hoveredPersonSourceRowId);
  scheduleHoveredPersonPreview(hoveredPersonSourceRowId);
}

function clearHoveredPersonSourceRowId(options = {}) {
  const shouldRestoreMap = options.restoreMap !== false;
  cancelHoveredPersonPreview();
  cancelHoveredPersonRestore();
  if (!hoveredPersonSourceRowId) {
    if (shouldRestoreMap) {
      restoreMapViewAfterHoveredPersonPreview();
    } else {
      discardHoveredPersonMapRestoreState();
    }
    return;
  }

  const previousSourceRowId = hoveredPersonSourceRowId;
  hoveredPersonSourceRowId = null;
  hoveredPersonPreviewedSourceRowId = null;
  syncHoveredPersonListRows();
  syncSupplementalPeopleMarkers();
  syncPersonMarkerAppearanceBySourceRowId(previousSourceRowId);

  if (shouldRestoreMap) {
    restoreMapViewAfterHoveredPersonPreview();
  } else {
    discardHoveredPersonMapRestoreState();
  }
}

function scheduleHoveredPersonPreview(sourceRowId) {
  cancelHoveredPersonPreview();
  if (!sourceRowId || hoveredPersonPreviewedSourceRowId === sourceRowId) {
    return;
  }

  hoveredPersonPreviewTimer = window.setTimeout(() => {
    hoveredPersonPreviewTimer = 0;
    runHoveredPersonPreview(sourceRowId);
  }, HOVERED_PERSON_PREVIEW_DELAY_MS);
}

function runHoveredPersonPreview(sourceRowId) {
  if (!sourceRowId || hoveredPersonSourceRowId !== sourceRowId) {
    return;
  }

  const person = findPersonBySourceRowId(sourceRowId);
  if (!person) {
    clearHoveredPersonSourceRowId();
    return;
  }

  rememberMapViewBeforeHoveredPersonPreview();
  focusPersonPreviewOnMap(person);
  const marker = ensurePersonMarkerVisible(person, {
    allowMapPan: false
  });
  syncPersonMarkerAppearance(marker, sourceRowId);
  hoveredPersonPreviewedSourceRowId = sourceRowId;
}

function scheduleHoveredPersonSourceRowIdClear(options = {}) {
  cancelHoveredPersonPreview();
  cancelHoveredPersonRestore();
  hoveredPersonRestoreTimer = window.setTimeout(() => {
    hoveredPersonRestoreTimer = 0;
    clearHoveredPersonSourceRowId(options);
  }, HOVERED_PERSON_RESTORE_DELAY_MS);
}

function cancelHoveredPersonPreview() {
  if (!hoveredPersonPreviewTimer) {
    return;
  }

  window.clearTimeout(hoveredPersonPreviewTimer);
  hoveredPersonPreviewTimer = 0;
}

function cancelHoveredPersonRestore() {
  if (!hoveredPersonRestoreTimer) {
    return;
  }

  window.clearTimeout(hoveredPersonRestoreTimer);
  hoveredPersonRestoreTimer = 0;
}

function syncHoveredPersonListRows() {
  selectionExtraEl?.querySelectorAll('[data-map-hover-source-row-id]').forEach((rowElement) => {
    const isHovered = rowElement.getAttribute('data-map-hover-source-row-id') === hoveredPersonSourceRowId;
    rowElement.classList.toggle('is-hovered', isHovered);
  });
}

function findPersonBySourceRowId(sourceRowId) {
  if (!sourceRowId) {
    return null;
  }

  const personFromSelectionState = selectionPanelState.kind === 'person'
    ? selectionPanelState.details?.person
    : selectionPanelState.kind === 'person-loading'
      ? selectionPanelState.person
      : null;

  return (
    allPeople.find((entry) => entry.sourceRowId === sourceRowId) ||
    knownPeopleBySourceRowId.get(sourceRowId) ||
    (personFromSelectionState?.sourceRowId === sourceRowId ? personFromSelectionState : null) ||
    personSearchState.results.find((entry) => entry.sourceRowId === sourceRowId) ||
    null
  );
}

function readStoredMapRawFieldsExpanded() {
  try {
    const rawValue = window.localStorage.getItem(RAW_FIELDS_EXPANDED_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_MAP_RAW_FIELDS_EXPANDED_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_PEOPLE_RAW_FIELDS_EXPANDED_STORAGE_KEY);
    return rawValue == null ? true : rawValue === 'true';
  } catch (_error) {
    return true;
  }
}

function persistMapRawFieldsExpanded() {
  try {
    window.localStorage.setItem(RAW_FIELDS_EXPANDED_STORAGE_KEY, String(areMapRawFieldsExpanded));
  } catch (_error) {
    // Ignore storage write errors.
  }
}

async function loadMissingHistoryPeople(sourceRowIds) {
  const missingSourceRowIds = Array.from(new Set(sourceRowIds))
    .filter((sourceRowId) => sourceRowId && !findPersonBySourceRowId(sourceRowId))
    .filter((sourceRowId) => !historyPeopleLoadingSourceRowIds.has(sourceRowId));

  if (missingSourceRowIds.length === 0) {
    return;
  }

  missingSourceRowIds.forEach((sourceRowId) => {
    historyPeopleLoadingSourceRowIds.add(sourceRowId);
  });

  await Promise.all(
    missingSourceRowIds.map(async (sourceRowId) => {
      try {
        const details = await window.appApi.getPersonDetails(sourceRowId);
        if (details?.person) {
          cacheKnownPeople([details.person]);
        }
      } catch (_error) {
        // Ignore fetch failures for history placeholders.
      } finally {
        historyPeopleLoadingSourceRowIds.delete(sourceRowId);
      }
    })
  );

  if (infoPanelMode === 'history') {
    paintHistorySelection();
  }
}

function ensurePersonMarkerVisible(person, options = {}) {
  if (!person?.sourceRowId) {
    return null;
  }

  const isHiddenByCurrentFilter = !isPersonIncludedInCurrentMapData(person.sourceRowId);
  let marker = getPersonMarkerBySourceRowId(person.sourceRowId);
  if (!mapInstance || !Number.isFinite(person.lat) || !Number.isFinite(person.lng)) {
    return marker;
  }

  const point = [person.lat, person.lng];
  const shouldPanToPoint =
    options.allowMapPan !== false &&
    (isHiddenByCurrentFilter || !mapInstance.getBounds().pad(VISIBLE_BOUNDS_PADDING).contains(point));
  if (shouldPanToPoint) {
    mapInstance.panTo(point, {
      animate: false
    });
  }

  if (isHiddenByCurrentFilter) {
    syncSupplementalPeopleMarkers();
  } else if (!marker) {
    syncVisibleMarkers();
  }
  marker = getPersonMarkerBySourceRowId(person.sourceRowId);
  return marker;
}

function getPersonMarkerBySourceRowId(sourceRowId) {
  const personKey = buildPersonKeyFromSourceRowId(sourceRowId);
  if (!personKey) {
    return null;
  }

  const visibleMarker = visiblePeopleMarkers.get(personKey);
  if (visibleMarker) {
    return visibleMarker;
  }

  const supplementalMarker = supplementalPeopleMarkers.get(personKey);
  if (supplementalMarker) {
    return supplementalMarker;
  }

  if (activeSelection?.type === 'person' && activeSelection.key === personKey && activeSelection.marker) {
    return activeSelection.marker;
  }

  return null;
}

function syncPersonMarkerAppearanceBySourceRowId(sourceRowId) {
  if (!sourceRowId) {
    return;
  }

  syncPersonMarkerAppearance(getPersonMarkerBySourceRowId(sourceRowId), sourceRowId);
}

function syncPersonMarkerAppearance(marker, sourceRowId) {
  if (!marker || !sourceRowId) {
    return;
  }

  const personKey = buildPersonKeyFromSourceRowId(sourceRowId);
  const isActivePerson = activeSelection?.type === 'person' && activeSelection.key === personKey;
  const isHoveredPerson = hoveredPersonSourceRowId === sourceRowId;

  if (typeof marker.setStyle === 'function') {
    const nextStyle = isHoveredPerson
        ? HOVER_PERSON_MARKER_STYLE
      : isActivePerson
        ? ACTIVE_PERSON_MARKER_STYLE
        : DEFAULT_PERSON_MARKER_STYLE;
    marker.setStyle(nextStyle);
  }

  if (typeof marker.setIcon === 'function' && marker.__personMarkerVariant === 'supplemental') {
    syncSupplementalPersonMarkerIcon(marker, sourceRowId, {
      isActivePerson,
      isHoveredPerson
    });
  }

  syncHighlightedPersonMarkerOrder();
}

function syncSupplementalPersonMarkerIcon(marker, sourceRowId, state) {
  marker.setIcon(buildSupplementalPersonIcon(sourceRowId));
  if (typeof marker.setZIndexOffset === 'function') {
    marker.setZIndexOffset(state?.isHoveredPerson ? 2200 : state?.isActivePerson ? 1800 : 0);
  }
}

function buildSupplementalPersonIcon(sourceRowId) {
  const size = SUPPLEMENTAL_PERSON_ICON_SIZE;
  const center = size / 2;
  const radius = SUPPLEMENTAL_PERSON_ICON_RADIUS;
  const baseFill = '#79b7ff';
  const strokeColor = HOVER_PERSON_MARKER_STYLE.color;
  const innerStrokeColor = '#d2efff';
  const hatchColor = '#c2e7fb';
  const patternId = `supplemental-pattern-${String(sourceRowId || 'person').replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  return L.divIcon({
    className: 'supplemental-person-marker',
    iconSize: [size, size],
    iconAnchor: [center, center],
    popupAnchor: [0, -center + 4],
    html: `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <defs>
          <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="${hatchColor}" stroke-width="2" stroke-linecap="round" />
          </pattern>
        </defs>
        <circle cx="${center}" cy="${center}" r="${radius}" fill="${baseFill}" fill-opacity="${PERSON_LOCATION_HIGHLIGHT_MARKER_OPACITY}" />
        <circle cx="${center}" cy="${center}" r="${radius}" fill="url(#${patternId})" fill-opacity="${PERSON_LOCATION_HIGHLIGHT_MARKER_OPACITY}" />
        <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${innerStrokeColor}" stroke-width="1.5" stroke-opacity="${PERSON_LOCATION_HIGHLIGHT_MARKER_OPACITY}" />
        <circle cx="${center}" cy="${center}" r="${radius + 1}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-opacity="${PERSON_LOCATION_HIGHLIGHT_MARKER_OPACITY}" />
      </svg>
    `
  });
}

function syncSupplementalPeopleMarkers() {
  const requiredSourceRowIds = new Set();
  const activePersonSourceRowId =
    activeSelection?.type === 'person' ? activeSelection.key.replace(/^person:/, '') : '';

  if (activePersonSourceRowId && !isPersonIncludedInCurrentMapData(activePersonSourceRowId)) {
    requiredSourceRowIds.add(activePersonSourceRowId);
  }

  if (hoveredPersonSourceRowId && !isPersonIncludedInCurrentMapData(hoveredPersonSourceRowId)) {
    requiredSourceRowIds.add(hoveredPersonSourceRowId);
  }

  for (const [personKey, marker] of supplementalPeopleMarkers.entries()) {
    const sourceRowId = marker.__personSourceRowId || personKey.replace(/^person:/, '');
    if (requiredSourceRowIds.has(sourceRowId)) {
      continue;
    }

    supplementalPeopleLayer?.removeLayer(marker);
    supplementalPeopleMarkers.delete(personKey);
    if (activeSelection?.type === 'person' && activeSelection.key === personKey && activeSelection.marker === marker) {
      activeSelection.marker = visiblePeopleMarkers.get(personKey) || null;
    }
  }

  requiredSourceRowIds.forEach((sourceRowId) => {
    const person = findPersonBySourceRowId(sourceRowId);
    if (!person || !Number.isFinite(person.lat) || !Number.isFinite(person.lng)) {
      return;
    }

    const marker = ensureSupplementalPersonMarker(person);
    if (activeSelection?.type === 'person' && activeSelection.key === buildPersonKeyFromSourceRowId(sourceRowId)) {
      activeSelection.marker = marker;
    }
    syncPersonMarkerAppearance(marker, sourceRowId);
  });
}

function ensureSupplementalPersonMarker(person) {
  const personKey = buildPersonKey(person);
  let marker = supplementalPeopleMarkers.get(personKey);
  const latLng = [person.lat, person.lng];

  if (!marker) {
    marker = L.marker(latLng, {
      icon: buildSupplementalPersonIcon(person.sourceRowId),
      keyboard: false,
      title: person.fullName || person.companyName || 'Osoba'
    });
    marker.__personMarkerVariant = 'supplemental';
    marker.__personSourceRowId = person.sourceRowId;
    attachLazyPopup(marker, () => buildPersonPopupHtml(person), () => {
      void selectPersonPoint(person, marker, { panelMode: 'selection' });
    });
    supplementalPeopleLayer?.addLayer(marker);
    supplementalPeopleMarkers.set(personKey, marker);
    return marker;
  }

  marker.setLatLng(latLng);
  return marker;
}

function syncHighlightedPersonMarkerOrder() {
  const activePersonSourceRowId = getCurrentSelectedPersonSourceRowId();
  const activeMarker = getPersonMarkerBySourceRowId(activePersonSourceRowId);
  const hoveredMarker = getPersonMarkerBySourceRowId(hoveredPersonSourceRowId);
  const hoveredIsActive = Boolean(
    activeMarker &&
      hoveredMarker &&
      activeMarker === hoveredMarker
  );

  activeMarker?.bringToFront?.();
  activeMarker?.setZIndexOffset?.(hoveredIsActive ? 2200 : 1800);
  if (hoveredMarker && hoveredMarker !== activeMarker) {
    hoveredMarker.bringToFront?.();
    hoveredMarker.setZIndexOffset?.(2200);
  }

  if (activeMarker?.__personMarkerVariant === 'supplemental') {
    activeMarker.bringToFront?.();
    activeMarker.setZIndexOffset?.(hoveredIsActive ? 2800 : 2600);
  }

  if (hoveredMarker?.__personMarkerVariant === 'supplemental') {
    hoveredMarker.bringToFront?.();
    hoveredMarker.setZIndexOffset?.(2800);
  }
}
