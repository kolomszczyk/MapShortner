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
const mapCanvasPanelEl = document.querySelector('.map-canvas-panel');
const mapBoardEl = document.querySelector('.map-board');
const mapContentGroupEl = document.querySelector('.map-content-group');
const mapInfoPanelEl = document.querySelector('.map-info-panel');
const mapDevHudEl = document.querySelector('[data-map-dev-hud]');
const mapLoadingIndicatorEl = document.querySelector('[data-map-loading-indicator]');
const selectionButtonEl = document.querySelector('[data-map-tool="selection"]');
const searchButtonEl = document.querySelector('[data-map-tool="search"]');
const historyButtonEl = document.querySelector('[data-map-tool="history"]');
const filterButtonEl = document.querySelector('[data-map-tool="filter"]');
const colorsButtonEl = document.querySelector('[data-map-tool="colors"]');
const listButtonEl = document.querySelector('[data-map-tool="list"]');
const bookmarkedButtonEl = document.querySelector('[data-map-tool="bookmarked"]');
const settingsButtonEl = document.querySelector('[data-map-tool="settings"]');
const overviewViewEl = document.querySelector('[data-map-view="overview"]');
const settingsViewEl = document.querySelector('[data-map-view="settings"]');
const overviewAccessPathEl = document.querySelector('[data-map-overview-access-path]');
const overviewImportedAtEl = document.querySelector('[data-map-overview-imported-at]');
const overviewDefaultEls = document.querySelectorAll('[data-map-overview-default]');
const selectionHeaderEl = document.querySelector('[data-map-selection-header]');
const selectionTitleEl = document.querySelector('[data-map-selection-title]');
const selectionActionsEl = document.querySelector('[data-map-selection-actions]');
const selectionColorIndicatorEl = document.querySelector('[data-map-selection-color-indicator]');
const selectionCopyEl = document.querySelector('[data-map-selection-copy]');
const selectionMetaEl = document.querySelector('[data-map-selection-meta]');
const selectionExtraEl = document.querySelector('[data-map-selection-extra]');
const selectionFocusButtonEl = document.querySelector('[data-map-selection-focus]');
const selectionBookmarkButtonEl = document.querySelector('[data-map-selection-bookmark]');
const selectionBookmarkIconEl = document.querySelector('[data-map-selection-bookmark-icon]');
const isDevMode = window.appApi?.runtimeMeta?.isDevMode === true;

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
const UNMATCHED_TIME_COLOR_PERSON_MARKER_STYLE = {
  ...DEFAULT_PERSON_MARKER_STYLE,
  color: '#4db06f',
  fillColor: '#4db06f',
  fillOpacity: 0
};
const ACTIVE_PERSON_MARKER_STYLE = {
  radius: 9,
  color: '#6e3cbc',
  opacity: PERSON_LOCATION_HIGHLIGHT_MARKER_OPACITY,
  weight: 3,
  fillColor: '#bb86fc',
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
const OUTLINE_ONLY_TIME_COLOR_VALUES = new Set(['#1f1f1f']);
const OUTLINE_ONLY_TIME_COLOR_FILL_OPACITY = 0.12;
const DARK_TIME_COLOR_OUTLINE_LUMINANCE_THRESHOLD = 0.18;
const DARK_TIME_COLOR_OUTLINE_LIGHTEN_FACTOR = 0.42;

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
const HOVER_POPUP_CLOSE_DELAY_MS = 140;
const PERSON_POPUP_OVERLAP_DISTANCE_PX = 4;
const MAP_HOVER_PREFETCH_DEBOUNCE_MS = 360;
const HOVERED_PERSON_PREVIEW_DELAY_MS = 320;
const HOVERED_PERSON_RESTORE_DELAY_MS = 160;
const HOVERED_PERSON_PREVIEW_PAN_DURATION_MS = 560;
const HOVERED_PERSON_RESTORE_PAN_DURATION_MS = 420;
const LAST_SELECTED_PERSON_STORAGE_KEY = 'map:lastSelectedPersonId';
const LAST_SELECTED_PERSON_DETAILS_STORAGE_KEY = 'people:lastSelectedPersonDetails';
const LAST_SELECTED_PERSON_RESTORE_STATE_STORAGE_KEY = 'map:lastSelectedPersonRestoreState';
const PERSON_SELECTION_HISTORY_STORAGE_KEY = 'map:personSelectionHistory';
const MAX_PERSON_SELECTION_HISTORY_ENTRIES = 100;
const MAP_NAVIGATION_HISTORY_STATE_KIND = 'map-navigation';
const MAP_PERSON_SEARCH_BATCH_SIZE = 50;
const MAP_PERSON_SEARCH_DEBOUNCE_MS = 160;
const MAP_PERSON_SEARCH_SCROLL_THRESHOLD_PX = 120;
const MAP_PERSON_SEARCH_ROW_GAP_PX = 10;
const MAP_PERSON_SEARCH_ESTIMATED_ROW_HEIGHT_PX = 108;
const MAP_PERSON_LIST_BATCH_SIZE = 50;
const MAP_PERSON_LIST_SCROLL_THRESHOLD_PX = 120;
const MAP_PERSON_LIST_ROW_GAP_PX = 10;
const MAP_PERSON_LIST_ESTIMATED_ROW_HEIGHT_PX = 108;
const MAP_DATE_FILTER_BATCH_SIZE = 50;
const MAP_DATE_FILTER_APPLY_DEBOUNCE_MS = 180;
const MAP_DATE_FILTER_SCROLL_THRESHOLD_PX = 120;
const MAP_DATE_FILTER_ROW_GAP_PX = 10;
const MAP_DATE_FILTER_ESTIMATED_ROW_HEIGHT_PX = 96;
const MAP_VISIBLE_MARKER_SCAN_CHUNK_SIZE = 400;
const MAP_TIME_CHART_PAST_PADDING_MONTHS = 1;
const MAP_TIME_CHART_FUTURE_PADDING_MONTHS = 2;
const MAP_TIME_CHART_ROW_HEIGHT_PX = 16;
const MAP_TIME_CHART_ROW_GAP_PX = 10;
const MAP_TIME_CHART_PLOT_GAP_PX = 12;
const MAP_TIME_CHART_YEAR_LABEL_AREA_PX = 14;
const MAP_TIME_CHART_YEAR_TICK_TOP_OVERFLOW_PX = 10;
const MAP_TIME_CHART_MAX_VISIBLE_MONTH_TICKS = 60;
const MAP_TIME_CHART_SNAP_DISTANCE_PX = 8;
const MAP_TIME_CHART_EDGE_EXPAND_TRIGGER_PX = 18;
const MAP_TIME_CHART_OPEN_ENDED_TRIGGER_PX = 120;
const MAP_TIME_CHART_EDGE_EXPAND_DELAY_MS = 320;
const MAP_TIME_CHART_EDGE_EXPAND_DURATION_MS = 2040;
const MAP_TIME_CHART_EDGE_EXPAND_MAX_MONTHS = 12;
const MAP_TIME_COLOR_MENU_PRESETS = [
  { label: 'Czarny', value: '#1f1f1f' },
  { label: 'Niebieski', value: '#4d97d1' },
  { label: 'Różowy', value: '#d97ab1' },
  { label: 'Fioletowy', value: '#845ec2' },
  { label: 'Czerwony', value: '#d65f4a' },
  { label: 'Pomarańczowy', value: '#e28a30' },
  { label: 'Żółty', value: '#e3b341' },
  { label: 'Żółto-Zielony', value: '#9ebd33' },
  { label: 'Zielony', value: '#4db06f' }
];
const LAST_OPENED_MAP_PANEL_STORAGE_KEY = 'map:lastOpenedPanelState';
const MAP_VIEWPORT_STORAGE_KEY = 'map:viewportState';
const MAP_DATE_FILTER_STORAGE_KEY = 'map:dateFilterState';
const MAP_PERSON_SEARCH_QUERY_STORAGE_KEY = 'map:personSearchQuery';
const MAP_TIME_COLOR_DATE_MATCH_MODE_STORAGE_KEY = 'map:timeColorDateMatchMode';
const MAP_TIME_COLOR_RANGES_STORAGE_KEY = 'map:timeColorRanges';
const MAP_TIME_COLOR_RANGES_RESET_MIGRATION_STORAGE_KEY = 'map:timeColorRangesResetMigration:2026-03-default-thresholds';
const RAW_FIELDS_EXPANDED_STORAGE_KEY = 'person:rawFieldsExpanded';
const LEGACY_MAP_RAW_FIELDS_EXPANDED_STORAGE_KEY = 'map:rawFieldsExpanded';
const LEGACY_PEOPLE_RAW_FIELDS_EXPANDED_STORAGE_KEY = 'people:rawFieldsExpanded';
const DEFAULT_INFO_PANEL_MODE = 'selection';
const SETTINGS_PANEL_STORAGE_STATE = 'settings';
const INFO_PANEL_MODES = ['selection', 'search', 'history', 'filter', 'colors', 'list', 'bookmarked'];
const MONTH_LABELS = ['Styczen', 'Luty', 'Marzec', 'Kwiecien', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpien', 'Wrzesien', 'Pazdziernik', 'Listopad', 'Grudzien'];
const EARLIEST_COMPARABLE_DATE = '0001-01-01';
const LATEST_COMPARABLE_DATE = '9999-12-31';
const restoredMapPanelState = readStoredMapPanelState();
const restoredMapViewportState = readStoredMapViewportState();
const restoredMapDateFilterState = readStoredMapDateFilterState();
const restoredMapPersonSearchQuery = readStoredMapPersonSearchQuery();
const restoredMapTimeColorRanges = readStoredMapTimeColorRanges();
const restoredMapTimeColorDateMatchMode = readStoredMapTimeColorDateMatchMode();

let mapInstance;
let tileLayer;
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
let mapFilterOptions = {
  pumpTypes: [],
  visitTypes: [],
  regions: [],
  postalCodes: [],
  producers: [],
  installerCompanies: []
};
let mapDateFilterDraft = resolveMapDateFilterDraft(restoredMapDateFilterState, mapDateFilter);
let mapTimeColorRanges = restoredMapTimeColorRanges;
let mapTimeColorDateMatchMode = restoredMapTimeColorDateMatchMode;
let mapDateFilterApplyTimer = null;
let mapDateFilterApplyRequestToken = 0;
let mapPointsRequestToken = 0;
let visibleMarkerSyncRequestToken = 0;
let visibleMarkerSyncTimer = 0;
let mapPopupLoadingOperations = 0;
let isMapPointsLoading = false;
let personSearchTimer = null;
let personSearchRequestToken = 0;
let areMapRawFieldsExpanded = readStoredMapRawFieldsExpanded();
let personSearchState = {
  query: restoredMapPersonSearchQuery,
  results: [],
  total: 0,
  isLoading: false,
  hasLoaded: false,
  hasMore: false
};
let personListState = {
  results: [],
  total: 0,
  isLoading: false,
  hasLoaded: false,
  hasMore: false,
  renderedCount: 0
};
let bookmarkedPersonListState = {
  results: [],
  total: 0,
  isLoading: false,
  hasLoaded: false,
  hasMore: false,
  renderedCount: 0
};
let mapSearchRowHeight = MAP_PERSON_SEARCH_ESTIMATED_ROW_HEIGHT_PX;
let mapListRowHeight = MAP_PERSON_LIST_ESTIMATED_ROW_HEIGHT_PX;
let mapBookmarkedListRowHeight = MAP_PERSON_LIST_ESTIMATED_ROW_HEIGHT_PX;
let mapDateFilterRenderedCount = 0;
let mapDateFilterRowHeight = MAP_DATE_FILTER_ESTIMATED_ROW_HEIGHT_PX;
let mapTimeColorDateMatchModeAsyncPersistFrame = 0;
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
let timeColorChartDragState = null;
let timeColorChartViewportOverride = null;
let timeColorConfirmState = null;
let mapTimeColorAsyncPersistFrame = 0;
let hoverTilePrefetchTimer = 0;
let lastQueuedHoverTilePrefetchKey = '';
let activeTilePackageRevision = 1;
let overlapSelectionBypassSourceRowId = null;
let isSelectionOverlapChooserActive = false;
let mapToastListEl = null;

function endTimeColorChartDragState(options = {}) {
  const shouldCommit = Boolean(options?.commit);
  timeColorChartDragState = null;
  if (shouldCommit) {
    persistMapTimeColorRanges();
  }
  if (timeColorChartViewportOverride) {
    timeColorChartViewportOverride = null;
    if (infoPanelMode === 'colors') {
      paintTimeColorPanel();
    }
  }
  if (document.pointerLockElement === selectionExtraEl) {
    document.exitPointerLock?.();
  }
}

function getTimeColorChartDragClientX(event) {
  if (!timeColorChartDragState) {
    return null;
  }

  if (timeColorChartDragState.pointerLockActive && typeof event?.movementX === 'number') {
    timeColorChartDragState.virtualClientX += event.movementX;
    return timeColorChartDragState.virtualClientX;
  }

  if (typeof event?.clientX === 'number') {
    timeColorChartDragState.virtualClientX = event.clientX;
    return event.clientX;
  }

  return null;
}

function syncTimeColorChartDragAtClientX(clientX) {
  if (!timeColorChartDragState || !Number.isFinite(clientX)) {
    return;
  }

  timeColorChartViewportOverride = getMapTimeColorChartViewportOverride(clientX, timeColorChartDragState);
  const nextRanges = applyTimeColorChartDrag(clientX, timeColorChartDragState);
  if (!nextRanges) {
    return;
  }

  mapTimeColorRanges = nextRanges;
  paintTimeColorPanel();
}

function getMapTimeColorChartPointerPercent(clientX, dragState) {
  if (!dragState || !Number.isFinite(dragState.trackLeft) || !Number.isFinite(dragState.trackWidth) || dragState.trackWidth <= 0) {
    return 0;
  }

  const normalizedClientX = Number(clientX);
  const leftBoundary = dragState.trackLeft + MAP_TIME_CHART_EDGE_EXPAND_TRIGGER_PX;
  const rightBoundary = dragState.trackLeft + dragState.trackWidth - MAP_TIME_CHART_EDGE_EXPAND_TRIGGER_PX;

  if (dragState.edgeExpandDirection === 'left' && normalizedClientX <= leftBoundary) {
    return 0;
  }

  if (dragState.edgeExpandDirection === 'right' && normalizedClientX >= rightBoundary) {
    return 1;
  }

  return Math.max(
    0,
    Math.min(1, (normalizedClientX - dragState.trackLeft) / dragState.trackWidth)
  );
}

function closeMapTimeColorMenus(exceptMenu = null) {
  if (infoPanelMode !== 'colors') {
    return;
  }

  selectionExtraEl?.querySelectorAll('.time-color-menu[open]').forEach((menuElement) => {
    if (exceptMenu && menuElement === exceptMenu) {
      return;
    }

    clearMapTimeColorMenuPendingColor(menuElement, { restoreCurrent: true });
    menuElement.removeAttribute('open');
  });
}

function getMapTimeColorMenuScrollContainer(element) {
  let currentElement = element?.parentElement || null;
  while (currentElement && currentElement !== document.body) {
    const computedStyle = window.getComputedStyle(currentElement);
    const overflowY = computedStyle?.overflowY || '';
    const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') && currentElement.scrollHeight > currentElement.clientHeight;
    if (isScrollable) {
      return currentElement;
    }
    currentElement = currentElement.parentElement;
  }

  return selectionExtraEl || mapInfoPanelEl || document.documentElement;
}

function getEstimatedMapTimeColorMenuPopoverHeight(menuElement, popoverElement = null) {
  const measuredHeight = popoverElement?.offsetHeight || popoverElement?.getBoundingClientRect?.().height || 0;
  if (measuredHeight > 0) {
    return measuredHeight;
  }

  const optionCount = menuElement?.querySelectorAll('.time-color-menu-option').length || 0;
  const rowCount = Math.max(1, Math.ceil(optionCount / 4));
  return 20 + (rowCount * 24) + (Math.max(0, rowCount - 1) * 8) + 2;
}

function syncMapTimeColorMenuDirection(menuElement, options = {}) {
  if (!menuElement) {
    return;
  }

  menuElement.classList.remove('is-open-upward');
  const shouldMeasureClosed = Boolean(options?.allowClosedMeasurement);
  if (!menuElement.hasAttribute('open') && !shouldMeasureClosed) {
    return;
  }

  const triggerElement = menuElement.querySelector('.time-color-menu-trigger');
  const popoverElement = menuElement.querySelector('.time-color-menu-popover');
  if (!triggerElement || !popoverElement) {
    return;
  }

  const scrollContainer = getMapTimeColorMenuScrollContainer(menuElement);
  const containerRect = scrollContainer?.getBoundingClientRect?.()
    || {
      top: 0,
      bottom: window.innerHeight
    };
  const triggerRect = triggerElement.getBoundingClientRect();
  const popoverHeight = getEstimatedMapTimeColorMenuPopoverHeight(menuElement, popoverElement);
  const availableBelow = containerRect.bottom - triggerRect.bottom;
  const availableAbove = triggerRect.top - containerRect.top;

  if (popoverHeight > 0 && availableBelow < popoverHeight + 12 && availableAbove > availableBelow) {
    menuElement.classList.add('is-open-upward');
  }
}

function syncOpenMapTimeColorMenusDirection() {
  if (infoPanelMode !== 'colors') {
    return;
  }

  selectionExtraEl?.querySelectorAll('.time-color-menu[open]').forEach((menuElement) => {
    syncMapTimeColorMenuDirection(menuElement);
  });
}

function getMapTimeColorMenuCurrentColor(menuElement) {
  return normalizeHexColorInputValue(menuElement?.dataset?.currentColor || menuElement?.style?.getPropertyValue('--swatch-fill') || '');
}

function updateMapTimeColorMenuPendingState(menuElement) {
  if (!menuElement) {
    return;
  }

  const currentColor = getMapTimeColorMenuCurrentColor(menuElement);
  const pendingColor = normalizeHexColorInputValue(menuElement.dataset.pendingColor || '');
  const hasPendingColor = Boolean(menuElement.dataset.pendingColor) && pendingColor !== currentColor;
  menuElement.classList.toggle('has-pending-custom-color', hasPendingColor);
  const confirmButton = menuElement.querySelector('[data-map-time-color-menu-custom-confirm]');
  if (confirmButton) {
    confirmButton.disabled = !hasPendingColor;
  }
}

function clearMapTimeColorMenuPendingColor(menuElement, options = {}) {
  if (!menuElement) {
    return;
  }

  delete menuElement.dataset.pendingColor;
  const currentColor = getMapTimeColorMenuCurrentColor(menuElement);
  const customInput = menuElement.querySelector('.time-color-menu-custom-input');
  if (customInput) {
    customInput.value = currentColor;
  }
  if (options?.restoreCurrent) {
    syncMapTimeColorMenuElement(menuElement, currentColor, { setAsCurrent: false });
  }
  updateMapTimeColorMenuPendingState(menuElement);
}

function stageMapTimeColorMenuPendingColor(menuElement, nextColor) {
  if (!menuElement) {
    return;
  }

  const normalizedColor = normalizeHexColorInputValue(nextColor);
  const currentColor = getMapTimeColorMenuCurrentColor(menuElement);
  const customInput = menuElement.querySelector('.time-color-menu-custom-input');
  if (customInput) {
    customInput.value = normalizedColor;
  }

  if (normalizedColor === currentColor) {
    clearMapTimeColorMenuPendingColor(menuElement, { restoreCurrent: true });
    return;
  }

  menuElement.dataset.pendingColor = normalizedColor;
  syncMapTimeColorMenuElement(menuElement, normalizedColor, { setAsCurrent: false });
  updateMapTimeColorMenuPendingState(menuElement);
}

function focusMapTimeColorLabelInput(rangeId, options = {}) {
  const labelInput = selectionExtraEl?.querySelector(
    `[data-map-time-color-row-id="${CSS.escape(rangeId || '')}"] [data-map-time-color-field="label"]`
  );
  if (!labelInput) {
    return;
  }

  labelInput.focus();
  if (options.selectAll) {
    const valueLength = typeof labelInput.value === 'string' ? labelInput.value.length : 0;
    labelInput.setSelectionRange?.(0, valueLength);
    return;
  }

  const valueLength = typeof labelInput.value === 'string' ? labelInput.value.length : 0;
  labelInput.setSelectionRange?.(valueLength, valueLength);
}

selectionButtonEl?.addEventListener('click', () => {
  openInfoPanelMode('selection');
});

searchButtonEl?.addEventListener('click', () => {
  if (!openInfoPanelMode('search')) {
    focusMapSearchInput();
  }
});

listButtonEl?.addEventListener('click', () => {
  openInfoPanelMode('list');
});

bookmarkedButtonEl?.addEventListener('click', () => {
  openInfoPanelMode('bookmarked');
});

historyButtonEl?.addEventListener('click', () => {
  openInfoPanelMode('history');
});

filterButtonEl?.addEventListener('click', () => {
  openInfoPanelMode('filter');
});

colorsButtonEl?.addEventListener('click', () => {
  openInfoPanelMode('colors');
});

settingsButtonEl?.addEventListener('click', () => {
  toggleSettingsPanel();
});

mapEl?.addEventListener('click', (event) => {
  const copyPersonIdControl = event.target.closest('[data-map-copy-person-id]');
  if (copyPersonIdControl) {
    event.preventDefault();
    event.stopPropagation();
    void copyTextToClipboard(copyPersonIdControl.getAttribute('data-map-copy-person-id'));
    return;
  }

  const popupPersonEntry = event.target.closest('[data-map-popup-person-source-row-id]');
  if (!popupPersonEntry) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  openSelectionPanelForSourceRowId(popupPersonEntry.getAttribute('data-map-popup-person-source-row-id'));
});

mapEl?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  const copyPersonIdControl = event.target.closest('[data-map-copy-person-id]');
  if (copyPersonIdControl) {
    event.preventDefault();
    event.stopPropagation();
    void copyTextToClipboard(copyPersonIdControl.getAttribute('data-map-copy-person-id'));
    return;
  }

  const popupPersonEntry = event.target.closest('[data-map-popup-person-source-row-id]');
  if (!popupPersonEntry) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  openSelectionPanelForSourceRowId(popupPersonEntry.getAttribute('data-map-popup-person-source-row-id'));
});

selectionExtraEl?.addEventListener('pointerdown', (event) => {
  if (infoPanelMode !== 'colors') {
    return;
  }

  const menuTrigger = event.target.closest('.time-color-menu-trigger');
  const menuElement = menuTrigger?.closest('.time-color-menu');
  if (!menuElement || menuElement.hasAttribute('open')) {
    return;
  }

  syncMapTimeColorMenuDirection(menuElement, { allowClosedMeasurement: true });
});

function handleSelectionPanelClick(event) {
  if (infoPanelMode === 'colors') {
    const clickedMenu = event.target.closest('.time-color-menu');
    window.setTimeout(() => {
      if (clickedMenu && !clickedMenu.hasAttribute('open')) {
        clearMapTimeColorMenuPendingColor(clickedMenu, { restoreCurrent: true });
        closeMapTimeColorMenus();
        return;
      }

      closeMapTimeColorMenus(clickedMenu || null);
      if (clickedMenu?.hasAttribute('open')) {
        syncMapTimeColorMenuDirection(clickedMenu);
      }
    }, 0);
  }

  const rawFieldsToggleButton = event.target.closest('[data-map-toggle-raw-fields]');
  if (rawFieldsToggleButton && infoPanelMode === 'selection' && selectionPanelState.kind === 'person') {
    areMapRawFieldsExpanded = !areMapRawFieldsExpanded;
    persistMapRawFieldsExpanded();
    paintPersonSelection(selectionPanelState.details);
    return;
  }

  const personRowBookmarkToggle = event.target.closest('[data-map-person-bookmark-toggle]');
  if (personRowBookmarkToggle) {
    event.preventDefault();
    event.stopPropagation();
    void togglePersonBookmarkFromListRow(personRowBookmarkToggle);
    return;
  }

  const copyPersonIdControl = event.target.closest('[data-map-copy-person-id]');
  if (copyPersonIdControl) {
    event.preventDefault();
    event.stopPropagation();
    void copyTextToClipboard(copyPersonIdControl.getAttribute('data-map-copy-person-id'));
    return;
  }

  const overlapPersonButton = event.target.closest('[data-map-overlap-source-row-id]');
  if (overlapPersonButton && infoPanelMode === 'selection') {
    event.preventDefault();
    event.stopPropagation();

    const sourceRowId = overlapPersonButton.getAttribute('data-map-overlap-source-row-id');
    const normalizedSourceRowId = String(sourceRowId || '').trim();
    if (!normalizedSourceRowId) {
      return;
    }

    const person = findPersonBySourceRowId(normalizedSourceRowId);
    if (!person) {
      return;
    }

    focusSelectionOnMap(person);
    void selectPersonPoint(person, getPersonMarkerBySourceRowId(normalizedSourceRowId), {
      panelMode: 'selection',
      bypassOverlapSelection: true
    });
    return;
  }

  const sameLocationPersonButton = event.target.closest('[data-map-same-location-source-row-id]');
  if (sameLocationPersonButton && infoPanelMode === 'selection') {
    event.preventDefault();
    event.stopPropagation();

    const sourceRowId = sameLocationPersonButton.getAttribute('data-map-same-location-source-row-id');
    const normalizedSourceRowId = String(sourceRowId || '').trim();
    if (!normalizedSourceRowId) {
      return;
    }

    const person = findPersonBySourceRowId(normalizedSourceRowId);
    if (!person) {
      return;
    }

    focusSelectionOnMap(person);
    void selectPersonPoint(person, getPersonMarkerBySourceRowId(normalizedSourceRowId), {
      panelMode: 'selection',
      bypassOverlapSelection: true
    });
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
      panelMode: 'selection',
      bypassOverlapSelection: true
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
      panelMode: 'selection',
      bypassOverlapSelection: true
    });
    return;
  }

  const listResultButton = event.target.closest('[data-map-list-source-row-id]');
  if (listResultButton && infoPanelMode === 'list') {
    const sourceRowId = listResultButton.getAttribute('data-map-list-source-row-id');
    const listResult = personListState.results.find((entry) => entry.sourceRowId === sourceRowId);
    if (!listResult) {
      return;
    }

    const mapPerson = allPeople.find((entry) => entry.sourceRowId === sourceRowId) || listResult;
    focusSelectionOnMap(mapPerson);
    void selectPersonPoint(mapPerson, visiblePeopleMarkers.get(buildPersonKey(mapPerson)) || null, {
      panelMode: 'selection',
      bypassOverlapSelection: true
    });
    return;
  }

  const bookmarkedResultButton = event.target.closest('[data-map-bookmarked-source-row-id]');
  if (bookmarkedResultButton && infoPanelMode === 'bookmarked') {
    const sourceRowId = bookmarkedResultButton.getAttribute('data-map-bookmarked-source-row-id');
    const listResult = bookmarkedPersonListState.results.find((entry) => entry.sourceRowId === sourceRowId);
    if (!listResult) {
      return;
    }

    const mapPerson = allPeople.find((entry) => entry.sourceRowId === sourceRowId) || listResult;
    focusSelectionOnMap(mapPerson);
    void selectPersonPoint(mapPerson, visiblePeopleMarkers.get(buildPersonKey(mapPerson)) || null, {
      panelMode: 'selection',
      bypassOverlapSelection: true
    });
    return;
  }

  const clearSearchButton = event.target.closest('[data-map-person-search-clear]');
  if (clearSearchButton && infoPanelMode === 'search') {
    updatePersonSearchQuery('', { immediate: true });
    return;
  }

  const resetFilterFieldButton = event.target.closest('[data-map-date-filter-reset-field]');
  if (resetFilterFieldButton && infoPanelMode === 'filter') {
    const fieldName = String(resetFilterFieldButton.getAttribute('data-map-date-filter-reset-field') || '').trim();
    mapDateFilterDraft = resetMapDateFilterDraftField(mapDateFilterDraft, fieldName);
    mapDateFilterHasInvalidRange = false;
    persistMapDateFilterState();
    scheduleMapDateFilterApply({ immediate: true });
    return;
  }

  const resetFilterButton = event.target.closest('[data-map-date-filter-reset]');
  if (resetFilterButton && infoPanelMode === 'filter') {
    mapDateFilterDraft = buildDefaultMapDateFilterDraft();
    mapDateFilterHasInvalidRange = false;
    persistMapDateFilterState();
    scheduleMapDateFilterApply({ immediate: true });
    return;
  }

  const addTimeColorRangeButton = event.target.closest('[data-map-time-color-add]');
  if (addTimeColorRangeButton && infoPanelMode === 'colors') {
    mapTimeColorRanges = insertMapTimeColorRangeBeforeSpecialRanges(
      mapTimeColorRanges,
      buildDefaultMapTimeColorRange(mapTimeColorRanges.length, {
        label: getNextMapTimeColorRangeLabel(mapTimeColorRanges, mapTimeColorRanges.length)
      })
    );
    persistMapTimeColorRanges();
    paintTimeColorPanel();
    return;
  }

  const removeTimeColorRangeButton = event.target.closest('[data-map-time-color-remove]');
  if (removeTimeColorRangeButton && infoPanelMode === 'colors') {
    const rangeId = removeTimeColorRangeButton.getAttribute('data-map-time-color-remove');
    const range = mapTimeColorRanges.find((entry) => entry.id === rangeId);
    if (!range || isMapTimeColorProtectedRange(range)) {
      return;
    }

    timeColorConfirmState = {
      kind: 'remove-range',
      rangeId
    };
    paintTimeColorPanel();
    return;
  }

  const previewDisableTimeColorRangeButton = event.target.closest('[data-map-time-color-preview-disable]');
  if (previewDisableTimeColorRangeButton && infoPanelMode === 'colors') {
    const rangeId = previewDisableTimeColorRangeButton.getAttribute('data-map-time-color-preview-disable');
    updateMapTimeColorRangeFromPreviewField(rangeId, 'enabled', 'false');
    return;
  }

  const previewRemoveTimeColorRangeButton = event.target.closest('[data-map-time-color-preview-remove]');
  if (previewRemoveTimeColorRangeButton && infoPanelMode === 'colors') {
    const rangeId = previewRemoveTimeColorRangeButton.getAttribute('data-map-time-color-preview-remove');
    const range = mapTimeColorRanges.find((entry) => entry.id === rangeId);
    if (!range || isMapTimeColorProtectedRange(range)) {
      return;
    }

    timeColorConfirmState = {
      kind: 'remove-range',
      rangeId
    };
    paintTimeColorPanel();
    return;
  }

  const confirmTimeColorDialogButton = event.target.closest('[data-map-time-color-confirm]');
  if (confirmTimeColorDialogButton && infoPanelMode === 'colors') {
    if (timeColorConfirmState?.kind === 'remove-range') {
      mapTimeColorRanges = mapTimeColorRanges.filter((range) => {
        return range.id !== timeColorConfirmState.rangeId || isMapTimeColorProtectedRange(range);
      });
      persistMapTimeColorRanges();
    } else if (timeColorConfirmState?.kind === 'reset-defaults') {
      mapTimeColorRanges = createDefaultMapTimeColorRanges();
      mapTimeColorDateMatchMode = normalizeMapTimeColorDateMatchMode();
      persistMapTimeColorDateMatchMode();
      persistMapTimeColorRanges();
    }
    timeColorConfirmState = null;
    paintTimeColorPanel();
    return;
  }

  if (event.target instanceof Element && event.target.matches('.time-color-confirm-overlay') && infoPanelMode === 'colors') {
    timeColorConfirmState = null;
    paintTimeColorPanel();
    return;
  }

  const cancelTimeColorDialogButton = event.target.closest('[data-map-time-color-confirm-cancel]');
  if (cancelTimeColorDialogButton && infoPanelMode === 'colors') {
    timeColorConfirmState = null;
    paintTimeColorPanel();
    return;
  }

  const resetTimeColorRangesButton = event.target.closest('[data-map-time-color-reset]');
  if (resetTimeColorRangesButton && infoPanelMode === 'colors') {
    timeColorConfirmState = {
      kind: 'reset-defaults'
    };
    paintTimeColorPanel();
    return;
  }

  const timeColorPresetButton = event.target.closest('[data-map-time-color-menu-preset]');
  if (timeColorPresetButton && infoPanelMode === 'colors') {
    event.preventDefault();
    clearMapTimeColorMenuPendingColor(timeColorPresetButton.closest('.time-color-menu'));
    applyMapTimeColorMenuValue(
      timeColorPresetButton.closest('.time-color-menu'),
      timeColorPresetButton.getAttribute('data-map-time-color-menu-preset')
    );
    return;
  }

  const confirmCustomTimeColorButton = event.target.closest('[data-map-time-color-menu-custom-confirm]');
  if (confirmCustomTimeColorButton && infoPanelMode === 'colors') {
    const menuElement = confirmCustomTimeColorButton.closest('.time-color-menu');
    const pendingColor = menuElement?.dataset?.pendingColor || '';
    if (!menuElement || !pendingColor) {
      return;
    }

    applyMapTimeColorMenuValue(menuElement, pendingColor, {
      closeMenu: true,
      persistAsync: true
    });
    return;
  }

  const focusTimeColorLabelButton = event.target.closest('[data-map-time-color-focus-label]');
  if (focusTimeColorLabelButton && infoPanelMode === 'colors') {
    const rangeId = focusTimeColorLabelButton.getAttribute('data-map-time-color-focus-label');
    focusMapTimeColorLabelInput(rangeId);
    return;
  }

  const legendValueBox = event.target.closest('.legend-value-box');
  if (legendValueBox && infoPanelMode === 'colors') {
    const input = legendValueBox.querySelector('.legend-value-input');
    if (input) {
      input.focus();
      const valueLength = typeof input.value === 'string' ? input.value.length : 0;
      input.setSelectionRange?.(valueLength, valueLength);
    }
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
      panelMode: 'selection',
      bypassOverlapSelection: true
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

  async function togglePersonBookmarkFromListRow(bookmarkElement) {
    const sourceRowId = String(bookmarkElement?.getAttribute('data-map-person-bookmark-toggle') || '').trim();
    if (!sourceRowId || !window.appApi?.setPersonBookmark) {
      return;
    }

    const isBookmarked = bookmarkElement.getAttribute('data-map-person-bookmarked') === 'true';
    const nextState = !isBookmarked;

    bookmarkElement.setAttribute('data-map-person-bookmarked', String(nextState));
    bookmarkElement.classList.toggle('is-active', nextState);
    const iconEl = bookmarkElement.querySelector('i');
    iconEl?.classList.toggle('fa-solid', nextState);
    iconEl?.classList.toggle('fa-regular', !nextState);

    try {
      const result = await window.appApi.setPersonBookmark({
        sourceRowId,
        isBookmarked: nextState
      });
      const persistedState = result?.isBookmarked === true;
      syncBookmarkedFlagAcrossKnownPeople(sourceRowId, persistedState);
      refreshPeopleListPanelsAfterBookmarkToggle();
      showBookmarkToggleToast(persistedState, sourceRowId);
    } catch (error) {
      bookmarkElement.setAttribute('data-map-person-bookmarked', String(isBookmarked));
      bookmarkElement.classList.toggle('is-active', isBookmarked);
      iconEl?.classList.toggle('fa-solid', isBookmarked);
      iconEl?.classList.toggle('fa-regular', !isBookmarked);
    }
  }

  function refreshPeopleListPanelsAfterBookmarkToggle() {
    if (infoPanelMode === 'search') {
      paintSearchPanel({ shouldFocusInput: false });
      return;
    }

    if (infoPanelMode === 'list') {
      paintListPanel();
      return;
    }

    if (infoPanelMode === 'bookmarked') {
      paintBookmarkedListPanel();
      return;
    }

    if (infoPanelMode === 'filter') {
      paintFilterPanel();
      return;
    }

    if (infoPanelMode === 'history') {
      paintHistorySelection();
    }
  }
}

function setMapSelectionBookmarkActive(isActive) {
  if (!selectionBookmarkButtonEl) {
    return;
  }

  const nextState = isActive === true;
  selectionBookmarkButtonEl.classList.toggle('is-active', nextState);
  selectionBookmarkButtonEl.setAttribute('aria-pressed', String(nextState));

  if (!selectionBookmarkIconEl) {
    return;
  }

  selectionBookmarkIconEl.classList.toggle('fa-regular', !nextState);
  selectionBookmarkIconEl.classList.toggle('fa-solid', nextState);
}

function showBookmarkToggleToast(isBookmarked, sourceRowId = '') {
  const normalizedSourceRowId = String(sourceRowId || '').trim();
  const person = normalizedSourceRowId
    ? allPeople.find((entry) => entry?.sourceRowId === normalizedSourceRowId)
      || findPersonBySourceRowId(normalizedSourceRowId)
      || knownPeopleBySourceRowId.get(normalizedSourceRowId)
    : null;
  const personSuffix = person ? ` ${getMapPersonDisplayName(person)}` : '';

  showMapToast({
    message: isBookmarked === true
      ? `Dodano do zakładek${personSuffix}`
      : `Usunięto z zakładek${personSuffix}`,
    type: 'info'
  });
}

function getMapPersonDisplayName(person) {
  return String(person?.fullName || person?.companyName || 'Osoba').trim() || 'Osoba';
}

function resolveSelectedPersonSourceRowId() {
  if (selectionPanelState.kind === 'person' && selectionPanelState.details?.person?.sourceRowId) {
    return String(selectionPanelState.details.person.sourceRowId);
  }

  if (selectionPanelState.kind === 'person-loading' && selectionPanelState.person?.sourceRowId) {
    return String(selectionPanelState.person.sourceRowId);
  }

  return '';
}

function resolveSelectedPersonForMapAction() {
  const sourceRowId = resolveSelectedPersonSourceRowId();
  if (!sourceRowId) {
    return null;
  }

  if (selectionPanelState.kind === 'person' && selectionPanelState.details?.person?.sourceRowId === sourceRowId) {
    return selectionPanelState.details.person;
  }

  if (selectionPanelState.kind === 'person-loading' && selectionPanelState.person?.sourceRowId === sourceRowId) {
    return selectionPanelState.person;
  }

  return allPeople.find((person) => person?.sourceRowId === sourceRowId)
    || findPersonBySourceRowId(sourceRowId)
    || knownPeopleBySourceRowId.get(sourceRowId)
    || null;
}

function syncSelectionBookmarkUiState() {
  if (!selectionActionsEl || !selectionFocusButtonEl || !selectionBookmarkButtonEl) {
    return;
  }

  const isSelectionPanelActive = infoPanelMode === 'selection';
  const isPersonMode = selectionPanelState.kind === 'person' || selectionPanelState.kind === 'person-loading';
  const shouldShowActions = isSelectionPanelActive && isPersonMode && !isSelectionOverlapChooserActive;

  selectionActionsEl.hidden = !shouldShowActions;
  selectionFocusButtonEl.disabled = !shouldShowActions || selectionPanelState.kind !== 'person';
  selectionBookmarkButtonEl.disabled = !shouldShowActions || selectionPanelState.kind !== 'person';

  if (!shouldShowActions) {
    setMapSelectionBookmarkActive(false);
    syncSelectionActionColor(null);
  }
}

function syncSelectionActionColor(person) {
  if (!selectionColorIndicatorEl) {
    return;
  }

  const normalizedSourceRowId = String(person?.sourceRowId || '').trim();
  const isVisibleOnMap = normalizedSourceRowId
    ? allPeople.some((entry) => entry.sourceRowId === normalizedSourceRowId)
    : false;
  const nextColor = normalizedSourceRowId && isVisibleOnMap
    ? resolveMapPersonRowSwatchColor(person, { isVisibleOnMap })
    : '#ffffff';
  const borderColor = nextColor === '#ffffff'
    ? 'rgba(48, 67, 54, 0.28)'
    : '';

  selectionColorIndicatorEl.style.setProperty('--map-selection-action-color', nextColor);
  selectionColorIndicatorEl.style.setProperty('--map-selection-action-color-border', borderColor);
}

function sanitizeMapPersonSwatchColor(colorValue) {
  const normalizedColor = normalizeHexColorInputValue(colorValue || DEFAULT_PERSON_MARKER_STYLE.fillColor || '#4db06f');
  const excludedColors = new Set([
    normalizeHexColorInputValue(ACTIVE_PERSON_MARKER_STYLE.fillColor || '#bb86fc'),
    normalizeHexColorInputValue(ACTIVE_PERSON_MARKER_STYLE.color || '#6e3cbc'),
    '#845ec2'
  ]);

  if (excludedColors.has(normalizedColor)) {
    return normalizeHexColorInputValue(DEFAULT_PERSON_MARKER_STYLE.fillColor || '#4db06f');
  }

  return normalizedColor;
}

function syncBookmarkedFlagAcrossKnownPeople(sourceRowId, isBookmarked) {
  const normalizedSourceRowId = String(sourceRowId || '').trim();
  if (!normalizedSourceRowId) {
    return;
  }

  allPeople = allPeople.map((person) => {
    if (person?.sourceRowId !== normalizedSourceRowId) {
      return person;
    }

    return {
      ...person,
      isBookmarked
    };
  });

  const knownPerson = knownPeopleBySourceRowId.get(normalizedSourceRowId);
  if (knownPerson) {
    knownPeopleBySourceRowId.set(normalizedSourceRowId, {
      ...knownPerson,
      isBookmarked
    });
  }

  personSearchState = {
    ...personSearchState,
    results: personSearchState.results.map((person) => {
      if (person?.sourceRowId !== normalizedSourceRowId) {
        return person;
      }

      return {
        ...person,
        isBookmarked
      };
    })
  };

  personListState = {
    ...personListState,
    results: personListState.results.map((person) => {
      if (person?.sourceRowId !== normalizedSourceRowId) {
        return person;
      }

      return {
        ...person,
        isBookmarked
      };
    })
  };

  if (selectionPanelState.kind === 'person' && selectionPanelState.details?.person?.sourceRowId === normalizedSourceRowId) {
    selectionPanelState.details.person.isBookmarked = isBookmarked;
  }

  if (selectionPanelState.kind === 'person-loading' && selectionPanelState.person?.sourceRowId === normalizedSourceRowId) {
    selectionPanelState.person.isBookmarked = isBookmarked;
  }

  syncBookmarkedPersonListStateFromVisiblePeople();

  if (infoPanelMode === 'bookmarked' && bookmarkedPersonListState.hasLoaded) {
    paintBookmarkedListPanel();
  }
}

selectionFocusButtonEl?.addEventListener('click', () => {
  const person = resolveSelectedPersonForMapAction();
  if (!person) {
    return;
  }

  focusSelectionOnMap(person, { animate: true });
});

selectionBookmarkButtonEl?.addEventListener('click', async () => {
  const sourceRowId = resolveSelectedPersonSourceRowId();
  if (!sourceRowId || !window.appApi?.setPersonBookmark) {
    return;
  }

  const currentActive = selectionBookmarkButtonEl.classList.contains('is-active');
  const nextState = !currentActive;
  setMapSelectionBookmarkActive(nextState);
  selectionBookmarkButtonEl.disabled = true;

  try {
    const result = await window.appApi.setPersonBookmark({
      sourceRowId,
      isBookmarked: nextState
    });
    const persistedState = result?.isBookmarked === true;
    setMapSelectionBookmarkActive(persistedState);
    syncBookmarkedFlagAcrossKnownPeople(sourceRowId, persistedState);
    showBookmarkToggleToast(persistedState, sourceRowId);

    if (selectionPanelState.kind === 'person' && selectionPanelState.details?.person?.sourceRowId === sourceRowId) {
      selectionPanelState.details.person.isBookmarked = persistedState;
    }

    if (selectionPanelState.kind === 'person-loading' && selectionPanelState.person?.sourceRowId === sourceRowId) {
      selectionPanelState.person.isBookmarked = persistedState;
    }
  } catch (error) {
    setMapSelectionBookmarkActive(currentActive);
  }

  syncSelectionBookmarkUiState();
});

setMapSelectionBookmarkActive(false);
syncSelectionBookmarkUiState();

selectionExtraEl?.addEventListener('click', handleSelectionPanelClick);
selectionMetaEl?.addEventListener('click', handleSelectionPanelClick);

selectionExtraEl?.addEventListener('scroll', () => {
  syncOpenMapTimeColorMenusDirection();
}, { passive: true });

selectionExtraEl?.addEventListener('dblclick', (event) => {
  if (infoPanelMode !== 'colors') {
    return;
  }

  const titleGroup = event.target.closest('[data-map-time-color-title-group]');
  if (!titleGroup) {
    return;
  }

  const rangeId = titleGroup.getAttribute('data-map-time-color-title-group');
  if (!rangeId) {
    return;
  }

  focusMapTimeColorLabelInput(rangeId, { selectAll: true });
});

selectionExtraEl?.addEventListener('input', (event) => {
  const searchField = event.target.closest('[data-map-person-search-input]');
  if (!searchField || infoPanelMode !== 'search') {
    const customTimeColorInput = event.target.closest('.time-color-menu-custom-input');
    if (customTimeColorInput && infoPanelMode === 'colors') {
      stageMapTimeColorMenuPendingColor(
        customTimeColorInput.closest('.time-color-menu'),
        customTimeColorInput.value
      );
      return;
    }

    const previewField = event.target.closest('[data-map-time-color-preview-field]');
    if (previewField && infoPanelMode === 'colors') {
      const previewFieldValue = previewField instanceof HTMLInputElement && previewField.type === 'checkbox'
        ? String(previewField.checked)
        : previewField.value;
      updateMapTimeColorRangeFromPreviewField(
        previewField.getAttribute('data-map-time-color-preview-range-id'),
        previewField.getAttribute('data-map-time-color-preview-field'),
        previewFieldValue
      );
      return;
    }

    const timeColorField = event.target.closest('[data-map-time-color-form] input, [data-map-time-color-form] textarea');
    if (!timeColorField || infoPanelMode !== 'colors') {
      return;
    }

    const timeColorForm = timeColorField.closest('[data-map-time-color-form]');
    if (!timeColorForm) {
      return;
    }

    const timeColorRow = timeColorField.closest('[data-map-time-color-row-id]');
    const timeColorFieldName = timeColorField.getAttribute('data-map-time-color-field');
    if (timeColorRow && timeColorFieldName) {
      syncMapTimeColorMiddleRowFields(timeColorRow, { changedFieldName: timeColorFieldName });
    }

    mapTimeColorRanges = readMapTimeColorRangesFromForm(timeColorForm);
    persistMapTimeColorRanges();
    syncTimeColorPreview();
    return;
  }

  updatePersonSearchQuery(searchField.value);
});

selectionExtraEl?.addEventListener('change', (event) => {
  const customTimeColorInput = event.target.closest('.time-color-menu-custom-input');
  if (customTimeColorInput && infoPanelMode === 'colors') {
    stageMapTimeColorMenuPendingColor(
      customTimeColorInput.closest('.time-color-menu'),
      customTimeColorInput.value
    );
    return;
  }

  const previewField = event.target.closest('[data-map-time-color-preview-field]');
  if (previewField && infoPanelMode === 'colors') {
    const previewFieldValue = previewField instanceof HTMLInputElement && previewField.type === 'checkbox'
      ? String(previewField.checked)
      : previewField.value;
    updateMapTimeColorRangeFromPreviewField(
      previewField.getAttribute('data-map-time-color-preview-range-id'),
      previewField.getAttribute('data-map-time-color-preview-field'),
      previewFieldValue
    );
    previewField.closest('.time-color-menu')?.removeAttribute('open');
    return;
  }

  const timeColorDateMatchModeField = event.target.closest('[data-map-time-color-date-match-mode]');
  if (timeColorDateMatchModeField && infoPanelMode === 'colors') {
    mapTimeColorDateMatchMode = normalizeMapTimeColorDateMatchMode(timeColorDateMatchModeField.value);
    paintTimeColorPanel();
    persistMapTimeColorDateMatchModeAsync();
    return;
  }

  const timeColorField = event.target.closest('[data-map-time-color-form] input, [data-map-time-color-form] select');
  if (timeColorField && infoPanelMode === 'colors') {
    const timeColorForm = timeColorField.closest('[data-map-time-color-form]');
    if (!timeColorForm) {
      return;
    }

    const timeColorRow = timeColorField.closest('[data-map-time-color-row-id]');
    const timeColorFieldName = timeColorField.getAttribute('data-map-time-color-field');
    if (timeColorRow && timeColorFieldName) {
      syncMapTimeColorMiddleRowFields(timeColorRow, { changedFieldName: timeColorFieldName });
    }

    mapTimeColorRanges = readMapTimeColorRangesFromForm(timeColorForm);
    persistMapTimeColorRanges();

    if (
      timeColorFieldName === 'enabled'
      || timeColorFieldName === 'label'
      || timeColorFieldName === 'mode'
      || timeColorFieldName === 'dateFromYear'
      || timeColorFieldName === 'dateFromMonth'
      || timeColorFieldName === 'dateToYear'
      || timeColorFieldName === 'dateToMonth'
    ) {
      paintTimeColorPanel();
    } else {
      syncTimeColorPreview();
    }
    if (timeColorFieldName === 'color') {
      timeColorField.closest('.time-color-menu')?.removeAttribute('open');
    }
    return;
  }

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
    toYear: formData.get('toYear'),
    pumpType: formData.get('pumpType'),
    visitType: formData.get('visitType'),
    region: formData.get('region'),
    postalCode: formData.get('postalCode'),
    producer: formData.get('producer'),
    installerCompany: formData.get('installerCompany')
  });
  mapDateFilterHasInvalidRange = hasInvalidMapDateRangeDraft(mapDateFilterDraft);
  persistMapDateFilterState();
  paintFilterPanel();
  scheduleMapDateFilterApply();
});

selectionExtraEl?.addEventListener('pointerdown', (event) => {
  const legendValueBox = event.target.closest('.legend-value-box');
  if (legendValueBox && infoPanelMode === 'colors') {
    const input = legendValueBox.querySelector('.legend-value-input');
    if (input) {
      event.preventDefault();
      input.focus();
      const valueLength = typeof input.value === 'string' ? input.value.length : 0;
      input.setSelectionRange?.(valueLength, valueLength);
    }
    return;
  }

  const dragHandle = event.target.closest('[data-map-time-color-chart-handle]');
  const dragBar = event.target.closest('[data-map-time-color-chart-bar-drag]');
  const dragTarget = dragHandle || dragBar;
  if (!dragTarget || infoPanelMode !== 'colors') {
    return;
  }

  const rangeId = dragTarget.getAttribute('data-map-time-color-range-id');
  if (!rangeId) {
    return;
  }

  const range = mapTimeColorRanges.find((entry) => entry.id === rangeId);
  if (!range || range.mode !== 'days') {
    return;
  }

  const trackElement = dragTarget.closest('[data-map-time-color-chart-track]');
  const chartElement = dragTarget.closest('[data-map-time-color-chart]');
  if (!trackElement || !chartElement) {
    return;
  }

  const trackRect = trackElement.getBoundingClientRect();
  const oldestVisibleDays = Number(chartElement.dataset.oldestVisibleDays);
  const newestVisibleDays = Number(chartElement.dataset.newestVisibleDays);
  const chartMaxDays = Number(chartElement.dataset.chartMaxDays);
  const newestRangeDays = Number(chartElement.dataset.newestRangeDays);
  if (!Number.isFinite(trackRect.width) || trackRect.width <= 0 || !Number.isFinite(oldestVisibleDays) || !Number.isFinite(newestVisibleDays)) {
    return;
  }

  const dragMode = dragHandle
    ? dragHandle.getAttribute('data-map-time-color-chart-handle')
    : 'range';
  if (dragMode === 'range' && dragTarget.getAttribute('data-map-time-color-chart-bar-drag') !== 'true') {
    return;
  }
  const initialDaysFrom = normalizeNonNegativeIntegerInputValue(range.daysFrom);
  const initialDaysTo = normalizeNonNegativeIntegerInputValue(range.daysTo);
  if (dragMode === 'range' && (!initialDaysFrom || !initialDaysTo)) {
    return;
  }

  event.preventDefault();
  timeColorChartViewportOverride = null;
  timeColorChartDragState = {
    pointerId: event.pointerId,
    rangeId,
    dragMode,
    startClientX: event.clientX,
    virtualClientX: event.clientX,
    trackLeft: trackRect.left,
    trackWidth: trackRect.width,
    chartMaxDays: Number.isFinite(chartMaxDays) ? chartMaxDays : null,
    newestRangeDays: Number.isFinite(newestRangeDays) ? newestRangeDays : 0,
    oldestVisibleDays,
    newestVisibleDays,
    initialDaysFrom: initialDaysFrom === '' ? null : Number(initialDaysFrom),
    initialDaysTo: initialDaysTo === '' ? null : Number(initialDaysTo),
    edgeExpandDirection: '',
    edgeExpandStartedAt: 0,
    pointerLockActive: false
  };

  dragTarget.setPointerCapture?.(event.pointerId);
  if (event.pointerType === 'mouse' && selectionExtraEl?.requestPointerLock) {
    const lockResult = selectionExtraEl.requestPointerLock();
    if (lockResult && typeof lockResult.catch === 'function') {
      lockResult.catch(() => {});
    }
  }
});

window.addEventListener('pointermove', (event) => {
  if (!timeColorChartDragState || event.pointerId !== timeColorChartDragState.pointerId) {
    return;
  }

  if (timeColorChartDragState.pointerLockActive) {
    return;
  }

  const clientX = getTimeColorChartDragClientX(event);
  syncTimeColorChartDragAtClientX(clientX);
});

window.addEventListener('mousemove', (event) => {
  if (!timeColorChartDragState || !timeColorChartDragState.pointerLockActive) {
    return;
  }

  const clientX = getTimeColorChartDragClientX(event);
  syncTimeColorChartDragAtClientX(clientX);
});

window.addEventListener('pointerup', (event) => {
  if (!timeColorChartDragState || event.pointerId !== timeColorChartDragState.pointerId) {
    return;
  }

  endTimeColorChartDragState({ commit: true });
});

window.addEventListener('pointercancel', (event) => {
  if (!timeColorChartDragState || event.pointerId !== timeColorChartDragState.pointerId) {
    return;
  }

  endTimeColorChartDragState();
});

window.addEventListener('mouseup', () => {
  if (!timeColorChartDragState || !timeColorChartDragState.pointerLockActive) {
    return;
  }

  endTimeColorChartDragState({ commit: true });
});

document.addEventListener('pointerlockchange', () => {
  if (!timeColorChartDragState) {
    return;
  }

  timeColorChartDragState.pointerLockActive = document.pointerLockElement === selectionExtraEl;
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
    const timeColorForm = event.target.closest('[data-map-time-color-form]');
    if (!timeColorForm || infoPanelMode !== 'colors') {
      return;
    }

    event.preventDefault();
    mapTimeColorRanges = readMapTimeColorRangesFromForm(timeColorForm);
    persistMapTimeColorRanges();
    syncTimeColorPreview();
    return;
  }

  event.preventDefault();
  const formData = new FormData(filterForm);
  mapDateFilterDraft = normalizeMapDateFilterDraft({
    fromMonth: formData.get('fromMonth'),
    fromYear: formData.get('fromYear'),
    toMonth: formData.get('toMonth'),
    toYear: formData.get('toYear'),
    pumpType: formData.get('pumpType'),
    visitType: formData.get('visitType'),
    region: formData.get('region'),
    postalCode: formData.get('postalCode'),
    producer: formData.get('producer'),
    installerCompany: formData.get('installerCompany')
  });
  mapDateFilterHasInvalidRange = hasInvalidMapDateRangeDraft(mapDateFilterDraft);
  persistMapDateFilterState();
  scheduleMapDateFilterApply({ immediate: true });
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
      await loadMapFilterOptions();
    }
    await loadPoints();
  }
});

window.appApi.onTileDownloadState((payload) => {
  syncTileLayerRevision(payload?.packageState);
});

syncSettingsPanelVisibility();
renderCurrentInfoPanel();
bootstrap();

async function bootstrap() {
  const [bootstrapData] = await Promise.all([
    window.appApi.getBootstrap(),
    loadMapDateFilterOptions(),
    loadMapFilterOptions(),
    hydratePersonSelectionHistory()
  ]);
  renderOverviewSummary(bootstrapData.summary);
  syncTileLayerRevision(bootstrapData.summary?.offlineTiles?.packageState);
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

function buildTileUrlTemplate(revision = activeTilePackageRevision) {
  return `${TILE_URL_TEMPLATE}?rev=${encodeURIComponent(String(revision || 1))}`;
}

function syncTileLayerRevision(packageState = {}) {
  const nextRevision = Math.max(1, Number(packageState?.activeRevision || 1));
  if (nextRevision === activeTilePackageRevision) {
    return;
  }

  activeTilePackageRevision = nextRevision;
  tileLayer?.setUrl(buildTileUrlTemplate(activeTilePackageRevision), false);
  tileLayer?.redraw();
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
  tileLayer = L.tileLayer(buildTileUrlTemplate(), {
    keepBuffer: 3,
    minZoom: 2,
    maxZoom: 18,
    updateWhenIdle: false,
    crossOrigin: false
  }).addTo(mapInstance);
  L.control.scale({
    position: 'bottomleft',
    metric: true,
    imperial: false,
    maxWidth: 160
  }).addTo(mapInstance);

  applyInitialMapViewport();
  updateMapDevHud();
  peopleLayer = L.layerGroup().addTo(mapInstance);
  supplementalPeopleLayer = L.layerGroup().addTo(mapInstance);
  customLayer = L.layerGroup().addTo(mapInstance);
  mapInstance.on('moveend zoomend', () => {
    persistMapViewportState();
    scheduleVisibleMarkerSync();
    updateMapDevHud();
    void queueViewportTilePrefetch();
  });
  mapInstance.on('mousemove', (event) => {
    scheduleHoverTilePrefetch(event?.latlng);
  });
  mapInstance.on('mouseout', () => {
    clearScheduledHoverTilePrefetch();
  });

  requestAnimationFrame(() => {
    mapInstance.invalidateSize();
  });
  void queueViewportTilePrefetch();
}

function updateMapDevHud() {
  if (!isDevMode || !mapDevHudEl) {
    return;
  }

  if (!mapInstance) {
    mapDevHudEl.hidden = true;
    return;
  }

  mapDevHudEl.hidden = false;
  mapDevHudEl.textContent = `Zoom z${Number(mapInstance.getZoom() || 0).toFixed(2)}`;
}

function clearScheduledHoverTilePrefetch() {
  if (!hoverTilePrefetchTimer) {
    return;
  }

  window.clearTimeout(hoverTilePrefetchTimer);
  hoverTilePrefetchTimer = 0;
}

function scheduleHoverTilePrefetch(latlng) {
  if (!mapInstance || !latlng) {
    return;
  }

  clearScheduledHoverTilePrefetch();
  hoverTilePrefetchTimer = window.setTimeout(() => {
    hoverTilePrefetchTimer = 0;
    void queueHoverTilePrefetch(latlng);
  }, MAP_HOVER_PREFETCH_DEBOUNCE_MS);
}

async function queueViewportTilePrefetch() {
  if (!mapInstance || !window.appApi?.queueViewportTilePrefetch) {
    return;
  }

  const bounds = mapInstance.getBounds();
  if (!bounds) {
    return;
  }

  try {
    await window.appApi.queueViewportTilePrefetch({
      currentZoom: mapInstance.getZoom(),
      bounds: {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast()
      }
    });
  } catch (_error) {
    // Ignore background prefetch errors in renderer; interactive tile loading still works.
  }
}

async function queueHoverTilePrefetch(latlng) {
  if (!mapInstance || !window.appApi?.queueHoverTilePrefetch || !latlng) {
    return;
  }

  const hoverKey = `${latlng.lat.toFixed(4)},${latlng.lng.toFixed(4)},${Math.round(mapInstance.getZoom())}`;
  if (hoverKey === lastQueuedHoverTilePrefetchKey) {
    return;
  }
  lastQueuedHoverTilePrefetchKey = hoverKey;

  try {
    await window.appApi.queueHoverTilePrefetch({
      lat: latlng.lat,
      lng: latlng.lng,
      currentZoom: mapInstance.getZoom()
    });
  } catch (_error) {
    // Ignore background prefetch errors in renderer; interactive tile loading still works.
  }
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

async function loadPoints(options = {}) {
  if (!mapInstance) {
    return;
  }

  const requestToken = ++mapPointsRequestToken;
  const triggeredBySearchQuery = options.reason === 'person-search';
  const triggeredByMapFilter = options.reason === 'map-filter';
  const autoFitToPeople = options.autoFitToPeople === true;
  const shouldRefreshSearchResults = options.refreshSearchResults !== false;
  isMapPointsLoading = true;
  syncMapLoadingIndicator();
  if (infoPanelMode === 'filter') {
    paintFilterPanel();
  }

  const preserveViewport = shouldRestoreMapViewportOnNextLoad;
  clearHoveredPersonSourceRowId();
  let payload;

  try {
    payload = await window.appApi.getMapPoints(buildMapPointsRequest());
  } catch (error) {
    if (requestToken === mapPointsRequestToken) {
      isMapPointsLoading = false;
      syncMapLoadingIndicator();
      if (infoPanelMode === 'filter') {
        paintFilterPanel();
      }
    }
    throw error;
  }

  if (requestToken !== mapPointsRequestToken) {
    return;
  }

  isMapPointsLoading = false;
  syncMapLoadingIndicator();
  const shouldAutoSelectPerson = infoPanelMode !== 'filter' && !triggeredBySearchQuery && !triggeredByMapFilter;

  allPeople = payload.people || [];
  allCustomPoints = payload.customPoints || [];
  mapDateFilterRenderedCount = 0;
  mapDateFilterRowHeight = MAP_DATE_FILTER_ESTIMATED_ROW_HEIGHT_PX;
  mapListRowHeight = MAP_PERSON_LIST_ESTIMATED_ROW_HEIGHT_PX;
  mapBookmarkedListRowHeight = MAP_PERSON_LIST_ESTIMATED_ROW_HEIGHT_PX;
  cacheKnownPeople(allPeople);
  syncPersonListStateFromVisiblePeople();
  syncBookmarkedPersonListStateFromVisiblePeople();
  const activeSelectedPersonSourceRowId = activeSelection?.type === 'person' && activeSelection.key
    ? activeSelection.key.replace(/^person:/, '')
    : null;
  const preservedSearchSelection = triggeredBySearchQuery && activeSelectedPersonSourceRowId
    ? allPeople.find((person) => person.sourceRowId === activeSelectedPersonSourceRowId) || null
    : null;
  const nextPerson = shouldAutoSelectPerson
    ? hasActiveMapDateFilter() || hasActiveMapAttributeFilters() || hasActiveMapPersonSearchFilter()
      ? resolveVisiblePersonSelection(allPeople)
      : resolveCurrentPersonSelection(allPeople)
    : preservedSearchSelection;
  const lastSelectedRestoreState = readLastSelectedPersonRestoreState();

  clearActiveSelection({ resetPanel: shouldAutoSelectPerson ? !nextPerson : false });

  if (nextPerson) {
    const shouldPreferPersonDetails = Boolean(
      lastSelectedRestoreState
      && lastSelectedRestoreState.sourceRowId === String(nextPerson.sourceRowId)
      && lastSelectedRestoreState.preferPersonDetails
    );
    if (!preserveViewport) {
      focusSelectionOnMap(nextPerson);
    }
    void selectPersonPoint(nextPerson, null, {
      historyMode: 'restore',
      bypassOverlapSelection: shouldPreferPersonDetails
    });
  }

  if (infoPanelMode === 'history') {
    paintHistorySelection();
  }

  if (infoPanelMode === 'filter') {
    paintFilterPanel();
  }

  if (infoPanelMode === 'search' && personSearchState.hasLoaded) {
    if (shouldRefreshSearchResults) {
      personSearchRequestToken += 1;
      void loadPersonSearchResults(personSearchState.query, {
        showLoadingState: false,
        reset: true,
        requestToken: personSearchRequestToken
      });
    } else {
      paintSearchPanel({ shouldFocusInput: false });
    }
  }

  if (infoPanelMode === 'list' && personListState.hasLoaded) {
    paintListPanel();
  }

  if (infoPanelMode === 'bookmarked' && bookmarkedPersonListState.hasLoaded) {
    paintBookmarkedListPanel();
  }

  shouldRestoreMapViewportOnNextLoad = false;
  syncSupplementalPeopleMarkers();
  scheduleVisibleMarkerSync(0);

  if (autoFitToPeople) {
    fitMapViewportToPeople(allPeople);
  }
}

function syncMapLoadingIndicator() {
  if (!mapLoadingIndicatorEl) {
    return;
  }

  mapLoadingIndicatorEl.hidden = !(isMapPointsLoading || mapPopupLoadingOperations > 0);
}

function buildMapPointsRequest() {
  const payload = {
    includeUnresolved: false
  };

  if (hasActiveMapAttributeFilters()) {
    payload.pumpType = mapDateFilter.pumpType || undefined;
    payload.visitType = mapDateFilter.visitType || undefined;
    payload.region = mapDateFilter.region || undefined;
    payload.postalCode = mapDateFilter.postalCode || undefined;
    payload.producer = mapDateFilter.producer || undefined;
    payload.installerCompany = mapDateFilter.installerCompany || undefined;
  }

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

function scheduleMapDateFilterApply(options = {}) {
  const immediate = options.immediate === true;

  if (mapDateFilterApplyTimer) {
    window.clearTimeout(mapDateFilterApplyTimer);
    mapDateFilterApplyTimer = null;
  }

  const requestToken = ++mapDateFilterApplyRequestToken;
  const delay = immediate ? 0 : MAP_DATE_FILTER_APPLY_DEBOUNCE_MS;

  mapDateFilterApplyTimer = window.setTimeout(() => {
    mapDateFilterApplyTimer = null;
    if (requestToken !== mapDateFilterApplyRequestToken) {
      return;
    }

    void applyMapDateFilter({
      ...mapDateFilterDraft
    }, {
      requestToken
    });
  }, delay);
}

function hasActiveMapDateFilter() {
  return Boolean(mapDateFilter.dateFrom || mapDateFilter.dateTo);
}

function hasActiveMapAttributeFilters() {
  return Boolean(
    mapDateFilter.pumpType
    || mapDateFilter.visitType
    || mapDateFilter.region
    || mapDateFilter.postalCode
    || mapDateFilter.producer
    || mapDateFilter.installerCompany
  );
}

function getActiveMapPersonSearchQuery() {
  return String(personSearchState.query || '').trim();
}

function hasActiveMapPersonSearchFilter() {
  return Boolean(getActiveMapPersonSearchQuery());
}

function hasMapDateFilterDraftChanges(input = mapDateFilterDraft) {
  const draft = normalizeMapDateFilterDraft(input);
  const defaultDraft = buildDefaultMapDateFilterDraft();

  return (
    draft.fromMonth !== defaultDraft.fromMonth
    || draft.fromYear !== defaultDraft.fromYear
    || draft.toMonth !== defaultDraft.toMonth
    || draft.toYear !== defaultDraft.toYear
    || draft.pumpType !== defaultDraft.pumpType
    || draft.visitType !== defaultDraft.visitType
    || draft.region !== defaultDraft.region
    || draft.postalCode !== defaultDraft.postalCode
    || draft.producer !== defaultDraft.producer
    || draft.installerCompany !== defaultDraft.installerCompany
  );
}

async function applyMapDateFilter(nextFilter, options = {}) {
  const requestToken = Number(options.requestToken || 0);
  if (requestToken && requestToken !== mapDateFilterApplyRequestToken) {
    return;
  }

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
    normalizedFilter.dateFrom !== mapDateFilter.dateFrom
    || normalizedFilter.dateTo !== mapDateFilter.dateTo
    || normalizedFilter.pumpType !== mapDateFilter.pumpType
    || normalizedFilter.visitType !== mapDateFilter.visitType
    || normalizedFilter.region !== mapDateFilter.region
    || normalizedFilter.postalCode !== mapDateFilter.postalCode
    || normalizedFilter.producer !== mapDateFilter.producer
    || normalizedFilter.installerCompany !== mapDateFilter.installerCompany;

  mapDateFilter = normalizedFilter;
  syncInfoToolButtons();
  if (infoPanelMode === 'filter') {
    paintFilterPanel();
  }

  if (!didChange) {
    return;
  }

  await loadPoints({
    reason: 'map-filter',
    autoFitToPeople: false
  });
}

function fitMapViewportToPeople(people = []) {
  if (!mapInstance || !Array.isArray(people)) {
    return;
  }

  const points = people.filter((person) => Number.isFinite(person?.lat) && Number.isFinite(person?.lng));
  if (points.length === 0) {
    return;
  }

  if (points.length === 1) {
    const singlePoint = points[0];
    mapInstance.setView([singlePoint.lat, singlePoint.lng], Math.max(12, mapInstance.getZoom()), {
      animate: true
    });
    return;
  }

  const bounds = L.latLngBounds(points.map((person) => [person.lat, person.lng]));
  mapInstance.fitBounds(bounds, {
    padding: [32, 32],
    maxZoom: 13
  });
}

function normalizeMapDateFilter(input = {}) {
  let dateFrom = '';
  let dateTo = '';
  const pumpType = normalizeMapFilterOptionInputValue(input?.pumpType);
  const visitType = normalizeMapFilterOptionInputValue(input?.visitType);
  const region = normalizeMapFilterOptionInputValue(input?.region);
  const postalCode = normalizeMapFilterOptionInputValue(input?.postalCode);
  const producer = normalizeMapFilterOptionInputValue(input?.producer);
  const installerCompany = normalizeMapFilterOptionInputValue(input?.installerCompany);
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
    dateTo,
    pumpType,
    visitType,
    region,
    postalCode,
    producer,
    installerCompany
  };
}

function normalizeMapFilterOptionInputValue(value) {
  return String(value || '').trim();
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

function createDefaultMapTimeColorRanges() {
  return normalizeMapTimeColorRanges(
    [0, 1, 2, 3, 4].map((index) => buildDefaultMapTimeColorRange(index)),
    { allowEmpty: true }
  );
}

function formatRomanNumeral(numberValue) {
  const normalizedNumber = Math.trunc(Number(numberValue));
  if (!Number.isFinite(normalizedNumber) || normalizedNumber <= 0) {
    return 'I';
  }

  const numerals = [
    ['M', 1000],
    ['CM', 900],
    ['D', 500],
    ['CD', 400],
    ['C', 100],
    ['XC', 90],
    ['L', 50],
    ['XL', 40],
    ['X', 10],
    ['IX', 9],
    ['V', 5],
    ['IV', 4],
    ['I', 1]
  ];

  let remainingValue = normalizedNumber;
  let result = '';
  for (const [symbol, value] of numerals) {
    while (remainingValue >= value) {
      result += symbol;
      remainingValue -= value;
    }
  }

  return result || 'I';
}

function parseRomanNumeral(value) {
  const normalizedValue = String(value || '').trim().toUpperCase();
  if (!normalizedValue || !/^[IVXLCDM]+$/.test(normalizedValue)) {
    return null;
  }

  const values = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000
  };

  let total = 0;
  let previousValue = 0;
  for (let index = normalizedValue.length - 1; index >= 0; index -= 1) {
    const currentValue = values[normalizedValue[index]];
    if (!currentValue) {
      return null;
    }

    if (currentValue < previousValue) {
      total -= currentValue;
    } else {
      total += currentValue;
      previousValue = currentValue;
    }
  }

  return total > 0 ? total : null;
}

function formatMapTimeColorRangeOrdinalLabel(numberValue) {
  const normalizedNumber = Number(numberValue);
  if (!Number.isFinite(normalizedNumber) || normalizedNumber <= 0) {
    return 'Zakres I';
  }

  return `Zakres ${formatRomanNumeral(normalizedNumber)}`;
}

function extractMapTimeColorRangeLabelNumber(labelValue) {
  const normalizedLabel = String(labelValue || '').trim();
  if (!normalizedLabel) {
    return null;
  }

  const leadingMatch = normalizedLabel.match(/^(\d+)\s+zakres$/i);
  if (leadingMatch) {
    return Number(leadingMatch[1]);
  }

  const trailingMatch = normalizedLabel.match(/^zakres\s+(\d+)$/i);
  if (trailingMatch) {
    return Number(trailingMatch[1]);
  }

  const leadingRomanMatch = normalizedLabel.match(/^([IVXLCDM]+)\s+zakres$/i);
  if (leadingRomanMatch) {
    return parseRomanNumeral(leadingRomanMatch[1]);
  }

  const trailingRomanMatch = normalizedLabel.match(/^zakres\s+([IVXLCDM]+)$/i);
  if (trailingRomanMatch) {
    return parseRomanNumeral(trailingRomanMatch[1]);
  }

  return null;
}

function getNextMapTimeColorRangeLabel(ranges = mapTimeColorRanges, fallbackIndex = 0) {
  const highestNumber = normalizeMapTimeColorRanges(ranges, { allowEmpty: true })
    .filter((range) => !isMapTimeColorSpecialMatcherRange(range))
    .map((range) => extractMapTimeColorRangeLabelNumber(range.label))
    .filter(Number.isFinite)
    .reduce((maxValue, currentValue) => Math.max(maxValue, currentValue), 0);

  if (highestNumber > 0) {
    return formatMapTimeColorRangeOrdinalLabel(highestNumber + 1);
  }

  return formatMapTimeColorRangeOrdinalLabel(1);
}

function getMapTimeColorSpecialRangeDefaultLabel(matcher) {
  const normalizedMatcher = normalizeMapTimeColorMatcher(matcher);
  if (normalizedMatcher === 'missingDate') {
    return 'Brak daty wpłaty oraz daty wizyty';
  }

  if (normalizedMatcher === 'unmatchedWithDate') {
    return 'Poza pozostałymi regułami';
  }

  return '';
}

function isMapTimeColorProtectedRange(range) {
  return isMapTimeColorMissingDateRange(range) || isMapTimeColorUnmatchedWithDateRange(range);
}

function buildDefaultMapTimeColorRange(index = 0, options = {}) {
  const presets = [
    {
      label: getMapTimeColorSpecialRangeDefaultLabel('missingDate'),
      color: '#d97ab1',
      matcher: 'missingDate',
      mode: 'days',
      dateField: 'lastPaymentAt',
      daysFrom: '',
      daysTo: '',
      dateFromMonthDraft: '',
      dateToMonthDraft: '',
      dateFrom: '',
      dateTo: ''
    },
    {
      label: getMapTimeColorSpecialRangeDefaultLabel('unmatchedWithDate'),
      color: '#4d97d1',
      matcher: 'unmatchedWithDate',
      mode: 'days',
      dateField: 'lastPaymentAt',
      daysFrom: '',
      daysTo: '',
      dateFromMonthDraft: '',
      dateToMonthDraft: '',
      dateFrom: '',
      dateTo: ''
    },
    {
      label: formatMapTimeColorRangeOrdinalLabel(1),
      color: '#4db06f',
      mode: 'days',
      dateField: 'lastPaymentAt',
      daysFrom: '',
      daysTo: '100',
      dateFromMonthDraft: '',
      dateToMonthDraft: '',
      dateFrom: '',
      dateTo: ''
    },
    {
      label: formatMapTimeColorRangeOrdinalLabel(2),
      color: '#e3b341',
      mode: 'days',
      dateField: 'lastPaymentAt',
      daysFrom: '100',
      daysTo: '400',
      dateFromMonthDraft: '',
      dateToMonthDraft: '',
      dateFrom: '',
      dateTo: ''
    },
    {
      label: formatMapTimeColorRangeOrdinalLabel(3),
      color: '#d65f4a',
      mode: 'days',
      dateField: 'lastPaymentAt',
      daysFrom: '401',
      daysTo: '',
      dateFromMonthDraft: '',
      dateToMonthDraft: '',
      dateFrom: '',
      dateTo: ''
    },
    {
      label: formatMapTimeColorRangeOrdinalLabel(4),
      color: '#1f1f1f',
      mode: 'days',
      dateField: 'lastPaymentAt',
      daysFrom: '300',
      daysTo: '',
      dateFromMonthDraft: '',
      dateToMonthDraft: '',
      dateFrom: '',
      dateTo: ''
    },
    {
      label: getNextMapTimeColorRangeLabel([], index),
      color: ['#845ec2', '#1b9c85', '#c06c84', '#4d97d1'][Math.max(index - 6, 0) % 4],
      mode: 'days',
      dateField: 'lastPaymentAt',
      daysFrom: '',
      daysTo: '',
      dateFromMonthDraft: '',
      dateToMonthDraft: '',
      dateFrom: '',
      dateTo: ''
    }
  ];

  return normalizeMapTimeColorRange({
    id: `range-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    ...(presets[index] || presets[presets.length - 1]),
    ...(typeof options?.label === 'string' && options.label.trim()
      ? { label: options.label.trim() }
      : {})
  }, index);
}

function normalizeMapTimeColorRanges(input, options = {}) {
  const allowEmpty = Boolean(options?.allowEmpty);
  if (!Array.isArray(input)) {
    return allowEmpty ? [] : createDefaultMapTimeColorRanges();
  }

  const normalizedRanges = orderMapTimeColorRangesForEditor(
    reindexMapTimeColorRangeOrdinalLabels(input
      .map((entry, index) => normalizeMapTimeColorRange(entry, index))
      .filter(Boolean))
  );

  if (normalizedRanges.length === 0 && !allowEmpty) {
    return createDefaultMapTimeColorRanges();
  }

  return normalizedRanges;
}

function orderMapTimeColorRangesForEditor(ranges = []) {
  const regularRanges = [];
  const specialRanges = [];

  ranges.forEach((range) => {
    if (!range) {
      return;
    }

    if (isMapTimeColorSpecialMatcherRange(range)) {
      specialRanges.push(range);
      return;
    }

    regularRanges.push(range);
  });

  return [...regularRanges, ...specialRanges];
}

function insertMapTimeColorRangeBeforeSpecialRanges(ranges = [], nextRange) {
  if (!nextRange) {
    return normalizeMapTimeColorRanges(ranges, { allowEmpty: true });
  }

  const orderedRanges = orderMapTimeColorRangesForEditor(
    normalizeMapTimeColorRanges(ranges, { allowEmpty: true })
  );
  const firstSpecialRangeIndex = orderedRanges.findIndex((range) => isMapTimeColorSpecialMatcherRange(range));

  if (firstSpecialRangeIndex < 0) {
    return [...orderedRanges, nextRange];
  }

  return [
    ...orderedRanges.slice(0, firstSpecialRangeIndex),
    nextRange,
    ...orderedRanges.slice(firstSpecialRangeIndex)
  ];
}

function reindexMapTimeColorRangeOrdinalLabels(ranges = []) {
  let regularOrdinalIndex = 0;

  return ranges.map((range) => {
    if (!range || isMapTimeColorSpecialMatcherRange(range)) {
      return range;
    }

    if (!Number.isFinite(extractMapTimeColorRangeLabelNumber(range.label))) {
      return range;
    }

    regularOrdinalIndex += 1;
    return {
      ...range,
      label: formatMapTimeColorRangeOrdinalLabel(regularOrdinalIndex)
    };
  });
}

function normalizeMapTimeColorRange(input = {}, index = 0) {
  const normalizedId = typeof input?.id === 'string' && input.id.trim()
    ? input.id.trim()
    : `range-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const normalizedMode = input?.mode === 'dates' ? 'dates' : 'days';
  const normalizedMatcher = normalizeMapTimeColorMatcher(input?.matcher);
  const normalizedLabel = typeof input?.label === 'string' && input.label.trim()
    ? input.label.trim()
    : formatMapTimeColorRangeOrdinalLabel(index + 1);
  const resolvedLabel = normalizedMatcher === 'missingDate' && (
    normalizedLabel === formatMapTimeColorRangeOrdinalLabel(1)
    || normalizedLabel === 'Brak daty'
    || normalizedLabel === 'Brak wybranej daty'
    || normalizedLabel === 'Brak daty wpłaty oraz daty wizyty'
    || normalizedLabel === 'Brak daty wplaty oraz daty wizyty'
  )
    ? getMapTimeColorSpecialRangeDefaultLabel('missingDate')
    : normalizedMatcher === 'unmatchedWithDate' && (
      normalizedLabel === formatMapTimeColorRangeOrdinalLabel(2)
      || normalizedLabel === 'Filtr kiedy nic nie wchodzi w zakres'
      || normalizedLabel === 'Poza pozostałymi regułami'
      || normalizedLabel === 'Poza pozostalymi regulami'
    )
      ? getMapTimeColorSpecialRangeDefaultLabel('unmatchedWithDate')
      : normalizedLabel;
  const hasDateFromMonthDraft = Object.prototype.hasOwnProperty.call(input || {}, 'dateFromMonthDraft');
  const hasDateToMonthDraft = Object.prototype.hasOwnProperty.call(input || {}, 'dateToMonthDraft');

  return {
    id: normalizedId,
    label: resolvedLabel,
    color: normalizeHexColorInputValue(input?.color),
    enabled: input?.enabled !== false,
    matcher: normalizedMatcher,
    mode: normalizedMode,
    dateField: normalizeMapTimeColorDateField(input?.dateField),
    daysFrom: normalizeNonNegativeIntegerInputValue(input?.daysFrom),
    daysTo: normalizeNonNegativeIntegerInputValue(input?.daysTo),
    dateFromMonthDraft: hasDateFromMonthDraft
      ? normalizeMonthNumberInputValue(input?.dateFromMonthDraft)
      : extractMonthNumberValue(input?.dateFrom),
    dateToMonthDraft: hasDateToMonthDraft
      ? normalizeMonthNumberInputValue(input?.dateToMonthDraft)
      : extractMonthNumberValue(input?.dateTo),
    dateFrom: normalizeDateInputValue(input?.dateFrom),
    dateTo: normalizeDateInputValue(input?.dateTo)
  };
}

function normalizeMapTimeColorMatcher(value) {
  if (value === 'missingDate') {
    return 'missingDate';
  }
  if (value === 'unmatchedWithDate') {
    return 'unmatchedWithDate';
  }
  return 'range';
}

function isMapTimeColorMissingDateRange(range = {}) {
  return normalizeMapTimeColorMatcher(range?.matcher) === 'missingDate';
}

function isMapTimeColorUnmatchedWithDateRange(range = {}) {
  return normalizeMapTimeColorMatcher(range?.matcher) === 'unmatchedWithDate';
}

function isMapTimeColorSpecialMatcherRange(range = {}) {
  return isMapTimeColorMissingDateRange(range) || isMapTimeColorUnmatchedWithDateRange(range);
}

function normalizeMapTimeColorDateMatchMode(value) {
  if (value === 'payment') {
    return 'payment';
  }
  if (value === 'visit') {
    return 'visit';
  }
  if (value === 'paymentThenVisit') {
    return 'paymentThenVisit';
  }
  if (value === 'visitThenPayment') {
    return 'visitThenPayment';
  }
  return 'paymentThenVisit';
}

function getMapTimeColorDateMatchModeFields(range = {}) {
  const matchMode = normalizeMapTimeColorDateMatchMode(mapTimeColorDateMatchMode);
  if (matchMode === 'payment') {
    return ['lastPaymentAt'];
  }
  if (matchMode === 'visit') {
    return ['lastVisitAt'];
  }
  if (matchMode === 'visitThenPayment') {
    return ['lastVisitAt', 'lastPaymentAt'];
  }

  return ['lastPaymentAt', 'lastVisitAt'];
}

function shouldShowMapTimeColorDateMatchModeHelper() {
  return normalizeMapTimeColorDateMatchMode(mapTimeColorDateMatchMode) === 'paymentThenVisit';
}

function getMapTimeColorCandidateDates(person, range = {}) {
  if (!person) {
    return [];
  }

  const candidateDates = [];
  getMapTimeColorDateMatchModeFields(range).forEach((fieldName) => {
    const normalizedDate = normalizeDateInputValue(person?.[fieldName]);
    if (normalizedDate && !candidateDates.includes(normalizedDate)) {
      candidateDates.push(normalizedDate);
    }
  });

  return candidateDates;
}

function hasMapTimeColorAnyCandidateDate(person, range = {}) {
  return getMapTimeColorCandidateDates(person, range).length > 0;
}

function normalizeMapTimeColorDateField(value) {
  return value === 'lastVisitAt' ? 'lastVisitAt' : 'lastPaymentAt';
}

function formatMapTimeColorDateFieldLabel(value, options = {}) {
  const normalizedValue = normalizeMapTimeColorDateField(value);
  const short = Boolean(options?.short);

  if (normalizedValue === 'lastVisitAt') {
    return short ? 'Wizyta' : 'Data ostatniej wizyty';
  }

  return short ? 'Wpłata' : 'Data wpłaty';
}

function buildMapTimeColorRangeDateDraft(range = {}) {
  return buildMapDateFilterDraft({
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    fromMonth: range.mode === 'dates' && typeof range.dateFromMonthDraft === 'string'
      ? range.dateFromMonthDraft
      : undefined,
    toMonth: range.mode === 'dates' && typeof range.dateToMonthDraft === 'string'
      ? range.dateToMonthDraft
      : undefined
  });
}

function normalizeMapTimeColorMiddleDateDraft(input = {}) {
  return normalizeMapDateFilterDraft(input);
}

function getSortedMapTimeColorMiddleMonthValues() {
  return Array.from(
    new Set(
      mapDateFilterOptions
        .map((monthValue) => normalizeMonthInputValue(monthValue))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function getMapTimeColorMiddleBoundaryDefaults(boundary = 'start', yearValue = '') {
  const normalizedBoundary = boundary === 'end' ? 'end' : 'start';
  const normalizedYear = normalizeYearInputValue(yearValue);
  const availableMonths = getSortedMapTimeColorMiddleMonthValues();
  const scopedMonths = normalizedYear
    ? availableMonths.filter((monthValue) => monthValue.startsWith(`${normalizedYear}-`))
    : availableMonths;
  const boundaryMonthValue = scopedMonths.length
    ? (normalizedBoundary === 'start' ? scopedMonths[0] : scopedMonths[scopedMonths.length - 1])
    : '';

  if (boundaryMonthValue) {
    return {
      year: extractYearValue(boundaryMonthValue),
      month: extractMonthNumberValue(boundaryMonthValue)
    };
  }

  if (normalizedYear) {
    return {
      year: normalizedYear,
      month: normalizedBoundary === 'start' ? '01' : '12'
    };
  }

  const today = new Date();
  return {
    year: String(today.getUTCFullYear()),
    month: normalizedBoundary === 'start'
      ? '01'
      : String(today.getUTCMonth() + 1).padStart(2, '0')
  };
}

function resolveMapTimeColorMiddleDateDraft(input = {}, options = {}) {
  const draft = normalizeMapTimeColorMiddleDateDraft(input);
  if (options?.mode !== 'dates') {
    return draft;
  }

  return {
    fromYear: draft.fromYear,
    fromMonth: draft.fromYear ? draft.fromMonth : '',
    toYear: draft.toYear,
    toMonth: draft.toYear ? draft.toMonth : ''
  };
}

function buildMapTimeColorMiddleDateDraft(range = {}) {
  return resolveMapTimeColorMiddleDateDraft(
    buildMapTimeColorRangeDateDraft(range),
    { mode: range?.mode }
  );
}

function buildMapTimeColorEffectiveDateRange(range = {}) {
  return buildMapTimeColorRangeDatesFromDraft(buildMapTimeColorMiddleDateDraft(range));
}

function convertMapTimeColorDateToDaysAgo(dateValue) {
  const comparableValue = getMapTimeColorRangeDateComparableValue(dateValue);
  if (!Number.isFinite(comparableValue)) {
    return '';
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return String(Math.max(0, Math.round((todayUtc - comparableValue) / 86400000)));
}

function buildMapTimeColorDateFromDaysAgo(daysValue) {
  const normalizedDays = normalizeNonNegativeIntegerInputValue(daysValue);
  if (!normalizedDays) {
    return '';
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const targetDate = new Date(todayUtc - (Number(normalizedDays) * 86400000));
  return targetDate.toISOString().slice(0, 10);
}

function buildMapTimeColorPreviewDaysValues(range = {}) {
  if (isMapTimeColorSpecialMatcherRange(range)) {
    return {
      daysFrom: '',
      daysTo: ''
    };
  }

  if (range?.mode === 'dates') {
    const effectiveDateRange = buildMapTimeColorEffectiveDateRange(range);
    return {
      daysFrom: convertMapTimeColorDateToDaysAgo(effectiveDateRange.dateFrom),
      daysTo: convertMapTimeColorDateToDaysAgo(effectiveDateRange.dateTo)
    };
  }

  return {
    daysFrom: typeof range?.daysFrom === 'string' ? range.daysFrom : '',
    daysTo: typeof range?.daysTo === 'string' ? range.daysTo : ''
  };
}

function getMapTimeColorBoundaryExactDate(range = {}, boundary = 'start') {
  const normalizedBoundary = boundary === 'end' ? 'end' : 'start';
  if (range?.mode === 'dates') {
    const effectiveDateRange = buildMapTimeColorEffectiveDateRange(range);
    return normalizedBoundary === 'end'
      ? effectiveDateRange.dateTo || ''
      : effectiveDateRange.dateFrom || '';
  }

  const previewDaysValues = buildMapTimeColorPreviewDaysValues(range);
  const boundaryDaysValue = normalizedBoundary === 'end'
    ? previewDaysValues.daysFrom
    : previewDaysValues.daysTo;
  return buildMapTimeColorDateFromDaysAgo(boundaryDaysValue);
}

function resolveMapTimeColorMiddleBoundarySelection(boundary = 'start', input = {}) {
  const rawYear = normalizeYearInputValue(input?.year);
  const rawMonth = normalizeMonthNumberInputValue(input?.month);

  return {
    year: rawYear,
    month: rawYear ? rawMonth : ''
  };
}

function buildMapTimeColorMiddleBoundaryDate(boundary = 'start', input = {}) {
  const normalizedBoundary = boundary === 'end' ? 'end' : 'start';
  const resolved = resolveMapTimeColorMiddleBoundarySelection(normalizedBoundary, input);
  if (!resolved.year) {
    return '';
  }

  if (normalizedBoundary === 'end') {
    return resolved.month
      ? getMonthEndDate(`${resolved.year}-${resolved.month}`)
      : `${resolved.year}-12-31`;
  }

  return `${resolved.year}-${resolved.month || '01'}-01`;
}

function buildMapTimeColorMiddleBoundaryState(range = {}, boundary = 'start') {
  const normalizedBoundary = boundary === 'end' ? 'end' : 'start';
  const isEnd = normalizedBoundary === 'end';
  const dayValues = buildMapTimeColorPreviewDaysValues(range);
  const daysValue = isEnd ? dayValues.daysFrom : dayValues.daysTo;
  const exactDate = getMapTimeColorBoundaryExactDate(range, normalizedBoundary) || '';
  const dateDraft = buildMapTimeColorRangeDateDraft(range);
  const draftYearValue = isEnd ? dateDraft.toYear : dateDraft.fromYear;
  const draftMonthValue = isEnd ? dateDraft.toMonth : dateDraft.fromMonth;
  const resolvedExactDate = range?.mode === 'dates' && draftYearValue
    ? (exactDate || buildMapTimeColorMiddleBoundaryDate(normalizedBoundary, {
      year: draftYearValue,
      month: draftMonthValue
    }))
    : exactDate;

  return {
    exactDate: resolvedExactDate,
    yearValue: range?.mode === 'dates'
      ? draftYearValue
      : extractYearValue(resolvedExactDate),
    monthValue: range?.mode === 'dates'
      ? (draftYearValue ? draftMonthValue : '')
      : extractMonthNumberValue(resolvedExactDate),
    daysValue: range?.mode === 'dates'
      ? convertMapTimeColorDateToDaysAgo(resolvedExactDate)
      : daysValue
  };
}

function buildMapTimeColorRangeDatesFromDaysValues(input = {}) {
  const normalizedDaysFrom = normalizeNonNegativeIntegerInputValue(input?.daysFrom);
  const normalizedDaysTo = normalizeNonNegativeIntegerInputValue(input?.daysTo);

  return {
    dateFrom: buildMapTimeColorDateFromDaysAgo(normalizedDaysTo),
    dateTo: buildMapTimeColorDateFromDaysAgo(normalizedDaysFrom)
  };
}

function hasInvalidMapTimeColorMiddleDateRange(input = {}) {
  return hasInvalidMapDateRangeDraft(normalizeMapTimeColorMiddleDateDraft(input));
}

function buildMapTimeColorMiddleYearOptionsMarkup(selectedValue) {
  return buildYearOptionsMarkup(selectedValue);
}

function buildMapTimeColorMiddleMonthOptionsMarkup(selectedValue) {
  return buildMonthNumberOptionsMarkup(selectedValue);
}

function renderMapTimeColorMiddleDateFields(options = {}) {
  const yearFieldName = options.yearFieldName || '';
  const monthFieldName = options.monthFieldName || '';
  const yearValue = options.yearValue || '';
  const monthValue = options.monthValue || '';
  const hasMonthOptions = Boolean(options.hasMonthOptions);
  const hasInvalidDateRange = Boolean(options.hasInvalidDateRange);
  const isDisabled = Boolean(options.disabled);
  const isMonthExplicit = hasMonthOptions && Boolean(yearValue) && Boolean(monthValue);

  return `
    <div class="field filter-date-box time-color-range-middle-date-box">
      <div class="filter-date-box-grid">
        <div class="select-wrap${hasInvalidDateRange ? ' is-invalid' : ''}">
          <select data-map-time-color-field="${escapeHtml(yearFieldName)}"${hasMonthOptions && !isDisabled ? '' : ' disabled'}>
            ${buildMapTimeColorMiddleYearOptionsMarkup(yearValue)}
          </select>
        </div>
        <div class="select-wrap${isMonthExplicit ? '' : ' is-dimmed'}${hasInvalidDateRange ? ' is-invalid' : ''}">
          <select data-map-time-color-field="${escapeHtml(monthFieldName)}"${hasMonthOptions && !isDisabled ? '' : ' disabled'}>
            ${buildMapTimeColorMiddleMonthOptionsMarkup(monthValue)}
          </select>
        </div>
      </div>
    </div>
  `;
}

function renderMapTimeColorMiddleDaysField(options = {}) {
  const fieldName = options.fieldName || '';
  const fieldValue = options.fieldValue || '';
  const isDisabled = Boolean(options.disabled);

  return `
    <input
      class="time-color-range-middle-days-input"
      type="number"
      min="0"
      step="1"
      value="${escapeHtml(fieldValue)}"
      placeholder="Ilość dni"
      data-map-time-color-field="${escapeHtml(fieldName)}"
      ${isDisabled ? 'disabled' : ''}
    />
  `;
}

function syncMapTimeColorMiddleRowInvalidState(rowElement) {
  if (!rowElement) {
    return false;
  }

  const hasInvalidDateRange = hasInvalidMapTimeColorMiddleDateRange({
    fromYear: rowElement.querySelector('[data-map-time-color-field="dateFromYear"]')?.value || '',
    fromMonth: rowElement.querySelector('[data-map-time-color-field="dateFromMonth"]')?.value || '',
    toYear: rowElement.querySelector('[data-map-time-color-field="dateToYear"]')?.value || '',
    toMonth: rowElement.querySelector('[data-map-time-color-field="dateToMonth"]')?.value || ''
  });

  rowElement.querySelectorAll('.time-color-range-middle-date-box .select-wrap').forEach((wrapElement) => {
    wrapElement.classList.toggle('is-invalid', hasInvalidDateRange);
  });

  return hasInvalidDateRange;
}

function swapMapTimeColorMiddleBoundaryValues(rowElement) {
  if (!rowElement) {
    return false;
  }

  const fieldPairs = [
    ['dateFromYear', 'dateToYear'],
    ['dateFromMonth', 'dateToMonth'],
    ['daysTo', 'daysFrom'],
    ['dateFrom', 'dateTo']
  ];

  fieldPairs.forEach(([leftFieldName, rightFieldName]) => {
    const leftInput = rowElement.querySelector(`[data-map-time-color-field="${leftFieldName}"]`);
    const rightInput = rowElement.querySelector(`[data-map-time-color-field="${rightFieldName}"]`);
    if (!leftInput || !rightInput) {
      return;
    }

    const leftValue = leftInput.value;
    leftInput.value = rightInput.value;
    rightInput.value = leftValue;
  });

  return true;
}

function syncMapTimeColorMiddleRowBoundaryOrder(rowElement) {
  if (!rowElement) {
    return false;
  }

  const dateFromValue = normalizeDateInputValue(
    rowElement.querySelector('[data-map-time-color-field="dateFrom"]')?.value || ''
  );
  const dateToValue = normalizeDateInputValue(
    rowElement.querySelector('[data-map-time-color-field="dateTo"]')?.value || ''
  );
  const comparableDateFrom = getMapTimeColorRangeDateComparableValue(dateFromValue);
  const comparableDateTo = getMapTimeColorRangeDateComparableValue(dateToValue);

  if (!Number.isFinite(comparableDateFrom) || !Number.isFinite(comparableDateTo) || comparableDateFrom <= comparableDateTo) {
    return false;
  }

  return swapMapTimeColorMiddleBoundaryValues(rowElement);
}

function buildMapTimeColorRangeDatesFromDraft(input = {}) {
  const draft = normalizeMapDateFilterDraft(input);
  return {
    dateFrom: draft.fromYear
      ? `${draft.fromYear}-${draft.fromMonth || '01'}-01`
      : '',
    dateTo: draft.toYear
      ? (draft.toMonth ? getMonthEndDate(`${draft.toYear}-${draft.toMonth}`) : `${draft.toYear}-12-31`)
      : ''
  };
}

function formatMapTimeColorDraftBoundaryLabel(yearValue, monthValue) {
  const normalizedYear = normalizeYearInputValue(yearValue);
  const normalizedMonth = normalizeMonthNumberInputValue(monthValue);
  if (!normalizedYear) {
    return 'brak';
  }

  if (!normalizedMonth) {
    return normalizedYear;
  }

  return formatMonthYear(`${normalizedYear}-${normalizedMonth}`);
}

function normalizeNonNegativeIntegerInputValue(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return String(Math.trunc(value));
  }

  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? String(Number(trimmed)) : '';
}

function normalizeHexColorInputValue(value) {
  if (typeof value !== 'string') {
    return '#4db06f';
  }

  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : '#4db06f';
}

function parseHexColorToRgb(colorValue) {
  const normalizedColor = normalizeHexColorInputValue(colorValue);
  const hexValue = normalizedColor.slice(1);
  return {
    red: Number.parseInt(hexValue.slice(0, 2), 16),
    green: Number.parseInt(hexValue.slice(2, 4), 16),
    blue: Number.parseInt(hexValue.slice(4, 6), 16)
  };
}

function formatRgbChannelToHex(channelValue) {
  const normalizedValue = Math.max(0, Math.min(255, Math.round(Number(channelValue) || 0)));
  return normalizedValue.toString(16).padStart(2, '0');
}

function getMapTimeColorRelativeLuminance(colorValue) {
  const { red, green, blue } = parseHexColorToRgb(colorValue);
  const normalizeChannel = (channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928
      ? srgb / 12.92
      : ((srgb + 0.055) / 1.055) ** 2.4;
  };

  return (
    (0.2126 * normalizeChannel(red))
    + (0.7152 * normalizeChannel(green))
    + (0.0722 * normalizeChannel(blue))
  );
}

function isDarkMapTimeColorValue(colorValue) {
  return getMapTimeColorRelativeLuminance(colorValue) <= DARK_TIME_COLOR_OUTLINE_LUMINANCE_THRESHOLD;
}

function buildLightenedMapTimeColorStrokeColor(colorValue, lightenFactor = DARK_TIME_COLOR_OUTLINE_LIGHTEN_FACTOR) {
  const normalizedFactor = Math.max(0, Math.min(1, Number(lightenFactor) || 0));
  const { red, green, blue } = parseHexColorToRgb(colorValue);
  const mixWithWhite = (channel) => channel + ((255 - channel) * normalizedFactor);

  return `#${formatRgbChannelToHex(mixWithWhite(red))}${formatRgbChannelToHex(mixWithWhite(green))}${formatRgbChannelToHex(mixWithWhite(blue))}`;
}

function getMapTimeColorSelectionBorderColor(colorValue) {
  const normalizedColor = normalizeHexColorInputValue(colorValue);
  if (!isDarkMapTimeColorValue(normalizedColor)) {
    return '';
  }

  return buildLightenedMapTimeColorStrokeColor(normalizedColor);
}

function formatMapTimeColorValueLabel(colorValue) {
  const normalizedColor = normalizeHexColorInputValue(colorValue);
  const matchedPreset = MAP_TIME_COLOR_MENU_PRESETS.find((preset) => {
    return normalizeHexColorInputValue(preset.value) === normalizedColor;
  });

  return matchedPreset?.label || `Kolor specjalny ${normalizedColor}`;
}

function normalizeMapDateFilterDraft(input = {}) {
  return {
    fromMonth: normalizeMonthNumberInputValue(input?.fromMonth),
    fromYear: normalizeYearInputValue(input?.fromYear),
    toMonth: normalizeMonthNumberInputValue(input?.toMonth),
    toYear: normalizeYearInputValue(input?.toYear),
    pumpType: normalizeMapFilterOptionInputValue(input?.pumpType),
    visitType: normalizeMapFilterOptionInputValue(input?.visitType),
    region: normalizeMapFilterOptionInputValue(input?.region),
    postalCode: normalizeMapFilterOptionInputValue(input?.postalCode),
    producer: normalizeMapFilterOptionInputValue(input?.producer),
    installerCompany: normalizeMapFilterOptionInputValue(input?.installerCompany)
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
  const draft = {
    fromMonth: extractMonthNumberValue(filter.dateFrom),
    fromYear: extractYearValue(filter.dateFrom),
    toMonth: extractMonthNumberValue(filter.dateTo),
    toYear: extractYearValue(filter.dateTo),
    pumpType: normalizeMapFilterOptionInputValue(filter.pumpType),
    visitType: normalizeMapFilterOptionInputValue(filter.visitType),
    region: normalizeMapFilterOptionInputValue(filter.region),
    postalCode: normalizeMapFilterOptionInputValue(filter.postalCode),
    producer: normalizeMapFilterOptionInputValue(filter.producer),
    installerCompany: normalizeMapFilterOptionInputValue(filter.installerCompany)
  };

  if (
    draft.fromMonth
    || draft.fromYear
    || draft.toMonth
    || draft.toYear
    || draft.pumpType
    || draft.visitType
    || draft.region
    || draft.postalCode
    || draft.producer
    || draft.installerCompany
  ) {
    return draft;
  }

  return buildDefaultMapDateFilterDraft();
}

function buildDefaultMapDateFilterDraft() {
  const defaultFromYear = String(new Date().getFullYear() - 10);

  return {
    fromMonth: '',
    fromYear: defaultFromYear,
    toMonth: '',
    toYear: '',
    pumpType: '',
    visitType: '',
    region: '',
    postalCode: '',
    producer: '',
    installerCompany: ''
  };
}

function resetMapDateFilterDraftField(currentDraft = mapDateFilterDraft, fieldName = '') {
  const draft = normalizeMapDateFilterDraft(currentDraft);
  const defaults = buildDefaultMapDateFilterDraft();

  if (fieldName === 'newestDate') {
    return {
      ...draft,
      toMonth: '',
      toYear: ''
    };
  }

  if (fieldName === 'oldestDate') {
    return {
      ...draft,
      fromMonth: defaults.fromMonth,
      fromYear: defaults.fromYear
    };
  }

  if (fieldName === 'pumpType') {
    return {
      ...draft,
      pumpType: ''
    };
  }

  if (fieldName === 'visitType') {
    return {
      ...draft,
      visitType: ''
    };
  }

  if (fieldName === 'region') {
    return {
      ...draft,
      region: ''
    };
  }

  if (fieldName === 'postalCode') {
    return {
      ...draft,
      postalCode: ''
    };
  }

  if (fieldName === 'producer') {
    return {
      ...draft,
      producer: ''
    };
  }

  if (fieldName === 'installerCompany') {
    return {
      ...draft,
      installerCompany: ''
    };
  }

  return draft;
}

function resolveMapDateFilterDraft(nextFilter = {}, normalizedFilter = mapDateFilter) {
  const nextDraft = normalizeMapDateFilterDraft(nextFilter);
  if (
    nextDraft.fromMonth
    || nextDraft.fromYear
    || nextDraft.toMonth
    || nextDraft.toYear
    || nextDraft.pumpType
    || nextDraft.visitType
    || nextDraft.region
    || nextDraft.postalCode
    || nextDraft.producer
    || nextDraft.installerCompany
  ) {
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

function buildMapFilterSelectOptionsMarkup(values, selectedValue, placeholder) {
  const normalizedSelectedValue = String(selectedValue || '').trim().toLocaleLowerCase('pl-PL');
  const options = [
    `<option value="">${escapeHtml(placeholder || 'Wszystkie')}</option>`
  ];

  (Array.isArray(values) ? values : []).forEach((value) => {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) {
      return;
    }
    const normalizedComparableValue = normalizedValue.toLocaleLowerCase('pl-PL');

    options.push(
      `<option value="${escapeHtml(normalizedValue)}"${normalizedComparableValue === normalizedSelectedValue ? ' selected' : ''}>${escapeHtml(normalizedValue)}</option>`
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
    return;
  }

  if (infoPanelMode === 'colors') {
    paintTimeColorPanel();
  }
}

async function loadMapFilterOptions() {
  const options = await window.appApi.getMapFilterOptions();
  const toNormalizedList = (values) => Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )).sort((left, right) => left.localeCompare(right, 'pl'));
  const formatRegionLabel = (value) => String(value || '')
    .trim()
    .toLocaleLowerCase('pl-PL')
    .replace(/(^|-)(\p{L})/gu, (match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('pl-PL')}`);
  const toNormalizedCaseInsensitiveList = (values, formatter = null) => {
    const outputByKey = new Map();

    (Array.isArray(values) ? values : []).forEach((value) => {
      const normalizedRawValue = String(value || '').trim();
      if (!normalizedRawValue) {
        return;
      }

      const key = normalizedRawValue.toLocaleLowerCase('pl-PL');
      if (outputByKey.has(key)) {
        return;
      }

      outputByKey.set(key, formatter ? formatter(normalizedRawValue) : normalizedRawValue);
    });

    return Array.from(outputByKey.values()).sort((left, right) => left.localeCompare(right, 'pl'));
  };

  mapFilterOptions = {
    pumpTypes: toNormalizedList(options?.pumpTypes),
    visitTypes: toNormalizedList(options?.visitTypes),
    regions: toNormalizedCaseInsensitiveList(options?.regions, formatRegionLabel),
    postalCodes: toNormalizedList(options?.postalCodes),
    producers: toNormalizedCaseInsensitiveList(options?.producers, formatRegionLabel),
    installerCompanies: toNormalizedList(options?.installerCompanies)
  };

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
  if (visibleMarkerSyncTimer) {
    window.clearTimeout(visibleMarkerSyncTimer);
    visibleMarkerSyncTimer = 0;
  }

  const requestToken = ++visibleMarkerSyncRequestToken;
  const run = () => {
    visibleMarkerSyncTimer = 0;
    void syncVisibleMarkersAsync({ requestToken });
  };

  if (delayMs <= 0) {
    requestAnimationFrame(run);
    return;
  }

  visibleMarkerSyncTimer = window.setTimeout(() => {
    requestAnimationFrame(run);
  }, delayMs);
}

async function syncVisibleMarkersAsync(options = {}) {
  const requestToken = Number(options.requestToken || 0);
  if (!mapInstance || (requestToken && requestToken !== visibleMarkerSyncRequestToken)) {
    return;
  }

  const bounds = mapInstance.getBounds().pad(VISIBLE_BOUNDS_PADDING);
  const nextPeople = [];
  for (let index = 0; index < allPeople.length; index += 1) {
    if (requestToken && requestToken !== visibleMarkerSyncRequestToken) {
      return;
    }

    const person = allPeople[index];
    if (isPointVisible(bounds, person) && shouldRenderMapTimeColorPersonMarker(person)) {
      nextPeople.push(person);
    }

    if ((index + 1) % MAP_VISIBLE_MARKER_SCAN_CHUNK_SIZE === 0) {
      await waitForNextAnimationFrame();
    }
  }

  const nextCustomPoints = [];
  for (let index = 0; index < allCustomPoints.length; index += 1) {
    if (requestToken && requestToken !== visibleMarkerSyncRequestToken) {
      return;
    }

    const point = allCustomPoints[index];
    if (isPointVisible(bounds, point)) {
      nextCustomPoints.push(point);
    }

    if ((index + 1) % MAP_VISIBLE_MARKER_SCAN_CHUNK_SIZE === 0) {
      await waitForNextAnimationFrame();
    }
  }

  if (requestToken && requestToken !== visibleMarkerSyncRequestToken) {
    return;
  }

  applyVisibleMarkerDiff(nextPeople, nextCustomPoints);
}

function waitForNextAnimationFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

function applyVisibleMarkerDiff(nextPeople, nextCustomPoints) {
  if (!mapInstance) {
    return;
  }

  const normalizedPeople = Array.isArray(nextPeople) ? nextPeople : [];
  const normalizedCustomPoints = Array.isArray(nextCustomPoints) ? nextCustomPoints : [];
  const nextVisiblePeopleKeys = new Set(normalizedPeople.map((person) => buildPersonKey(person)));
  const nextVisibleCustomKeys = new Set(normalizedCustomPoints.map((point) => buildCustomPointKey(point)));

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

  const peopleToAdd = normalizedPeople.filter((person) => !visiblePeopleMarkers.has(buildPersonKey(person)));
  const customPointsToAdd = normalizedCustomPoints.filter(
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

function syncVisibleMarkers() {
  if (!mapInstance) {
    return;
  }

  const bounds = mapInstance.getBounds().pad(VISIBLE_BOUNDS_PADDING);
  const nextPeople = allPeople.filter((person) => {
    return isPointVisible(bounds, person) && shouldRenderMapTimeColorPersonMarker(person);
  });
  const nextCustomPoints = allCustomPoints.filter((point) => isPointVisible(bounds, point));
  applyVisibleMarkerDiff(nextPeople, nextCustomPoints);
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

    const markerStyle = buildDefaultPersonMarkerStyle(person);
    if (!markerStyle) {
      continue;
    }

    const marker = L.circleMarker([person.lat, person.lng], {
      ...markerStyle,
      renderer: personRenderer
    });
    marker.__personSourceRowId = person.sourceRowId;
    attachLazyPopup(marker, () => buildPersonPopupHtml(person), () => {
      void selectPersonPoint(person, marker, { panelMode: 'selection' });
    }, {
      buildAsyncHtml: () => buildPersonPopupHtmlAsync(person)
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

function getVisiblePeopleWithOverlappingMarkers(person) {
  if (!mapInstance || !person?.sourceRowId) {
    return person ? [person] : [];
  }

  const anchorMarker = getPersonMarkerBySourceRowId(person.sourceRowId);
  if (!anchorMarker || typeof anchorMarker.getLatLng !== 'function') {
    return [person];
  }

  const anchorPoint = mapInstance.latLngToLayerPoint(anchorMarker.getLatLng());
  const overlappingSourceRowIds = new Set();
  const consideredSourceRowIds = new Set();

  const considerMarker = (marker) => {
    if (!marker || typeof marker.getLatLng !== 'function') {
      return;
    }

    const sourceRowId = String(marker.__personSourceRowId || '').trim();
    if (!sourceRowId || consideredSourceRowIds.has(sourceRowId)) {
      return;
    }

    if (typeof mapInstance.hasLayer === 'function' && !mapInstance.hasLayer(marker)) {
      return;
    }

    consideredSourceRowIds.add(sourceRowId);
    const markerPoint = mapInstance.latLngToLayerPoint(marker.getLatLng());
    if (anchorPoint.distanceTo(markerPoint) <= PERSON_POPUP_OVERLAP_DISTANCE_PX) {
      overlappingSourceRowIds.add(sourceRowId);
    }
  };

  for (const marker of visiblePeopleMarkers.values()) {
    considerMarker(marker);
  }
  for (const marker of supplementalPeopleMarkers.values()) {
    considerMarker(marker);
  }

  if (overlappingSourceRowIds.size === 0) {
    return [person];
  }

  const overlappingPeople = [];
  for (const sourceRowId of overlappingSourceRowIds) {
    const matchingPerson = findPersonBySourceRowId(sourceRowId);
    if (matchingPerson) {
      overlappingPeople.push(matchingPerson);
    }
  }

  if (overlappingPeople.length === 0) {
    return [person];
  }

  return overlappingPeople;
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
  navigationId = navigationHistoryState.currentId,
  preferPersonDetails = false
} = {}) {
  return {
    kind: MAP_NAVIGATION_HISTORY_STATE_KIND,
    sourceRowId: sourceRowId || null,
    historyIndex: Number.isInteger(historyIndex) ? historyIndex : -1,
    infoPanelMode: normalizeInfoPanelMode(infoMode),
    isSettingsOpen: Boolean(isSettingsPanelOpen),
    navigationId: Number.isInteger(navigationId) && navigationId >= 0 ? navigationId : 0,
    preferPersonDetails: Boolean(preferPersonDetails)
  };
}

function replaceCurrentNavigationState({
  sourceRowId = getCurrentSelectedPersonSourceRowId(),
  historyIndex = sourceRowId ? Math.max(personSelectionHistory.index, 0) : -1,
  isSettingsPanelOpen = isSettingsOpen,
  infoMode = infoPanelMode,
  preferPersonDetails = false
} = {}) {
  const nextState = buildNavigationHistoryState({
    sourceRowId,
    historyIndex,
    isSettingsPanelOpen,
    infoMode,
    navigationId: navigationHistoryState.currentId,
    preferPersonDetails
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
  infoMode = infoPanelMode,
  preferPersonDetails = false
} = {}) {
  const nextNavigationId = navigationHistoryState.currentId + 1;
  const nextState = buildNavigationHistoryState({
    sourceRowId,
    historyIndex,
    isSettingsPanelOpen,
    infoMode,
    navigationId: nextNavigationId,
    preferPersonDetails
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
        historyMode: 'restore',
        bypassOverlapSelection: Boolean(state.preferPersonDetails)
      });
      return;
    }

    focusSelectionOnMap(hiddenPerson);
    void selectPersonPoint(hiddenPerson, getPersonMarkerBySourceRowId(sourceRowId), {
      historyMode: 'restore',
      bypassOverlapSelection: Boolean(state.preferPersonDetails)
    });
    return;
  }

  focusSelectionOnMap(person);
  void selectPersonPoint(person, visiblePeopleMarkers.get(buildPersonKey(person)) || null, {
    historyMode: 'restore',
    bypassOverlapSelection: Boolean(state.preferPersonDetails)
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
      return buildDefaultMapDateFilterDraft();
    }

    const parsed = JSON.parse(raw);
    const normalized = normalizeMapDateFilterDraft(parsed);
    return (
      normalized.fromMonth
      || normalized.fromYear
      || normalized.toMonth
      || normalized.toYear
      || normalized.pumpType
      || normalized.visitType
      || normalized.region
      || normalized.postalCode
      || normalized.producer
      || normalized.installerCompany
    )
      ? normalized
      : buildDefaultMapDateFilterDraft();
  } catch (_error) {
    return buildDefaultMapDateFilterDraft();
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

function readStoredMapPersonSearchQuery() {
  try {
    return String(window.localStorage.getItem(MAP_PERSON_SEARCH_QUERY_STORAGE_KEY) || '');
  } catch (_error) {
    return '';
  }
}

function persistMapPersonSearchQuery() {
  try {
    window.localStorage.setItem(
      MAP_PERSON_SEARCH_QUERY_STORAGE_KEY,
      String(personSearchState.query || '')
    );
  } catch (_error) {
    // Ignore storage failures and keep the current session working.
  }
}

function readStoredMapTimeColorRanges() {
  try {
    if (shouldForceResetStoredMapTimeColorRanges()) {
      const defaultRanges = createDefaultMapTimeColorRanges();
      window.localStorage.setItem(MAP_TIME_COLOR_RANGES_STORAGE_KEY, JSON.stringify(defaultRanges));
      return defaultRanges;
    }

    const raw = window.localStorage.getItem(MAP_TIME_COLOR_RANGES_STORAGE_KEY);
    if (!raw) {
      return createDefaultMapTimeColorRanges();
    }

    return normalizeMapTimeColorRanges(JSON.parse(raw), { allowEmpty: true });
  } catch (_error) {
    return createDefaultMapTimeColorRanges();
  }
}

function shouldForceResetStoredMapTimeColorRanges() {
  try {
    const migrationApplied = window.localStorage.getItem(MAP_TIME_COLOR_RANGES_RESET_MIGRATION_STORAGE_KEY) === '1';
    if (migrationApplied) {
      return false;
    }

    window.localStorage.setItem(MAP_TIME_COLOR_RANGES_RESET_MIGRATION_STORAGE_KEY, '1');
    return true;
  } catch (_error) {
    return false;
  }
}

function readStoredMapTimeColorDateMatchMode() {
  try {
    return normalizeMapTimeColorDateMatchMode(
      window.localStorage.getItem(MAP_TIME_COLOR_DATE_MATCH_MODE_STORAGE_KEY)
    );
  } catch (_error) {
    return normalizeMapTimeColorDateMatchMode();
  }
}

function persistMapTimeColorRanges() {
  try {
    window.localStorage.setItem(
      MAP_TIME_COLOR_RANGES_STORAGE_KEY,
      JSON.stringify(normalizeMapTimeColorRanges(mapTimeColorRanges, { allowEmpty: true }))
    );
  } catch (_error) {
    // Ignore storage failures and keep the current session working.
  }

  refreshAllPersonMarkerAppearances();
  scheduleVisibleMarkerSync(0);
}

function persistMapTimeColorDateMatchMode() {
  if (mapTimeColorDateMatchModeAsyncPersistFrame) {
    cancelAnimationFrame(mapTimeColorDateMatchModeAsyncPersistFrame);
    mapTimeColorDateMatchModeAsyncPersistFrame = 0;
  }

  try {
    window.localStorage.setItem(
      MAP_TIME_COLOR_DATE_MATCH_MODE_STORAGE_KEY,
      normalizeMapTimeColorDateMatchMode(mapTimeColorDateMatchMode)
    );
  } catch (_error) {
    // Ignore storage failures and keep the current session working.
  }

  refreshAllPersonMarkerAppearances();
  scheduleVisibleMarkerSync(0);
}

function persistMapTimeColorDateMatchModeAsync() {
  if (mapTimeColorDateMatchModeAsyncPersistFrame) {
    cancelAnimationFrame(mapTimeColorDateMatchModeAsyncPersistFrame);
  }

  mapTimeColorDateMatchModeAsyncPersistFrame = requestAnimationFrame(() => {
    mapTimeColorDateMatchModeAsyncPersistFrame = 0;
    persistMapTimeColorDateMatchMode();
  });
}

function persistMapTimeColorRangesAsync() {
  if (mapTimeColorAsyncPersistFrame) {
    cancelAnimationFrame(mapTimeColorAsyncPersistFrame);
  }

  mapTimeColorAsyncPersistFrame = requestAnimationFrame(() => {
    mapTimeColorAsyncPersistFrame = 0;
    persistMapTimeColorRanges();
  });
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

function readLastSelectedPersonRestoreState() {
  try {
    const raw = window.localStorage.getItem(LAST_SELECTED_PERSON_RESTORE_STATE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const sourceRowId = String(parsed?.sourceRowId || '').trim();
    if (!sourceRowId) {
      return null;
    }

    return {
      sourceRowId,
      preferPersonDetails: parsed?.preferPersonDetails === true
    };
  } catch (_error) {
    return null;
  }
}

function saveLastSelectedPersonRestoreState(sourceRowId, preferPersonDetails) {
  const normalizedSourceRowId = String(sourceRowId || '').trim();
  if (!normalizedSourceRowId) {
    return;
  }

  try {
    window.localStorage.setItem(
      LAST_SELECTED_PERSON_RESTORE_STATE_STORAGE_KEY,
      JSON.stringify({
        sourceRowId: normalizedSourceRowId,
        preferPersonDetails: preferPersonDetails === true
      })
    );
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

async function copyTextToClipboard(value) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }

  let didCopy = false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      didCopy = true;
    }
  } catch (_error) {
    // Fallback below.
  }

  if (!didCopy) {
    try {
      const input = document.createElement('textarea');
      input.value = text;
      input.setAttribute('readonly', 'readonly');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      input.style.pointerEvents = 'none';
      document.body.appendChild(input);
      input.focus();
      input.select();
      didCopy = document.execCommand('copy');
      document.body.removeChild(input);
    } catch (_error) {
      didCopy = false;
    }
  }

  showMapToast({
    message: didCopy
      ? `Skopiowano ID ${text}`
      : 'Nie udalo sie skopiowac',
    type: didCopy ? 'success' : 'error'
  });
  return didCopy;
}

function formatMapToastExecutionTime(value) {
  const candidateDate = value instanceof Date
    ? value
    : new Date(value ?? Date.now());
  if (!Number.isFinite(candidateDate.getTime())) {
    return '';
  }

  return candidateDate.toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function ensureMapToastListElement() {
  if (mapToastListEl) {
    return mapToastListEl;
  }

  const host = mapEl || mapCanvasPanelEl || mapBoardEl;
  if (!host) {
    return null;
  }

  const listElement = document.createElement('div');
  listElement.className = 'map-toast-list';
  listElement.setAttribute('aria-live', 'polite');
  listElement.setAttribute('aria-atomic', 'false');
  host.appendChild(listElement);
  mapToastListEl = listElement;
  return mapToastListEl;
}

function showMapToast(options = {}) {
  const toastListElement = ensureMapToastListElement();
  if (!toastListElement) {
    return;
  }

  const normalizedMessage = String(options?.message || 'Wykonano akcje');
  const normalizedType = String(options?.type || 'success').toLowerCase();
  const durationMs = Number.isFinite(options?.durationMs)
    ? Math.max(800, Math.round(options.durationMs))
    : 5000;
  const executionMomentLabel = formatMapToastExecutionTime(options?.executedAt);

  const toastItemEl = document.createElement('div');
  toastItemEl.className = 'map-toast';
  toastItemEl.setAttribute('role', 'status');

  if (normalizedType === 'error') {
    toastItemEl.classList.add('is-error');
  } else if (normalizedType === 'info') {
    toastItemEl.classList.add('is-info');
  } else {
    toastItemEl.classList.add('is-success');
  }

  const toastBodyEl = document.createElement('div');
  toastBodyEl.className = 'map-toast-body';

  const toastMessageEl = document.createElement('div');
  toastMessageEl.className = 'map-toast-message';
  toastMessageEl.textContent = normalizedMessage;

  const toastTimeEl = document.createElement('div');
  toastTimeEl.className = 'map-toast-time';
  toastTimeEl.textContent = executionMomentLabel;

  toastBodyEl.append(toastMessageEl);
  if (executionMomentLabel) {
    toastBodyEl.append(toastTimeEl);
  }

  const closeControlEl = document.createElement('button');
  closeControlEl.type = 'button';
  closeControlEl.className = 'map-toast-close';
  closeControlEl.setAttribute('aria-label', 'Zamknij powiadomienie');
  closeControlEl.innerHTML = '<span class="map-toast-close-icon">×</span>';

  toastItemEl.append(toastBodyEl, closeControlEl);

  toastListElement.append(toastItemEl);
  if (toastListElement.childElementCount > 6) {
    toastListElement.firstElementChild?.remove();
  }

  window.requestAnimationFrame(() => {
    toastItemEl.classList.add('is-visible');
  });

  const startedAt = Date.now();
  const updateToastCountdown = () => {
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = Math.max(0, durationMs - elapsedMs);

    const progressRatio = durationMs > 0
      ? Math.min(1, Math.max(0, elapsedMs / durationMs))
      : 1;
    closeControlEl.style.setProperty('--toast-close-progress', String(progressRatio));
  };

  const removeToastWithFade = () => {
    toastItemEl.classList.remove('is-visible');
    window.setTimeout(() => {
      if (toastItemEl.parentElement) {
        toastItemEl.remove();
      }
    }, 220);
  };

  updateToastCountdown();
  const countdownTimer = window.setInterval(updateToastCountdown, 200);

  const hideTimer = window.setTimeout(() => {
    window.clearInterval(countdownTimer);
    removeToastWithFade();
  }, durationMs);

  closeControlEl.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.clearTimeout(hideTimer);
    window.clearInterval(countdownTimer);
    removeToastWithFade();
  });
}

function openSelectionPanelForSourceRowId(sourceRowId) {
  const normalizedSourceRowId = String(sourceRowId || '').trim();
  if (!normalizedSourceRowId) {
    return;
  }

  const person = allPeople.find((entry) => entry.sourceRowId === normalizedSourceRowId)
    || findPersonBySourceRowId(normalizedSourceRowId);
  if (!person) {
    return;
  }

  openInfoPanelMode('selection');
  focusSelectionOnMap(person);
  void selectPersonPoint(person, getPersonMarkerBySourceRowId(normalizedSourceRowId), {
    panelMode: 'selection',
    bypassOverlapSelection: true
  });
}

function focusSelectionOnMap(person, options = {}) {
  if (!mapInstance || !Number.isFinite(person?.lat) || !Number.isFinite(person?.lng)) {
    return;
  }

  const shouldAnimate = options.animate === true;

  mapInstance.panTo([person.lat, person.lng], {
    animate: shouldAnimate
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

function attachLazyPopup(marker, buildHtml, onSelect, options = {}) {
  const buildAsyncHtml = typeof options?.buildAsyncHtml === 'function'
    ? options.buildAsyncHtml
    : null;
  let hoverPopupTimer = null;
  let closePopupTimer = null;
  let isPointerOverPopup = false;
  let isViewportSyncBound = false;

  const clearClosePopupTimer = () => {
    if (closePopupTimer) {
      window.clearTimeout(closePopupTimer);
      closePopupTimer = null;
    }
  };

  const schedulePopupClose = () => {
    clearClosePopupTimer();
    closePopupTimer = window.setTimeout(() => {
      closePopupTimer = null;
      if (!isPointerOverPopup) {
        marker.closePopup();
      }
    }, HOVER_POPUP_CLOSE_DELAY_MS);
  };

  const clearHoverPopupTimer = () => {
    if (hoverPopupTimer) {
      window.clearTimeout(hoverPopupTimer);
      hoverPopupTimer = null;
    }
  };

  let popupContentRequestToken = 0;
  const loadingMarkup = '<p class="empty-state">Ładowanie osób...</p>';

  const refreshPopupContent = () => {
    const popup = marker.getPopup();
    if (!popup) {
      return;
    }

    popup.setContent(buildHtml());
    bindPopupHoverHandlers();
  };

  const refreshPopupContentAsync = async () => {
    const popup = marker.getPopup();
    if (!popup) {
      return;
    }

    const currentToken = ++popupContentRequestToken;
    mapPopupLoadingOperations += 1;
    syncMapLoadingIndicator();
    popup.setContent(loadingMarkup);
    bindPopupHoverHandlers();
    try {
      await waitForNextAnimationFrame();
      if (currentToken !== popupContentRequestToken) {
        return;
      }

      popup.setContent(buildAsyncHtml ? await buildAsyncHtml() : buildHtml());
      bindPopupHoverHandlers();
    } finally {
      mapPopupLoadingOperations = Math.max(0, mapPopupLoadingOperations - 1);
      syncMapLoadingIndicator();
    }
  };

  const ensurePopup = () => {
    if (!marker.getPopup()) {
      marker.bindPopup('');
    }

    void refreshPopupContentAsync();
  };

  const bindPopupViewportSync = () => {
    if (!mapInstance || isViewportSyncBound) {
      return;
    }

    mapInstance.on('zoomend', buildAsyncHtml ? refreshPopupContentAsync : refreshPopupContent);
    mapInstance.on('moveend', buildAsyncHtml ? refreshPopupContentAsync : refreshPopupContent);
    isViewportSyncBound = true;
  };

  const unbindPopupViewportSync = () => {
    if (!mapInstance || !isViewportSyncBound) {
      return;
    }

    mapInstance.off('zoomend', buildAsyncHtml ? refreshPopupContentAsync : refreshPopupContent);
    mapInstance.off('moveend', buildAsyncHtml ? refreshPopupContentAsync : refreshPopupContent);
    isViewportSyncBound = false;
  };

  const bindPopupHoverHandlers = () => {
    const popupElement = marker.getPopup()?.getElement();
    if (!popupElement || popupElement.__mapPopupHoverBound) {
      return;
    }

    popupElement.__mapPopupHoverBound = true;
    popupElement.addEventListener('mouseenter', () => {
      isPointerOverPopup = true;
      clearClosePopupTimer();
    });
    popupElement.addEventListener('mouseleave', () => {
      isPointerOverPopup = false;
      schedulePopupClose();
    });
  };

  marker.on('click', () => {
    clearHoverPopupTimer();
    clearClosePopupTimer();
    isPointerOverPopup = false;
    ensurePopup();
    marker.openPopup();
    onSelect?.();
  });

  marker.on('mouseover', () => {
    clearHoverPopupTimer();
    hoverPopupTimer = window.setTimeout(() => {
      hoverPopupTimer = null;
      clearClosePopupTimer();
      isPointerOverPopup = false;
      ensurePopup();
      marker.openPopup();
    }, HOVER_POPUP_DELAY_MS);
  });

  marker.on('mouseout', () => {
    clearHoverPopupTimer();
    schedulePopupClose();
  });

  marker.on('popupopen', () => {
    void refreshPopupContentAsync();
    bindPopupHoverHandlers();
    bindPopupViewportSync();
  });

  marker.on('popupclose', () => {
    popupContentRequestToken += 1;
    isPointerOverPopup = false;
    clearClosePopupTimer();
    unbindPopupViewportSync();
  });

  marker.on('remove', () => {
    clearHoverPopupTimer();
    clearClosePopupTimer();
    isPointerOverPopup = false;
    unbindPopupViewportSync();
  });
}

async function selectPersonPoint(person, marker, options = {}) {
  clearHoveredPersonSourceRowId({ restoreMap: false });
  const key = buildPersonKey(person);
  selectionRequestToken += 1;
  const requestToken = selectionRequestToken;
  cacheKnownPeople([person]);
  overlapSelectionBypassSourceRowId = options.bypassOverlapSelection === true
    ? String(person?.sourceRowId || '').trim() || null
    : null;
  const panelStateChanged = applySelectionPanelState(options.panelMode);

  saveLastSelectedPersonId(person.sourceRowId);
  saveLastSelectedPersonRestoreState(person.sourceRowId, options.bypassOverlapSelection === true);
  if (options.historyMode !== 'restore') {
    const personHistoryChanged = recordPersonSelectionHistory(person.sourceRowId);
    if (personHistoryChanged || panelStateChanged) {
      pushCurrentNavigationState({
        sourceRowId: person.sourceRowId,
        historyIndex: personSelectionHistory.index,
        preferPersonDetails: options.bypassOverlapSelection === true
      });
    } else {
      replaceCurrentNavigationState({
        sourceRowId: person.sourceRowId,
        historyIndex: personSelectionHistory.index,
        preferPersonDetails: options.bypassOverlapSelection === true
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

  if (infoPanelMode === 'list') {
    paintListPanel();
  }

  if (infoPanelMode === 'bookmarked') {
    paintBookmarkedListPanel();
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

  if (infoPanelMode === 'list') {
    paintListPanel();
  }

  if (infoPanelMode === 'bookmarked') {
    paintBookmarkedListPanel();
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
  isSelectionOverlapChooserActive = false;
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
  syncSelectionActionColor(null);
  syncSelectionBookmarkUiState();
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
  const overlappingPeopleCard = buildSelectionOverlappingPeopleCard(person);
  isSelectionOverlapChooserActive = Boolean(overlappingPeopleCard);
  syncOverviewSpacing(false, false, false, false, false, Boolean(overlappingPeopleCard));

  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = overlappingPeopleCard
    ? 'Wybór osoby'
    : (person.fullName || person.companyName || 'Wybrana osoba');
  selectionCopyEl.textContent = '';
  selectionCopyEl.hidden = true;

  if (overlappingPeopleCard) {
    selectionMetaEl.innerHTML = '';
    selectionMetaEl.hidden = true;
    selectionExtraEl.innerHTML = overlappingPeopleCard;
  } else {
    selectionMetaEl.innerHTML = `${renderPersonIdKeyValueRow(person)}${renderKeyValueList([
      { label: 'Telefon', value: person.phone || 'Brak' },
      { label: 'E-mail', value: person.email || 'Brak' },
      { label: 'Ostatnia wizyta', value: formatDate(person.lastVisitAt) },
      { label: 'Ostatnia wpłata', value: formatDate(person.lastPaymentAt) }
    ])}`;
    selectionMetaEl.hidden = false;
    selectionExtraEl.innerHTML = '<p class="empty-state">Ładowanie pełnych informacji o osobie...</p>';
  }

  selectionExtraEl.hidden = false;
  syncSelectionActionColor(person);
  setMapSelectionBookmarkActive(person?.isBookmarked === true);
  syncSelectionBookmarkUiState();
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
  const person = details.person;
  const overlappingPeopleCard = buildSelectionOverlappingPeopleCard(person);
  isSelectionOverlapChooserActive = Boolean(overlappingPeopleCard);
  syncOverviewSpacing(false, false, false, false, false, Boolean(overlappingPeopleCard));

  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = overlappingPeopleCard
    ? 'Wybór osoby'
    : (person.fullName || person.companyName || 'Wybrana osoba');
  selectionCopyEl.textContent = '';
  selectionCopyEl.hidden = true;

  syncSelectionActionColor(person);
  setMapSelectionBookmarkActive(person?.isBookmarked === true);
  syncSelectionBookmarkUiState();

  if (overlappingPeopleCard) {
    selectionMetaEl.innerHTML = '';
    selectionMetaEl.hidden = true;
    selectionExtraEl.innerHTML = overlappingPeopleCard;
    selectionExtraEl.hidden = false;
    return;
  }

  selectionMetaEl.innerHTML = `${renderPersonIdKeyValueRow(person)}${renderKeyValueList([
    { label: 'Telefon', value: person.phone || 'Brak' },
    { label: 'E-mail', value: person.email || 'Brak' },
    { label: 'Adres', value: person.addressText || person.routeAddress || 'Brak' },
    { label: 'Ostatnia wizyta', value: formatDate(person.lastVisitAt) },
    { label: 'Ostatnia wpłata', value: formatDate(person.lastPaymentAt) },
    ...buildPersonPrimaryDetailItems(person)
  ])}`;
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

  const sameLocationPeople = getVisiblePeopleWithOverlappingMarkers(person)
    .filter((entry) => entry?.sourceRowId && entry.sourceRowId !== person.sourceRowId)
    .sort((left, right) => {
      const leftName = String(left.fullName || left.companyName || '').trim();
      const rightName = String(right.fullName || right.companyName || '').trim();
      return leftName.localeCompare(rightName, 'pl', { sensitivity: 'base' });
    });

  if (sameLocationPeople.length > 0) {
    cards.push(`
      <article class="list-card">
        <div class="list-card-heading">
          <strong>Osoby w tej samej lokalizacji</strong>
        </div>
        <div class="vertical-list map-tool-results-list compact-list">
          ${sameLocationPeople
            .map((entry) => {
              const sourceRowId = escapeHtml(String(entry.sourceRowId));
              const isVisibleOnMap = allPeople.some((personEntry) => personEntry.sourceRowId === entry.sourceRowId);
              const locationLabel = Number.isFinite(entry.lat) && Number.isFinite(entry.lng)
                ? isVisibleOnMap
                  ? 'Widoczna na mapie'
                  : 'Poza bieżącym filtrem mapy'
                : 'Brak współrzędnych';

              return `
                <button
                  type="button"
                  class="person-row map-history-row"
                  data-map-same-location-source-row-id="${sourceRowId}"
                  data-map-hover-source-row-id="${sourceRowId}"
                >
                  <div class="list-card-heading">
                    <strong>${escapeHtml(entry.fullName || entry.companyName || 'Bez nazwy')}</strong>
                    ${renderMapPersonRowTools(entry, { isVisibleOnMap: true, isCurrent: false })}
                  </div>
                  ${renderPersonMetaLine(entry, locationLabel)}
                </button>
              `;
            })
            .join('')}
        </div>
      </article>
    `);
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
          <strong>Pełne dane z bazy</strong>
          <button
            type="button"
            class="button-muted section-toggle-button"
            data-map-toggle-raw-fields
            aria-expanded="${areMapRawFieldsExpanded ? 'true' : 'false'}"
          >
            ${areMapRawFieldsExpanded ? 'Ukryj' : 'Pokaż'}
          </button>
        </div>
        <div class="kv-grid kv-grid-compact raw-fields-grid"${areMapRawFieldsExpanded ? '' : ' hidden'}>
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

function buildSelectionOverlappingPeopleCard(person) {
  const normalizedSourceRowId = String(person?.sourceRowId || '').trim();
  if (normalizedSourceRowId && overlapSelectionBypassSourceRowId === normalizedSourceRowId) {
    return '';
  }

  const overlappingPeople = getVisiblePeopleWithOverlappingMarkers(person)
    .filter((entry) => entry?.sourceRowId)
    .sort((left, right) => {
      const leftName = String(left.fullName || left.companyName || '').trim();
      const rightName = String(right.fullName || right.companyName || '').trim();
      return leftName.localeCompare(rightName, 'pl', { sensitivity: 'base' });
    });

  if (overlappingPeople.length <= 1) {
    return '';
  }

  return `
      <div class="vertical-list map-tool-results-list map-overlap-results-list">
        ${overlappingPeople
          .map((entry) => {
            const displayName = escapeHtml(entry.fullName || entry.companyName || 'Bez nazwy');
            const sourceRowId = escapeHtml(String(entry.sourceRowId));
            const isVisibleOnMap = allPeople.some((personEntry) => personEntry.sourceRowId === entry.sourceRowId);
            const locationLabel = Number.isFinite(entry.lat) && Number.isFinite(entry.lng)
              ? isVisibleOnMap
                ? 'Widoczna na mapie'
                : 'Poza bieżącym filtrem mapy'
              : 'Brak współrzędnych';

            return `
              <button
                type="button"
                class="person-row map-history-row"
                data-map-overlap-source-row-id="${sourceRowId}"
                data-map-hover-source-row-id="${sourceRowId}"
              >
                <div class="list-card-heading">
                  <strong>${displayName}</strong>
                  ${renderMapPersonRowTools(entry, { isVisibleOnMap: true, isCurrent: false })}
                </div>
                ${renderPersonMetaLine(entry, locationLabel)}
              </button>
            `;
          })
          .join('')}
      </div>
  `;
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
  isSelectionOverlapChooserActive = false;
  syncOverviewSpacing(false);
  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = point.label || 'Punkt lokalny';
  selectionCopyEl.textContent = point.addressText || 'Punkt lokalny zapisany ręcznie.';
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
  syncSelectionActionColor(null);
  syncSelectionBookmarkUiState();
}

function formatCoordinate(value) {
  if (!Number.isFinite(Number(value))) {
    return 'Brak';
  }

  return Number(value).toFixed(5);
}

function buildPersonPopupHtml(person) {
  const matchingPeople = getVisiblePeopleWithOverlappingMarkers(person);
  if (matchingPeople.length > 1) {
    const sortedPeople = [...matchingPeople].sort((left, right) => {
      const leftName = String(left.fullName || left.companyName || '').trim();
      const rightName = String(right.fullName || right.companyName || '').trim();
      return leftName.localeCompare(rightName, 'pl', { sensitivity: 'base' });
    });

    const groups = [];
    for (const entry of sortedPeople) {
      const normalizedAddress = normalizeComparableText(entry.routeAddress || entry.addressText || '');
      const hasCoordinates = Number.isFinite(Number(entry.lat)) && Number.isFinite(Number(entry.lng));
      const coordinateKey = hasCoordinates
        ? `${Number(entry.lat).toFixed(6)}:${Number(entry.lng).toFixed(6)}`
        : '';

      const matchingGroup = groups.find((group) => {
        const matchesAddress = normalizedAddress && group.addressKeys.has(normalizedAddress);
        const matchesCoordinates = coordinateKey && group.coordinateKeys.has(coordinateKey);
        return matchesAddress || matchesCoordinates;
      });

      if (matchingGroup) {
        matchingGroup.people.push(entry);
        if (normalizedAddress) {
          matchingGroup.addressKeys.add(normalizedAddress);
        }
        if (coordinateKey) {
          matchingGroup.coordinateKeys.add(coordinateKey);
        }
        continue;
      }

      groups.push({
        people: [entry],
        addressKeys: new Set(normalizedAddress ? [normalizedAddress] : []),
        coordinateKeys: new Set(coordinateKey ? [coordinateKey] : [])
      });
    }

    return `
      <strong>Osoby w tym obszarze (${sortedPeople.length})</strong>
      <div class="map-popup-person-scroll">
        ${groups
          .map((group) => {
            const firstPerson = group.people[0] || {};
            const displayAddress = escapeHtml(firstPerson.routeAddress || firstPerson.addressText || 'Brak adresu');

            return `
              <article class="map-popup-person-box">
                <div class="map-popup-person-box-header">
                  <span>${displayAddress}</span>
                </div>
                <div class="map-popup-person-list">
                  ${group.people
                    .map((entry) => {
                      const displayName = escapeHtml(entry.fullName || entry.companyName || 'Bez nazwy');
                      const personId = escapeHtml(String(entry.sourceRowId || entry.id || 'Brak'));
                      const lastPaymentAt = escapeHtml(formatDate(entry.lastPaymentAt));
                      return `
                        <div
                          class="map-popup-person-entry"
                          data-map-popup-person-source-row-id="${escapeHtml(String(entry.sourceRowId || entry.id || ''))}"
                          role="button"
                          tabindex="0"
                          aria-label="Przejdz do osoby ${displayName}"
                        >
                          <strong>${displayName}</strong>
                          <span>ID: ${personId} <span class="map-person-id-copy" data-map-copy-person-id="${personId}" role="button" tabindex="0" aria-label="Kopiuj ID"><i class="fa-regular fa-copy" aria-hidden="true"></i></span></span>
                          <span>Ostatnia wpłata: ${lastPaymentAt}</span>
                        </div>
                      `;
                    })
                    .join('')}
                </div>
              </article>
            `;
          })
          .join('')}
      </div>
    `;
  }

  return `
    <div
      class="map-popup-person-entry"
      data-map-popup-person-source-row-id="${escapeHtml(String(person.sourceRowId || person.id || ''))}"
      role="button"
      tabindex="0"
      aria-label="Przejdz do osoby ${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}"
    >
      <strong>${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</strong>
      <span>ID: ${escapeHtml(String(person.sourceRowId || person.id || 'Brak'))} <span class="map-person-id-copy" data-map-copy-person-id="${escapeHtml(String(person.sourceRowId || person.id || 'Brak'))}" role="button" tabindex="0" aria-label="Kopiuj ID"><i class="fa-regular fa-copy" aria-hidden="true"></i></span></span>
      <span>${escapeHtml(person.routeAddress || person.addressText || 'Brak adresu')}</span>
      <span>Ostatnia wpłata: ${escapeHtml(formatDate(person.lastPaymentAt))}</span>
    </div>
  `;
}

async function buildPersonPopupHtmlAsync(person) {
  await waitForNextAnimationFrame();
  return buildPersonPopupHtml(person);
}

function buildCustomPointPopupHtml(point) {
  return `<strong>${escapeHtml(point.label)}</strong><br>${escapeHtml(point.addressText || 'Punkt lokalny')}`;
}

function getMapTimeColorRangeForPerson(person, ranges = mapTimeColorRanges) {
  if (!person) {
    return null;
  }

  const normalizedRanges = normalizeMapTimeColorRanges(ranges, { allowEmpty: true })
    .filter((range) => range.enabled !== false);
  const missingDateMatch = normalizedRanges.find((range) => {
    return isMapTimeColorMissingDateRange(range) && !hasMapTimeColorAnyCandidateDate(person, range);
  });
  if (missingDateMatch) {
    return missingDateMatch;
  }

  const regularMatch = sortMapTimeColorRangesForDisplay(
    normalizedRanges.filter((range) => normalizeMapTimeColorMatcher(range.matcher) === 'range')
  ).find((range) => {
    return doesMapTimeColorRangeMatchPerson(range, person);
  });
  if (regularMatch) {
    return regularMatch;
  }

  return normalizedRanges.find((range) => {
    return isMapTimeColorUnmatchedWithDateRange(range) && hasMapTimeColorAnyCandidateDate(person, range);
  }) || null;
}

function doesMapTimeColorRangeMatchPerson(range, person) {
  if (!range || !person) {
    return false;
  }

  if (isMapTimeColorMissingDateRange(range)) {
    return !hasMapTimeColorAnyCandidateDate(person, range);
  }
  if (isMapTimeColorUnmatchedWithDateRange(range)) {
    return hasMapTimeColorAnyCandidateDate(person, range);
  }

  return getMapTimeColorCandidateDates(person, range).some((normalizedDate) => {
    const comparableValue = getMapTimeColorComparableValueForPerson(person, range, normalizedDate);
    return doesMapTimeColorRangeMatchComparableValue(range, comparableValue);
  });
}

function getMapTimeColorComparableValueForPerson(person, range, normalizedPersonDateInput = '') {
  if (!person || !range) {
    return null;
  }

  const normalizedPersonDate = normalizedPersonDateInput || normalizeDateInputValue(person[range.dateField]);
  if (!normalizedPersonDate) {
    return null;
  }

  const timestamp = Date.parse(`${normalizedPersonDate}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  if (range.mode === 'dates') {
    return timestamp;
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.max(0, Math.round((todayUtc - timestamp) / 86400000));
}

function doesMapTimeColorRangeMatchComparableValue(range, comparableValue) {
  if (!range || !Number.isFinite(comparableValue)) {
    return false;
  }

  if (range.mode === 'dates') {
    const effectiveDateRange = buildMapTimeColorEffectiveDateRange(range);
    const rangeStart = getMapTimeColorRangeDateComparableValue(effectiveDateRange.dateFrom);
    const rangeEnd = getMapTimeColorRangeDateComparableValue(effectiveDateRange.dateTo);
    if (!Number.isFinite(rangeStart) && !Number.isFinite(rangeEnd)) {
      return true;
    }
    if (Number.isFinite(rangeStart) && comparableValue < rangeStart) {
      return false;
    }
    if (Number.isFinite(rangeEnd) && comparableValue > rangeEnd) {
      return false;
    }
    return Number.isFinite(rangeStart) || Number.isFinite(rangeEnd);
  }

  const rangeStart = range.daysFrom === '' ? null : Number(range.daysFrom);
  const rangeEnd = range.daysTo === '' ? null : Number(range.daysTo);
  if (!Number.isFinite(rangeStart) && !Number.isFinite(rangeEnd)) {
    return true;
  }
  if (Number.isFinite(rangeStart) && comparableValue < rangeStart) {
    return false;
  }
  if (Number.isFinite(rangeEnd) && comparableValue > rangeEnd) {
    return false;
  }
  return Number.isFinite(rangeStart) || Number.isFinite(rangeEnd);
}

function buildDefaultPersonMarkerStyle(person) {
  const matchedRange = getMapTimeColorRangeForPerson(person);
  if (!matchedRange) {
    return null;
  }

  const normalizedColor = normalizeHexColorInputValue(matchedRange.color);
  const isOutlineOnly = OUTLINE_ONLY_TIME_COLOR_VALUES.has(normalizedColor);
  return {
    ...DEFAULT_PERSON_MARKER_STYLE,
    color: normalizedColor,
    fillColor: normalizedColor,
    fillOpacity: isOutlineOnly ? OUTLINE_ONLY_TIME_COLOR_FILL_OPACITY : DEFAULT_PERSON_MARKER_STYLE.fillOpacity
  };
}

function shouldRenderMapTimeColorPersonMarker(person) {
  return Boolean(getMapTimeColorRangeForPerson(person));
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
  requestAnimationFrame(() => {
    mapInstance?.invalidateSize();
  });
  return true;
}

function renderCurrentInfoPanel() {
  syncSelectionBookmarkUiState();

  if (infoPanelMode === 'history') {
    paintHistorySelection();
    return;
  }

  if (infoPanelMode === 'filter') {
    paintFilterPanel();
    return;
  }

  if (infoPanelMode === 'colors') {
    paintTimeColorPanel();
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

  if (infoPanelMode === 'list') {
    if (!personListState.hasLoaded) {
      syncPersonListStateFromVisiblePeople({ preserveRenderedCount: false });
    }
    paintListPanel();
    return;
  }

  if (infoPanelMode === 'bookmarked') {
    if (!bookmarkedPersonListState.hasLoaded) {
      syncBookmarkedPersonListStateFromVisiblePeople({ preserveRenderedCount: false });
    }
    paintBookmarkedListPanel();
    return;
  }

  paintSelectionPanelState();
}

function normalizeInfoPanelMode(value) {
  return INFO_PANEL_MODES.includes(value) ? value : DEFAULT_INFO_PANEL_MODE;
}

function syncInfoToolButtons() {
  const shouldHighlightInfoMode = !isSettingsOpen;
  const isSettingsMode = isSettingsOpen;
  const isSelectionMode = shouldHighlightInfoMode && infoPanelMode === 'selection';
  const isSearchMode = shouldHighlightInfoMode && infoPanelMode === 'search';
  const isHistoryMode = shouldHighlightInfoMode && infoPanelMode === 'history';
  const isFilterMode = shouldHighlightInfoMode && infoPanelMode === 'filter';
  const isColorsMode = shouldHighlightInfoMode && infoPanelMode === 'colors';
  const isListMode = shouldHighlightInfoMode && infoPanelMode === 'list';
  const isBookmarkedMode = shouldHighlightInfoMode && infoPanelMode === 'bookmarked';

  selectionButtonEl?.classList.toggle('is-active', isSelectionMode);
  selectionButtonEl?.setAttribute('aria-pressed', String(isSelectionMode));

  searchButtonEl?.classList.toggle('is-active', isSearchMode);
  searchButtonEl?.setAttribute('aria-pressed', String(isSearchMode));

  historyButtonEl?.classList.toggle('is-active', isHistoryMode);
  historyButtonEl?.setAttribute('aria-pressed', String(isHistoryMode));

  filterButtonEl?.classList.toggle('is-active', isFilterMode);
  filterButtonEl?.setAttribute('aria-pressed', String(isFilterMode));

  colorsButtonEl?.classList.toggle('is-active', isColorsMode);
  colorsButtonEl?.setAttribute('aria-pressed', String(isColorsMode));

  listButtonEl?.classList.toggle('is-active', isListMode);
  listButtonEl?.setAttribute('aria-pressed', String(isListMode));

  bookmarkedButtonEl?.classList.toggle('is-active', isBookmarkedMode);
  bookmarkedButtonEl?.setAttribute('aria-pressed', String(isBookmarkedMode));

  settingsButtonEl?.classList.toggle('is-active', isSettingsMode);
  settingsButtonEl?.setAttribute('aria-pressed', String(isSettingsMode));
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
    ? 'Ładowanie...'
    : personSearchState.total === 1
      ? '1 osoba została wyszukana'
      : `${formatNumber(personSearchState.total)} osób zostało wyszukanych`;
  const shouldFocusInput = options.shouldFocusInput === true;
  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = 'Wyszukiwanie osób';
  selectionCopyEl.hidden = true;
  selectionMetaEl.innerHTML = `
    <div class="filter-panel-toolbar">
      <strong class="filter-panel-count search-panel-count">${escapeHtml(searchCountLabel)}</strong>
    </div>
  `;
  selectionMetaEl.hidden = false;
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
            placeholder="Np. Nabiałek, Przyrów, 600, 2025-03-10, 10.03.2025"
            data-map-person-search-input
          />
        </div>
      </label>
      <div class="action-row filter-action-row search-action-row">
        <button type="submit" class="button-strong">Szukaj</button>
        <button type="button" class="button-muted" data-map-person-search-clear${query ? '' : ' disabled'}>
          Wyczyść
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
    return '<p class="empty-state">Ładowanie wyników wyszukiwania...</p>';
  }

  if (personSearchState.results.length === 0) {
    return personSearchState.query.trim()
      ? '<p class="empty-state">Brak wyników dla podanego zapytania.</p>'
      : '<p class="empty-state">Wpisz zapytanie, aby wyszukać osobę po wszystkich polach i datach.</p>';
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
          : 'Poza bieżącym filtrem mapy'
        : 'Brak współrzędnych';

      return `
        <button
          type="button"
          class="person-row map-history-row${isCurrent ? ' is-current' : ''}"
          data-map-search-source-row-id="${escapeHtml(person.sourceRowId)}"
          data-map-hover-source-row-id="${escapeHtml(person.sourceRowId)}"
        >
          <div class="list-card-heading">
            <strong>${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</strong>
            ${renderMapPersonRowTools(person, { isVisibleOnMap, isCurrent })}
          </div>
          ${renderPersonMetaLine(person, locationLabel)}
        </button>
      `;
    })
    .join('');
}

function paintListPanel() {
  clearHoveredPersonSourceRowId();
  syncOverviewSpacing(false, false, false, false, true);
  overviewDefaultEls.forEach((element) => {
    element.hidden = true;
  });

  const listCountLabel = (isMapPointsLoading && !personListState.hasLoaded) || (personListState.isLoading && !personListState.hasLoaded)
    ? 'Ładowanie...'
    : personListState.total === 1
      ? '1 osoba została wyszukana'
      : `${formatNumber(personListState.total)} osób zostało wyszukanych`;
  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = 'Lista osób';
  selectionCopyEl.hidden = true;
  selectionMetaEl.innerHTML = `
    <div class="list-panel-summary">
      <strong class="filter-panel-count list-panel-count">${escapeHtml(listCountLabel)}</strong>
      <p class="copy list-panel-copy">Lista pokazuje osoby po zastosowanych filtrach i frazie wyszukiwania.</p>
    </div>
  `;
  selectionMetaEl.hidden = false;
  selectionExtraEl.innerHTML = `
    ${renderListAppliedRulesMarkup()}
    <div class="vertical-list map-tool-results-list" data-map-person-list-results>
      ${renderPersonListResults()}
    </div>
  `;
  bindHoverTrackingToRenderedPersonLists();
  bindLazyLoadingToRenderedPersonListResults();
  selectionExtraEl.hidden = false;

  const resultsList = selectionExtraEl?.querySelector('[data-map-person-list-results]');
  if (resultsList && personListState.hasLoaded && personListState.results.length > 0) {
    syncMapListResultsTail(resultsList);
    updateMapListRowHeight(resultsList);
  }
}

function renderPersonListResults() {
  if ((isMapPointsLoading && !personListState.hasLoaded) || (personListState.isLoading && !personListState.hasLoaded)) {
    return '<p class="empty-state">Ładowanie listy osób...</p>';
  }

  if (personListState.results.length === 0) {
    return '<p class="empty-state">Brak osób do wyświetlenia.</p>';
  }

  return renderPersonListRows(personListState.results, getCurrentSelectedPersonSourceRowId());
}

function renderListAppliedRulesMarkup() {
  const activeSearchQuery = getActiveMapPersonSearchQuery();
  const defaultFilter = normalizeMapDateFilter(buildDefaultMapDateFilterDraft());
  const oldestDateLabel = formatMapDateRuleLabel(
    extractYearValue(mapDateFilter.dateFrom),
    extractMonthNumberValue(mapDateFilter.dateFrom)
  );
  const newestDateLabel = formatMapDateRuleLabel(
    extractYearValue(mapDateFilter.dateTo),
    extractMonthNumberValue(mapDateFilter.dateTo)
  );
  const ruleBadges = [];

  if (activeSearchQuery) {
    ruleBadges.push(
      `<span class="info-chip map-rule-badge">Szukaj: ${escapeHtml(activeSearchQuery)}</span>`
    );
  }

  if (mapDateFilter.dateFrom) {
    ruleBadges.push(
      `<span class="info-chip map-rule-badge">Najstarsza: ${escapeHtml(oldestDateLabel)}</span>`
    );
  }

  if (mapDateFilter.dateTo !== defaultFilter.dateTo) {
    ruleBadges.push(
      `<span class="info-chip map-rule-badge">Najnowsza: ${escapeHtml(newestDateLabel)}</span>`
    );
  }

  if (mapDateFilter.visitType) {
    ruleBadges.push(
      `<span class="info-chip map-rule-badge">Typ wizyty: ${escapeHtml(mapDateFilter.visitType)}</span>`
    );
  }

  if (mapDateFilter.region) {
    ruleBadges.push(
      `<span class="info-chip map-rule-badge">Województwo: ${escapeHtml(mapDateFilter.region)}</span>`
    );
  }

  if (mapDateFilter.postalCode) {
    ruleBadges.push(
      `<span class="info-chip map-rule-badge">Kod pocztowy: ${escapeHtml(mapDateFilter.postalCode)}</span>`
    );
  }

  if (mapDateFilter.producer) {
    ruleBadges.push(
      `<span class="info-chip map-rule-badge">Producent: ${escapeHtml(mapDateFilter.producer)}</span>`
    );
  }

  if (mapDateFilter.installerCompany) {
    ruleBadges.push(
      `<span class="info-chip map-rule-badge">Firma montująca: ${escapeHtml(mapDateFilter.installerCompany)}</span>`
    );
  }

  if (ruleBadges.length === 0) {
    return '';
  }

  return `
    <div class="map-rule-badges" aria-label="Zastosowane reguły">
      ${ruleBadges.join('')}
    </div>
  `;
}

function formatMapDateRuleLabel(yearValue, monthValue) {
  const normalizedYear = normalizeYearInputValue(yearValue);
  const normalizedMonth = normalizeMonthNumberInputValue(monthValue);
  if (!normalizedYear) {
    return 'Dowolna';
  }

  if (!normalizedMonth) {
    return normalizedYear;
  }

  return formatMonthYear(`${normalizedYear}-${normalizedMonth}`);
}

function renderPersonListRows(people, currentSelectedPersonId = null) {
  return people
    .map((person) => {
      const isVisibleOnMap = allPeople.some((entry) => entry.sourceRowId === person.sourceRowId);
      const isCurrent = person.sourceRowId === currentSelectedPersonId;
      const locationLabel = Number.isFinite(person.lat) && Number.isFinite(person.lng)
        ? isVisibleOnMap
          ? 'Widoczna na mapie'
          : 'Poza bieżącym filtrem mapy'
        : 'Brak współrzędnych';

      return `
        <button
          type="button"
          class="person-row map-history-row${isCurrent ? ' is-current' : ''}"
          data-map-list-source-row-id="${escapeHtml(person.sourceRowId)}"
          data-map-hover-source-row-id="${escapeHtml(person.sourceRowId)}"
        >
          <div class="list-card-heading">
            <strong>${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</strong>
            ${renderMapPersonRowTools(person, { isVisibleOnMap, isCurrent })}
          </div>
          ${renderPersonMetaLine(person, locationLabel)}
        </button>
      `;
    })
    .join('');
}

function syncPersonListStateFromVisiblePeople(options = {}) {
  const preserveRenderedCount = options.preserveRenderedCount !== false;
  const listSource = getListVisiblePeople();
  const total = listSource.length;
  const nextRenderedCount = total === 0
    ? 0
    : Math.min(
        total,
        Math.max(
          preserveRenderedCount ? Number(personListState.renderedCount || 0) : 0,
          MAP_PERSON_LIST_BATCH_SIZE
        )
      );

  personListState = {
    results: listSource.slice(0, nextRenderedCount),
    total,
    isLoading: false,
    hasLoaded: true,
    hasMore: nextRenderedCount < total,
    renderedCount: nextRenderedCount
  };
}

function getListVisiblePeople() {
  const normalizedQuery = normalizeMapListSearchText(getActiveMapPersonSearchQuery());
  if (!normalizedQuery) {
    return allPeople;
  }

  return allPeople.filter((person) => doesPersonMatchListQuery(person, normalizedQuery));
}

function doesPersonMatchListQuery(person, normalizedQuery) {
  if (!normalizedQuery) {
    return true;
  }

  const searchText = [
    person?.sourceRowId,
    person?.fullName,
    person?.companyName,
    person?.city,
    person?.addressText,
    person?.routeAddress,
    person?.phone,
    person?.email,
    person?.lastVisitAt,
    person?.lastPaymentAt,
    person?.plannedVisitAt,
    person?.deviceVendor,
    person?.deviceModel,
    person?.notesSummary
  ]
    .filter((value) => value != null && value !== '')
    .map((value) => normalizeMapListSearchText(value))
    .join(' ');

  return searchText.includes(normalizedQuery);
}

function normalizeMapListSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getBookmarkedVisiblePeople() {
  return allPeople.filter((person) => person?.isBookmarked === true);
}

function syncBookmarkedPersonListStateFromVisiblePeople(options = {}) {
  const preserveRenderedCount = options.preserveRenderedCount !== false;
  const bookmarkedPeople = getBookmarkedVisiblePeople();
  const total = bookmarkedPeople.length;
  const nextRenderedCount = total === 0
    ? 0
    : Math.min(
        total,
        Math.max(
          preserveRenderedCount ? Number(bookmarkedPersonListState.renderedCount || 0) : 0,
          MAP_PERSON_LIST_BATCH_SIZE
        )
      );

  bookmarkedPersonListState = {
    results: bookmarkedPeople.slice(0, nextRenderedCount),
    total,
    isLoading: false,
    hasLoaded: true,
    hasMore: nextRenderedCount < total,
    renderedCount: nextRenderedCount
  };
}

function paintBookmarkedListPanel() {
  clearHoveredPersonSourceRowId();
  syncOverviewSpacing(false, false, false, false, true);
  overviewDefaultEls.forEach((element) => {
    element.hidden = true;
  });

  const savedCountLabel = (isMapPointsLoading && !bookmarkedPersonListState.hasLoaded)
    ? 'Ładowanie...'
    : bookmarkedPersonListState.total === 1
      ? '1 osoba zapisana'
      : `${formatNumber(bookmarkedPersonListState.total)} osób zapisanych`;

  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = 'Zaznaczone osoby';
  selectionCopyEl.hidden = true;
  selectionMetaEl.innerHTML = `
    <div class="list-panel-summary">
      <strong class="filter-panel-count list-panel-count-bookmarked">${escapeHtml(savedCountLabel)}</strong>
      <p class="copy list-panel-copy">To jest lista zapisanych osób.</p>
    </div>
  `;
  selectionMetaEl.hidden = false;
  selectionExtraEl.innerHTML = `
    <div class="vertical-list map-tool-results-list" data-map-bookmarked-list-results>
      ${renderBookmarkedPersonListResults()}
    </div>
  `;
  bindHoverTrackingToRenderedPersonLists();
  bindLazyLoadingToRenderedBookmarkedPersonListResults();
  selectionExtraEl.hidden = false;

  const resultsList = selectionExtraEl?.querySelector('[data-map-bookmarked-list-results]');
  if (resultsList && bookmarkedPersonListState.hasLoaded && bookmarkedPersonListState.results.length > 0) {
    syncMapBookmarkedListResultsTail(resultsList);
    updateMapBookmarkedListRowHeight(resultsList);
  }
}

function renderBookmarkedPersonListResults() {
  if (isMapPointsLoading && !bookmarkedPersonListState.hasLoaded) {
    return '<p class="empty-state">Ładowanie zapisanych osób...</p>';
  }

  if (bookmarkedPersonListState.results.length === 0) {
    return '<p class="empty-state">Brak zapisanych osób.</p>';
  }

  return renderBookmarkedPersonListRows(bookmarkedPersonListState.results, getCurrentSelectedPersonSourceRowId());
}

function renderBookmarkedPersonListRows(people, currentSelectedPersonId = null) {
  return people
    .map((person) => {
      const isVisibleOnMap = allPeople.some((entry) => entry.sourceRowId === person.sourceRowId);
      const isCurrent = person.sourceRowId === currentSelectedPersonId;
      const locationLabel = Number.isFinite(person.lat) && Number.isFinite(person.lng)
        ? isVisibleOnMap
          ? 'Widoczna na mapie'
          : 'Poza bieżącym filtrem mapy'
        : 'Brak współrzędnych';

      return `
        <button
          type="button"
          class="person-row map-history-row${isCurrent ? ' is-current' : ''}"
          data-map-bookmarked-source-row-id="${escapeHtml(person.sourceRowId)}"
          data-map-hover-source-row-id="${escapeHtml(person.sourceRowId)}"
        >
          <div class="list-card-heading">
            <strong>${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</strong>
            ${renderMapPersonRowTools(person, { isVisibleOnMap, isCurrent })}
          </div>
          ${renderPersonMetaLine(person, locationLabel)}
        </button>
      `;
    })
    .join('');
}

function paintTimeColorPanel() {
  clearHoveredPersonSourceRowId();
  syncOverviewSpacing(false, false, false, true);
  overviewDefaultEls.forEach((element) => {
    element.hidden = true;
  });

  const normalizedRanges = normalizeMapTimeColorRanges(mapTimeColorRanges, { allowEmpty: true });
  if (timeColorConfirmState?.kind === 'remove-range') {
    const hasPendingRange = normalizedRanges.some((range) => range.id === timeColorConfirmState.rangeId);
    if (!hasPendingRange) {
      timeColorConfirmState = null;
    }
  }
  mapTimeColorRanges = normalizedRanges;

  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = 'Kolorowanie według daty';
  selectionCopyEl.textContent = 'Nie wpływa na wyszukiwanie. Zmienia tylko widoczność i kolory punktów na mapie.';
  selectionCopyEl.hidden = false;
  selectionMetaEl.innerHTML = '';
  selectionMetaEl.hidden = true;
  selectionExtraEl.hidden = false;
  selectionExtraEl.innerHTML = `
    <form class="time-filter-panel time-color-tools" data-map-time-color-form>
      <div class="time-color-legend">
        <div class="time-color-legend-head">
          <strong>Oś czasu</strong>
        </div>
        <div class="time-color-legend-body">
          <div class="time-color-legend-chart">
            ${renderMapTimeColorChartMarkup(normalizedRanges)}
          </div>
          <div class="time-color-legend-preview">
            <div class="legend-swatches" data-map-time-color-preview>
              ${renderMapTimeColorPreviewMarkup(normalizedRanges)}
            </div>
          </div>
        </div>
      </div>

      <div class="time-color-ranges" data-map-time-color-ranges>
        ${normalizedRanges.map((range, index) => renderMapTimeColorRangeRow(range, index, normalizedRanges.length)).join('')}
      </div>

      <div class="action-row filter-action-row">
        <button type="button" class="button-strong" data-map-time-color-add>Dodaj zakres</button>
        <button type="button" class="button-muted" data-map-time-color-reset>Przywróć domyślne</button>
      </div>

      <label class="field time-color-date-match-mode-field">
        <span>Filtrowanie dat</span>
        <select data-map-time-color-date-match-mode>
          <option value="payment"${mapTimeColorDateMatchMode === 'payment' ? ' selected' : ''}>Filtruj po dacie wpłaty</option>
          <option value="visit"${mapTimeColorDateMatchMode === 'visit' ? ' selected' : ''}>Filtruj po dacie wizyty</option>
          <option value="paymentThenVisit"${mapTimeColorDateMatchMode === 'paymentThenVisit' ? ' selected' : ''}>Najpierw wpłata, potem wizyta</option>
          <option value="visitThenPayment"${mapTimeColorDateMatchMode === 'visitThenPayment' ? ' selected' : ''}>Najpierw wizyta, potem wpłata</option>
        </select>
        ${shouldShowMapTimeColorDateMatchModeHelper()
          ? '<small class="time-color-range-helper">Druga data jest brana pod uwagę tylko wtedy, gdy pierwsza nie istnieje.</small>'
          : ''}
      </label>

      ${renderMapTimeColorConfirmDialog(normalizedRanges)}
    </form>
  `;
}

function renderMapTimeColorConfirmDialog(ranges = mapTimeColorRanges) {
  if (!timeColorConfirmState) {
    return '';
  }

  if (timeColorConfirmState.kind === 'remove-range') {
    const range = ranges.find((entry) => entry.id === timeColorConfirmState.rangeId);
    if (!range || isMapTimeColorProtectedRange(range)) {
      return '';
    }

    const overlayStyle = getMapTimeColorConfirmOverlayStyle();

    return `
      <div class="time-color-confirm-overlay"${overlayStyle ? ` style="${escapeHtml(overlayStyle)}"` : ''}>
        <div class="time-color-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="time-color-confirm-title">
          <strong id="time-color-confirm-title">Usunąć zakres?</strong>
          <p>Czy na pewno usunąć zakres <strong class="time-color-confirm-range-label">${escapeHtml(range.label || 'Zakres')}?</strong></p>
          <div class="time-color-confirm-actions">
            <button type="button" class="button-muted" data-map-time-color-confirm-cancel>Anuluj</button>
            <button type="button" class="button-strong" data-map-time-color-confirm>Usuń</button>
          </div>
        </div>
      </div>
    `;
  }

  if (timeColorConfirmState.kind === 'reset-defaults') {
    const overlayStyle = getMapTimeColorConfirmOverlayStyle();

    return `
      <div class="time-color-confirm-overlay"${overlayStyle ? ` style="${escapeHtml(overlayStyle)}"` : ''}>
        <div class="time-color-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="time-color-confirm-title">
          <strong id="time-color-confirm-title">Przywrócić domyślne?</strong>
          <p>Czy na pewno przywrócić domyślne zakresy kolorów?</p>
          <div class="time-color-confirm-actions">
            <button type="button" class="button-muted" data-map-time-color-confirm-cancel>Anuluj</button>
            <button type="button" class="button-strong" data-map-time-color-confirm>Przywróć</button>
          </div>
        </div>
      </div>
    `;
  }

  return '';
}

function getMapTimeColorConfirmOverlayStyle() {
  const panelRect = mapInfoPanelEl?.getBoundingClientRect?.();
  const panelWidth = mapInfoPanelEl?.clientWidth || 0;
  const panelHeight = mapInfoPanelEl?.clientHeight || 0;
  if (!panelRect || panelWidth <= 0 || panelHeight <= 0) {
    return '';
  }

  return `top:${Math.round(panelRect.top)}px;left:${Math.round(panelRect.left)}px;width:${Math.round(panelWidth)}px;height:${Math.round(panelHeight)}px;`;
}

function renderMapTimeColorRangeRow(range, index, totalCount) {
  const safeColorLabel = escapeHtml(formatMapTimeColorValueLabel(range.color));
  const isSpecialMatcherRange = isMapTimeColorSpecialMatcherRange(range);
  const isProtectedRange = isMapTimeColorProtectedRange(range);
  const fromBoundary = buildMapTimeColorMiddleBoundaryState(range, 'start');
  const toBoundary = buildMapTimeColorMiddleBoundaryState(range, 'end');
  const hasInvalidDateRange = hasInvalidMapTimeColorMiddleDateRange({
    fromYear: fromBoundary.yearValue,
    fromMonth: fromBoundary.monthValue,
    toYear: toBoundary.yearValue,
    toMonth: toBoundary.monthValue
  });
  const hasMonthOptions = mapDateFilterOptions.length > 0;
  return `
    <article class="time-color-range-card${range.enabled === false ? ' is-disabled' : ''}" data-map-time-color-row-id="${escapeHtml(range.id)}">
      <div class="time-color-range-top">
        <div class="time-color-range-head">
          <div class="time-color-range-title-group" data-map-time-color-title-group="${escapeHtml(range.id)}">
            <label class="time-color-range-title-wrap">
              <input
                class="time-color-range-title-input"
                type="text"
                value="${escapeHtml(range.label)}"
                placeholder="Np. Pilne"
                aria-label="Tytuł zakresu"
                data-map-time-color-field="label"
              />
            </label>
          </div>
        </div>
      </div>

      ${isSpecialMatcherRange
        ? `
          <input type="hidden" value="${escapeHtml(range.mode)}" data-map-time-color-field="mode" />
          <input type="hidden" value="${escapeHtml(fromBoundary.exactDate)}" data-map-time-color-field="dateFrom" />
          <input type="hidden" value="${escapeHtml(toBoundary.exactDate)}" data-map-time-color-field="dateTo" />
        `
        : `
          <div class="time-color-range-middle">
            <div class="time-color-range-middle-group">
              <div class="time-color-range-middle-head">
                <div class="time-color-range-middle-title">Najnowsza data</div>
                <div class="time-color-range-middle-side-title">Ilość dni</div>
              </div>
              <div class="time-color-range-middle-split">
                <div class="time-color-range-middle-side is-left">
                  ${renderMapTimeColorMiddleDateFields({
                    yearFieldName: 'dateToYear',
                    monthFieldName: 'dateToMonth',
                    yearValue: toBoundary.yearValue,
                    monthValue: toBoundary.monthValue,
                    hasMonthOptions,
                    hasInvalidDateRange,
                    disabled: false
                  })}
                </div>
                <div class="time-color-range-middle-side is-right">
                  ${renderMapTimeColorMiddleDaysField({
                    fieldName: 'daysFrom',
                    fieldValue: toBoundary.daysValue,
                    disabled: false
                  })}
                </div>
              </div>
            </div>
            <div class="time-color-range-middle-group">
              <div class="time-color-range-middle-head">
                <div class="time-color-range-middle-title">Najstarsza data</div>
                <div class="time-color-range-middle-side-title">Ilość dni</div>
              </div>
              <div class="time-color-range-middle-split">
                <div class="time-color-range-middle-side is-left">
                  ${renderMapTimeColorMiddleDateFields({
                    yearFieldName: 'dateFromYear',
                    monthFieldName: 'dateFromMonth',
                    yearValue: fromBoundary.yearValue,
                    monthValue: fromBoundary.monthValue,
                    hasMonthOptions,
                    hasInvalidDateRange,
                    disabled: false
                  })}
                </div>
                <div class="time-color-range-middle-side is-right">
                  ${renderMapTimeColorMiddleDaysField({
                    fieldName: 'daysTo',
                    fieldValue: fromBoundary.daysValue,
                    disabled: false
                  })}
                </div>
              </div>
            </div>
            <input type="hidden" value="${escapeHtml(range.mode)}" data-map-time-color-field="mode" />
            <input type="hidden" value="${escapeHtml(fromBoundary.exactDate)}" data-map-time-color-field="dateFrom" />
            <input type="hidden" value="${escapeHtml(toBoundary.exactDate)}" data-map-time-color-field="dateTo" />
          </div>
        `}

      <div class="time-color-range-bottom">
        <div class="time-color-range-meta-grid">
          <input type="hidden" value="${escapeHtml(range.dateField)}" data-map-time-color-field="dateField" />

          <label class="field time-color-range-color-field">
            <span>Kolor</span>
            <div class="time-color-picker-wrap">
              ${renderMapTimeColorMenu({
                color: range.color,
                fieldAttributes: `data-map-time-color-field="color"`,
                ariaLabel: `Kolor zakresu ${range.label || `Zakres ${index + 1}`}`,
                className: 'is-form'
              })}
              <span class="time-color-picker-value">${safeColorLabel}</span>
            </div>
          </label>

          <label class="checkbox-field time-color-range-enabled-toggle">
            <input
              type="checkbox"
              ${range.enabled === false ? '' : 'checked'}
              data-map-time-color-field="enabled"
            />
            <span>Włącz regułę</span>
          </label>

          ${isProtectedRange
            ? ''
            : `
              <button
                type="button"
                class="button-muted time-color-range-remove"
                data-map-time-color-remove="${escapeHtml(range.id)}"
              >
                Usuń
              </button>
            `}
        </div>
      </div>
    </article>
  `;
}

function renderMapTimeColorPreviewMarkup(ranges = mapTimeColorRanges) {
  const normalizedRanges = sortMapTimeColorRangesForTimelineVisualOrder(
    normalizeMapTimeColorRanges(ranges, { allowEmpty: true })
      .filter((range) => range.enabled !== false)
  );
  return normalizedRanges
    .map((range) => `
      <div
        class="legend-chip${range.enabled === false ? ' is-disabled' : ''}"
        style="--swatch-fill: ${escapeHtml(range.color)};"
      >
        <div class="legend-chip-data">
          <div class="legend-value-box">
            ${renderMapTimeColorPreviewField(range, 'left')}
          </div>
          ${isMapTimeColorSpecialMatcherRange(range)
            ? ''
            : `
              <div class="legend-value-box">
                ${renderMapTimeColorPreviewField(range, 'right')}
              </div>
            `}
          <div class="legend-chip-swatch">
            ${renderMapTimeColorMenu({
              color: range.color,
              fieldAttributes: `data-map-time-color-preview-field="color" data-map-time-color-preview-range-id="${escapeHtml(range.id)}"`,
              ariaLabel: `Kolor zakresu ${range.label || ''}`,
              className: 'is-preview'
            })}
          </div>
          <button
            type="button"
            class="button-muted legend-chip-toggle"
            data-map-time-color-preview-disable="${escapeHtml(range.id)}"
          >
            Wyłącz
          </button>
        </div>
      </div>
    `)
    .join('');
}

function renderMapTimeColorMenu(options = {}) {
  const safeColor = normalizeHexColorInputValue(options.color);
  const safeBorderColor = getMapTimeColorSelectionBorderColor(safeColor);
  const fieldAttributes = typeof options.fieldAttributes === 'string' ? options.fieldAttributes.trim() : '';
  const className = typeof options.className === 'string' ? options.className.trim() : '';
  const ariaLabel = typeof options.ariaLabel === 'string' && options.ariaLabel.trim()
    ? options.ariaLabel.trim()
    : 'Kolor zakresu';
  return `
    <details
      class="time-color-menu ${escapeHtml(className)}"
      style="--swatch-fill: ${escapeHtml(safeColor)};${safeBorderColor ? ` --swatch-border: ${escapeHtml(safeBorderColor)};` : ''}"
    >
      <summary class="time-color-menu-trigger" aria-label="${escapeHtml(ariaLabel)}">
        <i class="time-color-menu-fill" aria-hidden="true"></i>
        <span class="time-color-menu-edit" aria-hidden="true">
          <i class="fa-solid fa-pen"></i>
        </span>
      </summary>
      <div class="time-color-menu-popover">
        ${MAP_TIME_COLOR_MENU_PRESETS.map((preset) => `
          <button
            type="button"
            class="time-color-menu-option${preset.value.toLowerCase() === safeColor.toLowerCase() ? ' is-active' : ''}"
            style="--menu-option-fill: ${escapeHtml(preset.value)};${getMapTimeColorSelectionBorderColor(preset.value) ? ` --menu-option-border: ${escapeHtml(getMapTimeColorSelectionBorderColor(preset.value))};` : ''}"
            data-map-time-color-menu-preset="${escapeHtml(preset.value)}"
            title="${escapeHtml(preset.label)}"
            aria-label="${escapeHtml(preset.label)}"
          ></button>
        `).join('')}
        <label
          class="time-color-menu-option time-color-menu-option-more"
          title="Więcej kolorów"
          aria-label="Więcej kolorów"
        >
          <span class="time-color-menu-option-more-icon" aria-hidden="true">
            <i class="fa-solid fa-eyedropper"></i>
          </span>
          <input
            class="time-color-menu-custom-input"
            type="color"
            value="${escapeHtml(safeColor)}"
            ${fieldAttributes}
            aria-label="${escapeHtml(ariaLabel)}"
          />
        </label>
        <button
          type="button"
          class="button-strong time-color-menu-custom-confirm"
          data-map-time-color-menu-custom-confirm
          disabled
        >
          OK
        </button>
      </div>
    </details>
  `;
}

function renderMapTimeColorPreviewField(range, side) {
  const isLeft = side === 'left';
  const isMissingDateRange = isMapTimeColorMissingDateRange(range);
  const isUnmatchedWithDateRange = isMapTimeColorUnmatchedWithDateRange(range);
  const previewDaysValues = buildMapTimeColorPreviewDaysValues(range);
  const fieldName = isLeft ? 'daysTo' : 'daysFrom';
  const fieldValue = isLeft ? previewDaysValues.daysTo : previewDaysValues.daysFrom;
  const fieldPlaceholder = isMissingDateRange
    ? 'brak daty'
    : isUnmatchedWithDateRange
      ? 'poza zakresem'
      : 'brak';
  const fieldSize = Math.max(5, String(fieldValue || fieldPlaceholder).length || 0);
  return `
    <input
      class="legend-value-input"
      type="text"
      value="${escapeHtml(fieldValue || '')}"
      size="${escapeHtml(String(fieldSize))}"
      inputmode="numeric"
      pattern="[0-9]*"
      autocomplete="off"
      spellcheck="false"
      placeholder="${escapeHtml(fieldPlaceholder)}"
      data-map-time-color-preview-field="${fieldName}"
      data-map-time-color-preview-range-id="${escapeHtml(range.id)}"
      ${isMapTimeColorSpecialMatcherRange(range) ? 'disabled' : ''}
    />
    <span class="legend-value-edit-icon" aria-hidden="true">
      <i class="fa-solid fa-pen"></i>
    </span>
  `;
}

function renderMapTimeColorChartMarkup(ranges = mapTimeColorRanges) {
  const chartModel = buildMapTimeColorChartModel(ranges);
  if (!chartModel) {
    return '<p class="time-color-chart-empty">Dodaj zakresy, aby zobaczyć wykres czasu.</p>';
  }

  if (chartModel.kind === 'mixed') {
    return `
      <p class="time-color-chart-empty">
        Wykres obsługuje osobno zakresy w dniach albo osobno zakresy po datach.
      </p>
    `;
  }

  return `
    <div
      class="time-color-chart"
      data-map-time-color-chart
      data-oldest-visible-days="${escapeHtml(String(chartModel.oldestVisibleDays ?? ''))}"
      data-newest-visible-days="${escapeHtml(String(chartModel.newestVisibleDays ?? ''))}"
      data-chart-max-days="${escapeHtml(String(chartModel.chartMaxDays ?? ''))}"
      data-newest-range-days="${escapeHtml(String(chartModel.newestRangeDays ?? ''))}"
    >
    <div class="time-color-chart-plot">
      <div class="time-color-chart-years">
        ${chartModel.yearLabels.map((year) => `
          <span
            class="time-color-chart-year-text"
            style="left: ${escapeHtml(String(year.position))}%;"
          >${escapeHtml(year.label)}</span>
        `).join('')}
      </div>
      <div class="time-color-chart-rows">
        ${chartModel.rows.map((row) => `
          <div class="time-color-chart-row">
            <div class="time-color-chart-track" data-map-time-color-chart-track>
              ${row.isHidden
                ? ''
                : `
                  <div
                    class="time-color-chart-bar${row.isInteractive ? ' time-color-chart-bar-interactive' : ''}${row.isMovable ? ' is-draggable' : ''}${row.isOpenLeft ? ' is-open-left' : ''}${row.isOpenRight ? ' is-open-right' : ''}"
                    data-map-time-color-chart-bar-drag="${row.isMovable ? 'true' : 'false'}"
                    data-map-time-color-range-id="${escapeHtml(row.id)}"
                    style="left: ${escapeHtml(String(row.start))}%; width: ${escapeHtml(String(row.width))}%; --chart-fill: ${escapeHtml(row.color)};"
                  >
                    ${row.isInteractive || row.isOpenLeft || row.isOpenRight || row.touchesRightEdge
                      ? `
                        ${row.isInteractive || row.isOpenLeft
                          ? `
                            <span
                              class="time-color-chart-handle time-color-chart-handle-start${row.isOpenLeft ? ' is-open-left-cap' : ''}${row.isInteractive ? '' : ' is-static'}"
                              ${row.isInteractive ? `data-map-time-color-chart-handle="start" data-map-time-color-range-id="${escapeHtml(row.id)}"` : ''}
                              style="--chart-handle-fill: ${escapeHtml(row.color)};"
                            ></span>
                          `
                          : ''}
                        ${row.isInteractive || row.isOpenRight || row.touchesRightEdge
                          ? `
                            <span
                              class="time-color-chart-handle time-color-chart-handle-end${row.isOpenRight || row.touchesRightEdge ? ' is-open-right-cap' : ''}${row.isInteractive ? '' : ' is-static'}"
                              ${row.isInteractive ? `data-map-time-color-chart-handle="end" data-map-time-color-range-id="${escapeHtml(row.id)}"` : ''}
                              style="--chart-handle-fill: ${escapeHtml(row.color)};"
                            ></span>
                          `
                          : ''}
                      `
                      : ''}
                  </div>
                `}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    <div
      class="time-color-chart-ruler"
      style="--time-color-year-tick-height: ${escapeHtml(String(getMapTimeColorChartYearTickHeight(chartModel.rows.length)))}px;"
    >
      ${chartModel.monthTicks.map((tick) => `
        <span
          class="time-color-chart-tick-wrap${tick.isYearStart ? ' is-year-start' : ''}"
          style="left: ${escapeHtml(String(tick.position))}%;"
        >
          <i
            class="time-color-chart-tick${tick.isYearStart ? ' is-year-start' : ''}"
            aria-hidden="true"
          ></i>
          ${tick.monthLabel ? `<span class="time-color-chart-month-label">${escapeHtml(tick.monthLabel)}</span>` : ''}
        </span>
      `).join('')}
    </div>
    </div>
  `;
}

function formatMapTimeColorRangeStart(range) {
  if (isMapTimeColorMissingDateRange(range)) {
    return 'brak daty';
  }
  if (isMapTimeColorUnmatchedWithDateRange(range)) {
    return 'poza zakresem';
  }

  if (range.mode === 'dates') {
    return buildMapTimeColorEffectiveDateRange(range).dateFrom || 'brak';
  }

  return range.daysFrom ? range.daysFrom : 'brak';
}

function formatMapTimeColorRangeEnd(range) {
  if (isMapTimeColorMissingDateRange(range)) {
    return 'brak daty';
  }
  if (isMapTimeColorUnmatchedWithDateRange(range)) {
    return 'ma date';
  }

  if (range.mode === 'dates') {
    return buildMapTimeColorEffectiveDateRange(range).dateTo || 'brak';
  }

  return range.daysTo ? range.daysTo : 'brak';
}

function buildMapTimeColorChartModel(ranges = mapTimeColorRanges) {
  const normalizedRanges = sortMapTimeColorRangesForDisplay(
    normalizeMapTimeColorRanges(ranges, { allowEmpty: true }).filter((range) => range.enabled !== false)
  );
  if (normalizedRanges.length === 0) {
    return buildEmptyMapTimeColorDateChartModel();
  }

  const chartRelevantRanges = normalizedRanges.filter((range) => !isMapTimeColorSpecialMatcherRange(range));
  if (chartRelevantRanges.length === 0) {
    return buildEmptyMapTimeColorDateChartModel();
  }
  const hasDays = chartRelevantRanges.some((range) => range.mode === 'days');
  const hasDates = chartRelevantRanges.some((range) => range.mode === 'dates');
  if (!hasDays && !hasDates) {
    return buildMapTimeColorDaysChartModel(chartRelevantRanges);
  }
  if (hasDays && hasDates) {
    return { kind: 'mixed' };
  }

  return hasDates
    ? buildMapTimeColorDateChartModel(chartRelevantRanges)
    : buildMapTimeColorDaysChartModel(chartRelevantRanges);
}

function buildEmptyMapTimeColorDateChartModel() {
  const { chartMin, chartMax } = getDefaultMapTimeColorDateChartBounds();

  return {
    kind: 'dates',
    chartMaxDays: null,
    oldestVisibleDays: null,
    newestVisibleDays: null,
    yearLabels: buildMapTimeColorDateYearLabels(chartMin, chartMax),
    monthTicks: buildMapTimeColorDateMonthTicks(chartMin, chartMax),
    rows: []
  };
}

function getDefaultMapTimeColorDateChartBounds() {
  const today = new Date();
  return {
    chartMin: Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 3, 1),
    chartMax: Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)
  };
}

function buildMapTimeColorDaysChartModel(ranges) {
  const numericRanges = ranges.map((range) => {
    if (isMapTimeColorSpecialMatcherRange(range)) {
      return {
        id: range.id,
        color: range.color,
        isHidden: true,
        isOpenLeft: false,
        isOpenRight: false,
        start: null,
        end: null
      };
    }

    const start = range.daysFrom === '' ? 0 : Number(range.daysFrom);
    const end = range.daysTo === '' ? null : Number(range.daysTo);
    return {
      id: range.id,
      color: range.color,
      isHidden: false,
      isOpenLeft: range.daysTo === '',
      isOpenRight: range.daysFrom === '',
      start: Number.isFinite(start) ? start : 0,
      end: Number.isFinite(end) ? end : null
    };
  });

  const visibleNumericRanges = numericRanges.filter((range) => !range.isHidden);
  const finiteValues = visibleNumericRanges.flatMap((range) => [range.start, range.end]).filter(Number.isFinite);
  const maxValue = Math.max(365, ...finiteValues, 0);
  const newestRangeDays = visibleNumericRanges.length
    ? Math.max(0, Math.min(...visibleNumericRanges.map((range) => range.start)))
    : 0;
  const chartMax = maxValue <= 365 ? 365 : maxValue;
  const timelineBounds = buildRelativeDayTimelineBounds(chartMax, timeColorChartViewportOverride, newestRangeDays);

  return {
    kind: 'days',
    chartMaxDays: chartMax,
    newestRangeDays,
    oldestVisibleDays: timelineBounds.oldestVisibleDays,
    newestVisibleDays: timelineBounds.newestVisibleDays,
    yearLabels: buildMapTimeColorDayYearLabels(timelineBounds),
    monthTicks: buildMapTimeColorDayMonthTicks(timelineBounds),
    rows: numericRanges.map((range) => {
      if (range.isHidden) {
        return {
          id: range.id,
          color: range.color,
          start: 0,
          end: 0,
          width: 0,
          sortValue: Number.NEGATIVE_INFINITY,
          isMovable: false,
          isInteractive: false,
          isOpenLeft: false,
          isOpenRight: false,
          touchesRightEdge: false,
          isHidden: true
        };
      }

      const startValue = Math.max(0, Math.min(chartMax, range.start));
      const endValue = range.end == null
        ? chartMax
        : Math.max(startValue, Math.min(chartMax, range.end));
      const startPosition = range.isOpenLeft ? 0 : getRelativeDayChartPosition(endValue, timelineBounds);
      const endPosition = range.isOpenRight ? 100 : getRelativeDayChartPosition(startValue, timelineBounds);
      return {
        id: range.id,
        color: range.color,
        start: startPosition,
        end: endPosition,
        width: Math.max(0, endPosition - startPosition),
        sortValue: startValue,
        isMovable: !range.isOpenLeft && !range.isOpenRight,
        isInteractive: true,
        isOpenLeft: range.isOpenLeft,
        isOpenRight: range.isOpenRight,
        touchesRightEdge: endPosition >= 99.95
      };
    })
  };
}

function buildMapTimeColorDateChartModel(ranges) {
  const dateRanges = ranges.map((range) => {
    if (isMapTimeColorSpecialMatcherRange(range)) {
      return {
        id: range.id,
        color: range.color,
        isHidden: true,
        isInvalid: false,
        isOpenLeft: false,
        isOpenRight: false,
        start: null,
        end: null
      };
    }

    const effectiveDateRange = buildMapTimeColorEffectiveDateRange(range);
    const start = getMapTimeColorRangeDateComparableValue(effectiveDateRange.dateFrom);
    const end = getMapTimeColorRangeDateComparableValue(effectiveDateRange.dateTo);
    const hasYearOnlyStart = Boolean(normalizeDateInputValue(range.dateFrom)) && !normalizeMonthNumberInputValue(range.dateFromMonthDraft);
    const hasYearOnlyEnd = Boolean(normalizeDateInputValue(range.dateTo)) && !normalizeMonthNumberInputValue(range.dateToMonthDraft);
    const isInvalid = Number.isFinite(start) && Number.isFinite(end) && start > end;
    return {
      id: range.id,
      color: range.color,
      isInvalid,
      isOpenLeft: !Number.isFinite(start) || hasYearOnlyStart,
      isOpenRight: !Number.isFinite(end) || hasYearOnlyEnd,
      start,
      end
    };
  });

  const finiteValues = dateRanges
    .filter((range) => !range.isInvalid && !range.isHidden)
    .flatMap((range) => [range.start, range.end])
    .filter(Number.isFinite);
  const defaultChartBounds = getDefaultMapTimeColorDateChartBounds();
  const minValue = finiteValues.length ? Math.min(...finiteValues) : defaultChartBounds.chartMin;
  const maxValue = finiteValues.length ? Math.max(...finiteValues) : defaultChartBounds.chartMax;
  const chartMin = finiteValues.length
    ? addUtcMonths(minValue, -MAP_TIME_CHART_PAST_PADDING_MONTHS)
    : defaultChartBounds.chartMin;
  const chartMax = finiteValues.length
    ? addUtcMonths(maxValue, MAP_TIME_CHART_FUTURE_PADDING_MONTHS)
    : defaultChartBounds.chartMax;

  return {
    kind: 'dates',
    chartMaxDays: null,
    oldestVisibleDays: null,
    newestVisibleDays: null,
    yearLabels: buildMapTimeColorDateYearLabels(chartMin, chartMax),
    monthTicks: buildMapTimeColorDateMonthTicks(chartMin, chartMax),
    rows: dateRanges.map((range) => {
      if (range.isInvalid || range.isHidden) {
        return {
          id: range.id,
          color: range.color,
          start: 0,
          end: 0,
          width: 0,
          sortValue: Number.POSITIVE_INFINITY,
          isInteractive: false,
          isMovable: false,
          isOpenLeft: false,
          isOpenRight: false,
          touchesRightEdge: false,
          isHidden: true
        };
      }

      const startValue = Number.isFinite(range.start) ? range.start : chartMin;
      const endValue = Number.isFinite(range.end) ? range.end : chartMax;
      const normalizedStart = Math.min(startValue, endValue);
      const normalizedEnd = Math.max(startValue, endValue);
      const startPosition = range.isOpenLeft ? 0 : getRelativeChartPosition(normalizedStart, chartMin, chartMax);
      const endPosition = range.isOpenRight ? 100 : getRelativeChartPosition(normalizedEnd, chartMin, chartMax);
      return {
        id: range.id,
        color: range.color,
        start: startPosition,
        end: endPosition,
        width: Math.max(0, endPosition - startPosition),
        sortValue: -normalizedEnd,
        isInteractive: false,
        isMovable: false,
        isOpenLeft: range.isOpenLeft,
        isOpenRight: range.isOpenRight,
        touchesRightEdge: endPosition >= 99.95,
        isHidden: false
      };
    })
  };
}

function applyTimeColorChartDrag(clientX, dragState) {
  const rangeIndex = mapTimeColorRanges.findIndex((entry) => entry.id === dragState.rangeId);
  if (rangeIndex < 0) {
    return null;
  }

  const nextRanges = [...mapTimeColorRanges];
  const range = nextRanges[rangeIndex];
  if (!range || range.mode !== 'days') {
    return null;
  }

  const visibleBounds = getMapTimeColorChartDragVisibleBounds(dragState);
  const pointerPercent = getMapTimeColorChartPointerPercent(clientX, dragState);
  const pointerDays = convertChartPercentToDaysAgo(
    pointerPercent * 100,
    visibleBounds.oldestVisibleDays,
    visibleBounds.newestVisibleDays
  );

  const initialDaysFromFloor = Number.isFinite(dragState.initialDaysFrom) ? dragState.initialDaysFrom : 0;
  let nextDaysFrom = dragState.initialDaysFrom;
  let nextDaysTo = dragState.initialDaysTo;
  const leftOverflowPx = dragState.trackLeft - clientX;
  const rightOverflowPx = clientX - (dragState.trackLeft + dragState.trackWidth);

  if (dragState.dragMode === 'start' && leftOverflowPx >= MAP_TIME_CHART_OPEN_ENDED_TRIGGER_PX) {
    nextDaysTo = null;
  } else if (dragState.dragMode === 'start') {
    const rawDraggedDays = Math.max(0, Math.round(pointerDays));
    const snappedDraggedDays = getSnappedMapTimeColorDayValue(rawDraggedDays, dragState, dragState.rangeId);
    const draggedDays = Number.isFinite(snappedDraggedDays) ? snappedDraggedDays : rawDraggedDays;
    if (draggedDays >= initialDaysFromFloor) {
      nextDaysFrom = dragState.initialDaysFrom;
      nextDaysTo = draggedDays;
    } else {
      nextDaysFrom = draggedDays;
      nextDaysTo = initialDaysFromFloor;
    }
  } else if (dragState.dragMode === 'end') {
    if (rightOverflowPx >= MAP_TIME_CHART_OPEN_ENDED_TRIGGER_PX) {
      nextDaysFrom = null;
    } else {
    const rawDraggedDays = Math.max(0, Math.round(pointerDays));
    const snappedDraggedDays = getSnappedMapTimeColorDayValue(rawDraggedDays, dragState, dragState.rangeId);
    const draggedDays = Number.isFinite(snappedDraggedDays) ? snappedDraggedDays : rawDraggedDays;
    if (Number.isFinite(dragState.initialDaysTo)) {
      if (draggedDays <= dragState.initialDaysTo) {
        nextDaysFrom = draggedDays;
        nextDaysTo = dragState.initialDaysTo;
      } else {
        nextDaysFrom = dragState.initialDaysTo;
        nextDaysTo = draggedDays;
      }
    } else {
      nextDaysFrom = draggedDays;
    }
    }
  } else if (dragState.dragMode === 'range' && Number.isFinite(dragState.initialDaysTo)) {
    const currentPointerDays = convertChartPercentToDaysAgo(
      getMapTimeColorChartPointerPercent(dragState.startClientX, dragState) * 100,
      visibleBounds.oldestVisibleDays,
      visibleBounds.newestVisibleDays
    );
    const deltaDays = Math.round(pointerDays - currentPointerDays);
    const span = Math.max(0, dragState.initialDaysTo - dragState.initialDaysFrom);
    nextDaysFrom = Math.max(0, dragState.initialDaysFrom + deltaDays);
    nextDaysTo = nextDaysFrom + span;

    const snapCandidates = [
      {
        snappedValue: getSnappedMapTimeColorDayValue(nextDaysFrom, dragState, dragState.rangeId),
        sourceValue: nextDaysFrom
      },
      {
        snappedValue: getSnappedMapTimeColorDayValue(nextDaysTo, dragState, dragState.rangeId),
        sourceValue: nextDaysTo
      }
    ].filter((candidate) => Number.isFinite(candidate.snappedValue));

    if (snapCandidates.length > 0) {
      const bestCandidate = snapCandidates.reduce((best, candidate) => {
        if (!best) {
          return candidate;
        }
        return Math.abs(candidate.snappedValue - candidate.sourceValue) < Math.abs(best.snappedValue - best.sourceValue)
          ? candidate
          : best;
      }, null);

      if (bestCandidate) {
        const snapDelta = bestCandidate.snappedValue - bestCandidate.sourceValue;
        nextDaysFrom = Math.max(0, nextDaysFrom + snapDelta);
        nextDaysTo = nextDaysFrom + span;
      }
    }
  }

  if (Number.isFinite(nextDaysTo) && Number.isFinite(nextDaysFrom)) {
    nextDaysTo = Math.max(nextDaysFrom, nextDaysTo);
  }

  nextRanges[rangeIndex] = normalizeMapTimeColorRange({
    ...range,
    daysFrom: Number.isFinite(nextDaysFrom) ? String(Math.max(0, Math.round(nextDaysFrom))) : '',
    daysTo: Number.isFinite(nextDaysTo) ? String(Math.round(nextDaysTo)) : ''
  }, rangeIndex);

  return nextRanges;
}

function convertChartPercentToDaysAgo(percent, oldestVisibleDays, newestVisibleDays) {
  const normalizedPercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const span = oldestVisibleDays - newestVisibleDays;
  if (!Number.isFinite(span) || span <= 0) {
    return 0;
  }

  return oldestVisibleDays - ((normalizedPercent / 100) * span);
}

function getMapTimeColorChartDragVisibleBounds(dragState) {
  if (Number.isFinite(dragState?.chartMaxDays)) {
    const timelineBounds = buildRelativeDayTimelineBounds(
      dragState.chartMaxDays,
      timeColorChartViewportOverride,
      dragState.newestRangeDays
    );
    return {
      oldestVisibleDays: timelineBounds.oldestVisibleDays,
      newestVisibleDays: timelineBounds.newestVisibleDays
    };
  }

  return {
    oldestVisibleDays: dragState?.oldestVisibleDays,
    newestVisibleDays: dragState?.newestVisibleDays
  };
}

function getMapTimeColorChartViewportOverride(clientX, dragState) {
  if (!dragState || !Number.isFinite(dragState.trackLeft) || !Number.isFinite(dragState.trackWidth) || dragState.trackWidth <= 0) {
    return null;
  }

  const leftBoundary = dragState.trackLeft + MAP_TIME_CHART_EDGE_EXPAND_TRIGGER_PX;
  const rightBoundary = dragState.trackLeft + dragState.trackWidth - MAP_TIME_CHART_EDGE_EXPAND_TRIGGER_PX;
  const nextDirection = clientX <= leftBoundary ? 'left' : clientX >= rightBoundary ? 'right' : '';

  if (!nextDirection) {
    dragState.edgeExpandDirection = '';
    dragState.edgeExpandStartedAt = 0;
    return null;
  }

  const now = Date.now();
  if (dragState.edgeExpandDirection !== nextDirection) {
    dragState.edgeExpandDirection = nextDirection;
    dragState.edgeExpandStartedAt = now;
  }

  const elapsed = Math.max(0, now - (dragState.edgeExpandStartedAt || now));
  const extraMonths = getMapTimeColorChartEdgeExpandMonths(elapsed);

  if (!extraMonths) {
    return null;
  }

  if (
    nextDirection === 'right'
    && Number.isFinite(dragState.chartMaxDays)
    && hasMapTimeColorChartReachedRightBoundary(dragState)
  ) {
    return null;
  }

  return {
    pastPaddingMonthsExtra: nextDirection === 'left' ? extraMonths : 0,
    futurePaddingMonthsExtra: nextDirection === 'right' ? extraMonths : 0
  };
}

function getMapTimeColorChartEdgeExpandMonths(elapsedMs) {
  const normalizedElapsedMs = Math.max(0, Number(elapsedMs) || 0);
  if (normalizedElapsedMs <= MAP_TIME_CHART_EDGE_EXPAND_DELAY_MS) {
    return 0;
  }

  const progress = Math.min(
    1,
    (normalizedElapsedMs - MAP_TIME_CHART_EDGE_EXPAND_DELAY_MS) / MAP_TIME_CHART_EDGE_EXPAND_DURATION_MS
  );

  // Ease-in keeps the first movement gentler and avoids visible jumps.
  return progress * progress * MAP_TIME_CHART_EDGE_EXPAND_MAX_MONTHS;
}

function getMapTimeColorChartSnapThresholdDays(trackWidth, oldestVisibleDays, newestVisibleDays) {
  const normalizedTrackWidth = Number(trackWidth);
  const visibleSpanDays = Number(oldestVisibleDays) - Number(newestVisibleDays);
  if (!Number.isFinite(normalizedTrackWidth) || normalizedTrackWidth <= 0 || !Number.isFinite(visibleSpanDays) || visibleSpanDays <= 0) {
    return 0;
  }

  return (visibleSpanDays * MAP_TIME_CHART_SNAP_DISTANCE_PX) / normalizedTrackWidth;
}

function getMapTimeColorRangeSnapPoints(excludedRangeId) {
  const points = [];
  mapTimeColorRanges.forEach((entry) => {
    if (!entry || entry.id === excludedRangeId || entry.mode !== 'days') {
      return;
    }

    const daysFrom = normalizeNonNegativeIntegerInputValue(entry.daysFrom || '0');
    const daysTo = normalizeNonNegativeIntegerInputValue(entry.daysTo);
    if (daysFrom !== '') {
      points.push(Number(daysFrom));
    }
    if (daysTo !== '') {
      points.push(Number(daysTo));
    }
  });
  return points;
}

function getMapTimeColorMonthSnapPoints(oldestVisibleDays, newestVisibleDays) {
  if (!Number.isFinite(oldestVisibleDays) || !Number.isFinite(newestVisibleDays)) {
    return [];
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const visibleStartTimestamp = todayUtc - (oldestVisibleDays * 86400000);
  const visibleEndTimestamp = todayUtc - (newestVisibleDays * 86400000);
  const cursor = new Date(Date.UTC(
    new Date(visibleStartTimestamp).getUTCFullYear(),
    new Date(visibleStartTimestamp).getUTCMonth(),
    1
  ));
  const points = [];

  while (cursor.getTime() <= visibleEndTimestamp) {
    const monthStartTimestamp = cursor.getTime();
    if (monthStartTimestamp >= visibleStartTimestamp) {
      points.push(Math.round((todayUtc - monthStartTimestamp) / 86400000));
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return points;
}

function getSnappedMapTimeColorDayValue(value, dragState, excludedRangeId) {
  const normalizedValue = Number(value);
  if (!Number.isFinite(normalizedValue)) {
    return null;
  }

  const visibleBounds = getMapTimeColorChartDragVisibleBounds(dragState);
  const snapThresholdDays = getMapTimeColorChartSnapThresholdDays(
    dragState.trackWidth,
    visibleBounds.oldestVisibleDays,
    visibleBounds.newestVisibleDays
  );
  if (!Number.isFinite(snapThresholdDays) || snapThresholdDays <= 0) {
    return null;
  }

  let closestPoint = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  [
    ...getMapTimeColorRangeSnapPoints(excludedRangeId),
    ...getMapTimeColorMonthSnapPoints(visibleBounds.oldestVisibleDays, visibleBounds.newestVisibleDays)
  ].forEach((point) => {
    const distance = Math.abs(point - normalizedValue);
    if (distance <= snapThresholdDays && distance < closestDistance) {
      closestPoint = point;
      closestDistance = distance;
    }
  });

  return closestPoint;
}

function getRelativeChartPosition(value, minValue, maxValue) {
  const span = maxValue - minValue;
  if (!Number.isFinite(span) || span <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, ((value - minValue) / span) * 100));
}

function buildRelativeDayTimelineBounds(chartMax, viewportOverride = null, newestRangeDays = 0) {
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const oldestRangeStart = todayUtc - (chartMax * 86400000);
  const normalizedNewestRangeDays = Math.max(0, Number(newestRangeDays) || 0);
  const newestRangeTimestamp = todayUtc - (normalizedNewestRangeDays * 86400000);
  const pastPaddingMonths = MAP_TIME_CHART_PAST_PADDING_MONTHS + Math.max(0, Number(viewportOverride?.pastPaddingMonthsExtra) || 0);
  const futurePaddingMonths = MAP_TIME_CHART_FUTURE_PADDING_MONTHS + Math.max(0, Number(viewportOverride?.futurePaddingMonthsExtra) || 0);
  const timelineStart = addUtcMonths(oldestRangeStart, -pastPaddingMonths);
  const timelineEndBase = normalizedNewestRangeDays > 0 ? newestRangeTimestamp : todayUtc;
  const timelineEnd = Math.min(
    addUtcMonths(timelineEndBase, futurePaddingMonths),
    getMapTimeColorChartMaxTimelineEndTimestamp(todayUtc)
  );
  const oldestVisibleDays = Math.round((todayUtc - timelineStart) / 86400000);
  const newestVisibleDays = Math.round((todayUtc - timelineEnd) / 86400000);
  return {
    chartMax,
    oldestVisibleDays,
    newestVisibleDays,
    timelineStart,
    timelineEnd
  };
}

function getMapTimeColorChartMaxTimelineEndTimestamp(todayUtc = null) {
  const normalizedTodayUtc = Number.isFinite(todayUtc)
    ? todayUtc
    : Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  return addUtcMonths(normalizedTodayUtc, MAP_TIME_CHART_FUTURE_PADDING_MONTHS);
}

function hasMapTimeColorChartReachedRightBoundary(dragState) {
  if (!Number.isFinite(dragState?.chartMaxDays)) {
    return false;
  }

  const timelineBounds = buildRelativeDayTimelineBounds(
    dragState.chartMaxDays,
    timeColorChartViewportOverride,
    dragState.newestRangeDays
  );
  return timelineBounds.timelineEnd >= getMapTimeColorChartMaxTimelineEndTimestamp() - 86400000;
}

function buildMapTimeColorDayMonthTicks(timelineBounds) {
  const ticks = [];
  const startDate = new Date(timelineBounds.timelineStart);
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const monthStep = getMapTimeColorChartMonthTickStep(timelineBounds.timelineStart, timelineBounds.timelineEnd);
  let visibleMonthIndex = 0;
  while (cursor.getTime() <= timelineBounds.timelineEnd) {
    const timestamp = cursor.getTime();
    if (timestamp >= timelineBounds.timelineStart) {
      const isYearStart = cursor.getUTCMonth() === 0;
      const shouldShowTick = isYearStart || (visibleMonthIndex % monthStep === 0);
      if (shouldShowTick) {
        const daysAgo = Math.round((todayUtc - timestamp) / 86400000);
        ticks.push({
          position: getRelativeDayChartPosition(daysAgo, timelineBounds),
          isYearStart,
          yearLabel: isYearStart ? String(cursor.getUTCFullYear()) : '',
          monthLabel: formatMonthRoman(cursor.getUTCMonth() + 1)
        });
      }
      visibleMonthIndex += 1;
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return ticks;
}

function buildMapTimeColorDayYearLabels(timelineBounds) {
  const labels = [];
  const startDate = new Date(timelineBounds.timelineStart);
  const endDate = new Date(timelineBounds.timelineEnd);
  const startYear = startDate.getUTCFullYear();
  const endYear = endDate.getUTCFullYear();

  for (let year = startYear; year <= endYear; year += 1) {
    const yearStart = Date.UTC(year, 0, 1);
    const yearEnd = Date.UTC(year + 1, 0, 1);
    const visibleStart = Math.max(timelineBounds.timelineStart, yearStart);
    const visibleEnd = Math.min(timelineBounds.timelineEnd, yearEnd);
    if (visibleEnd <= visibleStart) {
      continue;
    }

    const midpoint = visibleStart + ((visibleEnd - visibleStart) / 2);
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const daysAgo = Math.round((todayUtc - midpoint) / 86400000);
    labels.push({
      position: getRelativeDayChartPosition(daysAgo, timelineBounds),
      label: String(year)
    });
  }

  return labels;
}

function buildMapTimeColorDateMonthTicks(chartMin, chartMax) {
  const ticks = [];
  const startDate = new Date(chartMin);
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const monthStep = getMapTimeColorChartMonthTickStep(chartMin, chartMax);
  let visibleMonthIndex = 0;
  while (cursor.getTime() <= chartMax) {
    const timestamp = cursor.getTime();
    if (timestamp >= chartMin) {
      const isYearStart = cursor.getUTCMonth() === 0;
      const shouldShowTick = isYearStart || (visibleMonthIndex % monthStep === 0);
      if (shouldShowTick) {
        ticks.push({
          position: getRelativeChartPosition(timestamp, chartMin, chartMax),
          isYearStart,
          yearLabel: isYearStart ? String(cursor.getUTCFullYear()) : '',
          monthLabel: formatMonthRoman(cursor.getUTCMonth() + 1)
        });
      }
      visibleMonthIndex += 1;
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return ticks;
}

function getMapTimeColorChartMonthTickStep(startTimestamp, endTimestamp) {
  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp) || endTimestamp <= startTimestamp) {
    return 1;
  }

  const startDate = new Date(startTimestamp);
  const endDate = new Date(endTimestamp);
  const totalMonths = Math.max(
    1,
    ((endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12)
      + (endDate.getUTCMonth() - startDate.getUTCMonth())
      + 1
  );

  const candidateSteps = [1, 2, 3, 4, 6, 12, 24, 36, 48, 60];
  for (const step of candidateSteps) {
    if (Math.ceil(totalMonths / step) <= MAP_TIME_CHART_MAX_VISIBLE_MONTH_TICKS) {
      return step;
    }
  }

  return Math.max(1, Math.ceil(totalMonths / MAP_TIME_CHART_MAX_VISIBLE_MONTH_TICKS));
}

function buildMapTimeColorDateYearLabels(chartMin, chartMax) {
  const labels = [];
  const startDate = new Date(chartMin);
  const endDate = new Date(chartMax);
  const startYear = startDate.getUTCFullYear();
  const endYear = endDate.getUTCFullYear();

  for (let year = startYear; year <= endYear; year += 1) {
    const yearStart = Date.UTC(year, 0, 1);
    const yearEnd = Date.UTC(year + 1, 0, 1);
    const visibleStart = Math.max(chartMin, yearStart);
    const visibleEnd = Math.min(chartMax, yearEnd);
    if (visibleEnd <= visibleStart) {
      continue;
    }

    const midpoint = visibleStart + ((visibleEnd - visibleStart) / 2);
    labels.push({
      position: getRelativeChartPosition(midpoint, chartMin, chartMax),
      label: String(year)
    });
  }

  return labels;
}

function formatMonthRoman(monthNumber) {
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return numerals[monthNumber - 1] || '';
}

function getMapTimeColorChartYearTickHeight(rowCount) {
  const normalizedRowCount = Math.max(1, Number(rowCount) || 1);
  const rowsHeight = normalizedRowCount * MAP_TIME_CHART_ROW_HEIGHT_PX;
  const rowGaps = Math.max(0, normalizedRowCount - 1) * MAP_TIME_CHART_ROW_GAP_PX;
  return MAP_TIME_CHART_YEAR_TICK_TOP_OVERFLOW_PX
    + MAP_TIME_CHART_YEAR_LABEL_AREA_PX
    + MAP_TIME_CHART_PLOT_GAP_PX
    + rowsHeight
    + rowGaps;
}

function getRelativeDayChartPosition(daysAgo, timelineBounds) {
  const oldestVisibleDays = timelineBounds.oldestVisibleDays;
  const newestVisibleDays = timelineBounds.newestVisibleDays;
  const span = oldestVisibleDays - newestVisibleDays;
  if (!Number.isFinite(span) || span <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, ((oldestVisibleDays - daysAgo) / span) * 100));
}

function addUtcMonths(timestamp, months) {
  const date = new Date(timestamp);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    date.getUTCDate()
  );
}

function renderMapTimeColorRangeSummary(range) {
  const subjectLabel = formatMapTimeColorDateFieldLabel(range.dateField, { short: true });
  if (range.mode === 'dates') {
    const dateDraft = buildMapTimeColorRangeDateDraft(range);
    const fromLabel = formatMapTimeColorDraftBoundaryLabel(dateDraft.fromYear, dateDraft.fromMonth);
    const toLabel = formatMapTimeColorDraftBoundaryLabel(dateDraft.toYear, dateDraft.toMonth);

    if (dateDraft.fromYear && dateDraft.toYear) {
      return `${subjectLabel}: ${fromLabel} do ${toLabel}`;
    }

    if (dateDraft.fromYear) {
      return `${subjectLabel}: od ${fromLabel}`;
    }

    if (dateDraft.toYear) {
      return `${subjectLabel}: do ${toLabel}`;
    }

    return `${subjectLabel}: zakres dat do ustawienia`;
  }

  if (range.daysFrom && range.daysTo) {
    return `${subjectLabel}: ${range.daysFrom}-${range.daysTo} dni`;
  }

  if (range.daysFrom) {
    return `${subjectLabel}: ${range.daysFrom}+ dni`;
  }

  if (range.daysTo) {
    return `${subjectLabel}: do ${range.daysTo} dni`;
  }

  return `${subjectLabel}: prog dni do ustawienia`;
}

function formatMapTimeColorRangeCountLabel(count) {
  if (count === 1) {
    return '1 zakres';
  }

  return `${formatNumber(count)} zakresy`;
}

function applyMapTimeColorMenuValue(menuElement, nextColor, options = {}) {
  if (!menuElement) {
    return;
  }

  const normalizedColor = normalizeHexColorInputValue(nextColor);
  if (!normalizedColor) {
    return;
  }
  const shouldCloseMenu = options?.closeMenu !== false;
  const shouldPersistAsync = options?.persistAsync === true;

  delete menuElement.dataset.pendingColor;

  syncMapTimeColorMenuElement(menuElement, normalizedColor);

  const previewInput = menuElement.querySelector('[data-map-time-color-preview-field="color"]');
  if (previewInput) {
    previewInput.value = normalizedColor;
    updateMapTimeColorRangeFromPreviewField(
      previewInput.getAttribute('data-map-time-color-preview-range-id'),
      'color',
      normalizedColor,
      { persistAsync: shouldPersistAsync }
    );
    if (shouldCloseMenu) {
      menuElement.removeAttribute('open');
    }
    return;
  }

  const formInput = menuElement.querySelector('[data-map-time-color-field="color"]');
  if (!formInput) {
    return;
  }

  formInput.value = normalizedColor;
  const timeColorForm = formInput.closest('[data-map-time-color-form]');
  if (!timeColorForm) {
    return;
  }

  mapTimeColorRanges = readMapTimeColorRangesFromForm(timeColorForm);
  syncTimeColorPreview();
  if (shouldPersistAsync) {
    persistMapTimeColorRangesAsync();
  } else {
    persistMapTimeColorRanges();
  }
  if (shouldCloseMenu) {
    menuElement.removeAttribute('open');
  }
}

function syncMapTimeColorMenuElement(menuElement, colorValue, options = {}) {
  if (!menuElement) {
    return;
  }

  const normalizedColor = normalizeHexColorInputValue(colorValue);
  if (!normalizedColor) {
    return;
  }

  const setAsCurrent = options?.setAsCurrent !== false;
  if (setAsCurrent) {
    menuElement.dataset.currentColor = normalizedColor;
  }
  menuElement.style.setProperty('--swatch-fill', normalizedColor);
  const selectionBorderColor = getMapTimeColorSelectionBorderColor(normalizedColor);
  if (selectionBorderColor) {
    menuElement.style.setProperty('--swatch-border', selectionBorderColor);
  } else {
    menuElement.style.removeProperty('--swatch-border');
  }
  menuElement.querySelectorAll('[data-map-time-color-menu-preset]').forEach((presetButton) => {
    presetButton.classList.toggle(
      'is-active',
      (presetButton.getAttribute('data-map-time-color-menu-preset') || '').toLowerCase() === normalizedColor.toLowerCase()
    );
  });
  updateMapTimeColorMenuPendingState(menuElement);
}

function syncMapTimeColorMiddleBoundaryFields(rowElement, boundary = 'start', options = {}) {
  if (!rowElement) {
    return;
  }

  const normalizedBoundary = boundary === 'end' ? 'end' : 'start';
  const changedFieldName = typeof options?.changedFieldName === 'string' ? options.changedFieldName : '';
  const isEnd = normalizedBoundary === 'end';
  const yearFieldName = isEnd ? 'dateToYear' : 'dateFromYear';
  const monthFieldName = isEnd ? 'dateToMonth' : 'dateFromMonth';
  const daysFieldName = isEnd ? 'daysFrom' : 'daysTo';
  const exactDateFieldName = isEnd ? 'dateTo' : 'dateFrom';
  const yearInput = rowElement.querySelector(`[data-map-time-color-field="${yearFieldName}"]`);
  const monthInput = rowElement.querySelector(`[data-map-time-color-field="${monthFieldName}"]`);
  const daysInput = rowElement.querySelector(`[data-map-time-color-field="${daysFieldName}"]`);
  const exactDateInput = rowElement.querySelector(`[data-map-time-color-field="${exactDateFieldName}"]`);
  const modeInput = rowElement.querySelector('[data-map-time-color-field="mode"]');

  if (changedFieldName === daysFieldName) {
    const normalizedDaysValue = normalizeNonNegativeIntegerInputValue(daysInput?.value);
    if (daysInput) {
      daysInput.value = normalizedDaysValue;
    }

    if (modeInput) {
      modeInput.value = 'days';
    }

    if (!normalizedDaysValue) {
      if (exactDateInput) {
        exactDateInput.value = '';
      }
      return;
    }

    const exactDate = buildMapTimeColorDateFromDaysAgo(normalizedDaysValue);
    if (exactDateInput) {
      exactDateInput.value = exactDate;
    }
    if (yearInput) {
      yearInput.value = extractYearValue(exactDate);
    }
    if (monthInput) {
      monthInput.value = extractMonthNumberValue(exactDate);
    }
    return;
  }

  if (changedFieldName === yearFieldName || changedFieldName === monthFieldName) {
    const resolvedSelection = resolveMapTimeColorMiddleBoundarySelection(normalizedBoundary, {
      year: yearInput?.value,
      month: monthInput?.value
    });
    const exactDate = buildMapTimeColorMiddleBoundaryDate(normalizedBoundary, resolvedSelection);

    if (modeInput) {
      modeInput.value = 'dates';
    }

    if (exactDateInput) {
      exactDateInput.value = exactDate;
    }
    if (yearInput) {
      yearInput.value = resolvedSelection.year;
    }
    if (monthInput) {
      monthInput.value = resolvedSelection.month;
    }
    if (daysInput) {
      daysInput.value = convertMapTimeColorDateToDaysAgo(exactDate);
    }
  }
}

function syncMapTimeColorMiddleRowFields(rowElement, options = {}) {
  const changedFieldName = typeof options?.changedFieldName === 'string' ? options.changedFieldName : '';
  if (!changedFieldName) {
    return;
  }

  if (changedFieldName === 'dateFromYear' || changedFieldName === 'dateFromMonth' || changedFieldName === 'daysTo') {
    syncMapTimeColorMiddleBoundaryFields(rowElement, 'start', { changedFieldName });
  }

  if (changedFieldName === 'dateToYear' || changedFieldName === 'dateToMonth' || changedFieldName === 'daysFrom') {
    syncMapTimeColorMiddleBoundaryFields(rowElement, 'end', { changedFieldName });
  }

  syncMapTimeColorMiddleRowBoundaryOrder(rowElement);
  syncMapTimeColorMiddleRowInvalidState(rowElement);
}

function readMapTimeColorRangesFromForm(formElement) {
  const rowElements = Array.from(formElement.querySelectorAll('[data-map-time-color-row-id]'));
  if (rowElements.length === 0) {
    return [];
  }

  return normalizeMapTimeColorRanges(
    rowElements.map((rowElement, index) => {
      const rowId = rowElement.getAttribute('data-map-time-color-row-id') || `range-${index + 1}`;
      const currentRange = mapTimeColorRanges.find((entry) => entry.id === rowId) || {};
      const nextMode = rowElement.querySelector('[data-map-time-color-field="mode"]')?.value || currentRange.mode || 'days';
      const daysFromValue = rowElement.querySelector('[data-map-time-color-field="daysFrom"]')?.value ?? currentRange.daysFrom ?? '';
      const daysToValue = rowElement.querySelector('[data-map-time-color-field="daysTo"]')?.value ?? currentRange.daysTo ?? '';
      const exactDateFromValue = rowElement.querySelector('[data-map-time-color-field="dateFrom"]')?.value || '';
      const exactDateToValue = rowElement.querySelector('[data-map-time-color-field="dateTo"]')?.value || '';
      const dateFromYearDraft = normalizeYearInputValue(
        rowElement.querySelector('[data-map-time-color-field="dateFromYear"]')?.value || ''
      );
      const dateToYearDraft = normalizeYearInputValue(
        rowElement.querySelector('[data-map-time-color-field="dateToYear"]')?.value || ''
      );
      const dateFromMonthDraft = dateFromYearDraft
        ? normalizeMonthNumberInputValue(
          rowElement.querySelector('[data-map-time-color-field="dateFromMonth"]')?.value || ''
        )
        : '';
      const dateToMonthDraft = dateToYearDraft
        ? normalizeMonthNumberInputValue(
          rowElement.querySelector('[data-map-time-color-field="dateToMonth"]')?.value || ''
        )
        : '';

      return {
        id: rowId,
        label: rowElement.querySelector('[data-map-time-color-field="label"]')?.value || '',
        color: rowElement.querySelector('[data-map-time-color-field="color"]')?.value || currentRange.color || '',
        enabled: rowElement.querySelector('[data-map-time-color-field="enabled"]')?.checked ?? currentRange.enabled !== false,
        matcher: currentRange.matcher,
        mode: nextMode,
        dateField: rowElement.querySelector('[data-map-time-color-field="dateField"]')?.value || currentRange.dateField || 'lastPaymentAt',
        daysFrom: daysFromValue,
        daysTo: daysToValue,
        ...(nextMode === 'dates'
          ? {
            dateFromMonthDraft,
            dateToMonthDraft,
            dateFrom: normalizeDateInputValue(exactDateFromValue),
            dateTo: normalizeDateInputValue(exactDateToValue)
          }
          : {
            dateFromMonthDraft: '',
            dateToMonthDraft: '',
            ...buildMapTimeColorRangeDatesFromDaysValues({
              daysFrom: daysFromValue,
              daysTo: daysToValue
            })
          })
      };
    }),
    { allowEmpty: true }
  );
}

function sortMapTimeColorRangesForDisplay(ranges) {
  return [...normalizeMapTimeColorRanges(ranges, { allowEmpty: true })].sort((left, right) => {
    const leftScore = getMapTimeColorRangeSortScore(left);
    const rightScore = getMapTimeColorRangeSortScore(right);
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    return (left.label || '').localeCompare(right.label || '', 'pl');
  });
}

function sortMapTimeColorRangesForTimelineVisualOrder(ranges) {
  const normalizedRanges = normalizeMapTimeColorRanges(ranges, { allowEmpty: true });
  const specialRanges = normalizedRanges.filter((range) => isMapTimeColorSpecialMatcherRange(range));
  const regularRanges = normalizedRanges
    .filter((range) => !isMapTimeColorSpecialMatcherRange(range))
    .sort((left, right) => {
      const leftBounds = getMapTimeColorRangeTimelineVisualBounds(left);
      const rightBounds = getMapTimeColorRangeTimelineVisualBounds(right);

      if (leftBounds.primary !== rightBounds.primary) {
        return leftBounds.primary - rightBounds.primary;
      }

      if (leftBounds.secondary !== rightBounds.secondary) {
        return leftBounds.secondary - rightBounds.secondary;
      }

      return (left.label || '').localeCompare(right.label || '', 'pl');
    });

  return [...regularRanges, ...specialRanges];
}

function getMapTimeColorRangeTimelineVisualBounds(range) {
  if (!range || isMapTimeColorSpecialMatcherRange(range)) {
    return {
      primary: Number.NEGATIVE_INFINITY,
      secondary: Number.NEGATIVE_INFINITY
    };
  }

  if (range.mode === 'dates') {
    const effectiveDateRange = buildMapTimeColorEffectiveDateRange(range);
    const start = getMapTimeColorRangeDateComparableValue(effectiveDateRange.dateFrom);
    const end = getMapTimeColorRangeDateComparableValue(effectiveDateRange.dateTo);

    return {
      primary: Number.isFinite(start) ? start : Number.NEGATIVE_INFINITY,
      secondary: Number.isFinite(end) ? end : Number.POSITIVE_INFINITY
    };
  }

  const olderDays = range.daysTo === '' ? Number.POSITIVE_INFINITY : Number(range.daysTo);
  const youngerDays = range.daysFrom === '' ? Number.NEGATIVE_INFINITY : Number(range.daysFrom);

  return {
    primary: Number.isFinite(olderDays) ? -olderDays : Number.NEGATIVE_INFINITY,
    secondary: Number.isFinite(youngerDays) ? -youngerDays : Number.POSITIVE_INFINITY
  };
}

function getMapTimeColorRangeSortScore(range) {
  if (isMapTimeColorMissingDateRange(range)) {
    return -Number.MAX_SAFE_INTEGER;
  }
  if (isMapTimeColorUnmatchedWithDateRange(range)) {
    return (-Number.MAX_SAFE_INTEGER) + 1;
  }

  if (range.mode === 'dates') {
    const effectiveDateRange = buildMapTimeColorEffectiveDateRange(range);
    const from = getMapTimeColorRangeDateComparableValue(effectiveDateRange.dateFrom);
    const to = getMapTimeColorRangeDateComparableValue(effectiveDateRange.dateTo);
    if (Number.isFinite(from) && Number.isFinite(to)) {
      return (from + to) / 2;
    }

    if (Number.isFinite(from)) {
      return from;
    }

    if (Number.isFinite(to)) {
      return to;
    }

    return Number.POSITIVE_INFINITY;
  }

  const from = range.daysFrom === '' ? null : Number(range.daysFrom);
  const to = range.daysTo === '' ? null : Number(range.daysTo);
  if (Number.isFinite(from) && Number.isFinite(to)) {
    return (from + to) / 2;
  }

  if (Number.isFinite(from)) {
    return from;
  }

  if (Number.isFinite(to)) {
    return to;
  }

  return Number.POSITIVE_INFINITY;
}

function getMapTimeColorRangeDateComparableValue(value) {
  const normalized = normalizeDateInputValue(value);
  if (!normalized) {
    return null;
  }

  const timestamp = Date.parse(`${normalized}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function updateMapTimeColorRangeFromPreviewField(rangeId, fieldName, fieldValue, options = {}) {
  if (!rangeId || !fieldName) {
    return;
  }

  const rangeIndex = mapTimeColorRanges.findIndex((entry) => entry.id === rangeId);
  if (rangeIndex < 0) {
    return;
  }

  const currentRange = mapTimeColorRanges[rangeIndex];
  const sanitizedFieldValue = sanitizeMapTimeColorPreviewFieldValue(fieldName, fieldValue);
  const nextRange = normalizeMapTimeColorRange(
    buildNextMapTimeColorRangeFromPreviewField(currentRange, fieldName, sanitizedFieldValue),
    rangeIndex
  );

  mapTimeColorRanges = mapTimeColorRanges.map((entry, index) => {
    return index === rangeIndex ? nextRange : entry;
  });
  if (fieldName === 'enabled') {
    persistMapTimeColorRanges();
    paintTimeColorPanel();
    return;
  }

  syncTimeColorPreview({ skipPreviewRerender: true });
  if (options?.persistAsync) {
    persistMapTimeColorRangesAsync();
    return;
  }

  persistMapTimeColorRanges();
}

function buildNextMapTimeColorRangeFromPreviewField(range, fieldName, fieldValue) {
  if (fieldName === 'enabled') {
    return {
      ...range,
      enabled: fieldValue !== 'false'
    };
  }

  if (fieldName === 'daysFrom' || fieldName === 'daysTo') {
    const previewDaysValues = buildMapTimeColorPreviewDaysValues(range);
    const nextDaysFrom = fieldName === 'daysFrom' ? fieldValue : previewDaysValues.daysFrom;
    const nextDaysTo = fieldName === 'daysTo' ? fieldValue : previewDaysValues.daysTo;

    return {
      ...range,
      mode: 'days',
      daysFrom: nextDaysFrom,
      daysTo: nextDaysTo,
      ...buildMapTimeColorRangeDatesFromDaysValues({
        daysFrom: nextDaysFrom,
        daysTo: nextDaysTo
      })
    };
  }

  if (
    fieldName === 'dateFromYear'
    || fieldName === 'dateFromMonth'
    || fieldName === 'dateToYear'
    || fieldName === 'dateToMonth'
  ) {
    const dateDraft = buildMapTimeColorRangeDateDraft(range);
    const nextDraft = {
      ...dateDraft,
      ...(fieldName === 'dateFromYear' ? { fromYear: fieldValue } : {}),
      ...(fieldName === 'dateFromMonth' ? { fromMonth: fieldValue } : {}),
      ...(fieldName === 'dateToYear' ? { toYear: fieldValue } : {}),
      ...(fieldName === 'dateToMonth' ? { toMonth: fieldValue } : {})
    };

    return {
      ...range,
      ...buildMapTimeColorRangeDatesFromDraft(nextDraft)
    };
  }

  return {
    ...range,
    [fieldName]: fieldValue
  };
}

function sanitizeMapTimeColorPreviewFieldValue(fieldName, fieldValue) {
  const normalizedFieldName = typeof fieldName === 'string' ? fieldName : '';
  const normalizedFieldValue = typeof fieldValue === 'string' ? fieldValue : '';

  if (normalizedFieldName === 'daysFrom' || normalizedFieldName === 'daysTo') {
    return normalizedFieldValue.replace(/\D+/g, '');
  }

  if (normalizedFieldName === 'dateFrom' || normalizedFieldName === 'dateTo') {
    return normalizedFieldValue.replace(/[^0-9-]+/g, '').slice(0, 10);
  }

  if (normalizedFieldName === 'dateFromYear' || normalizedFieldName === 'dateToYear') {
    return normalizeYearInputValue(normalizedFieldValue);
  }

  if (normalizedFieldName === 'dateFromMonth' || normalizedFieldName === 'dateToMonth') {
    return normalizeMonthNumberInputValue(normalizedFieldValue);
  }

  if (normalizedFieldName === 'enabled') {
    return normalizedFieldValue === 'false' ? 'false' : 'true';
  }

  return normalizedFieldValue;
}

function getMapTimeColorPreviewFieldValue(range, fieldName) {
  if (!range || !fieldName) {
    return '';
  }

  if (fieldName === 'daysFrom' || fieldName === 'daysTo') {
    const previewDaysValues = buildMapTimeColorPreviewDaysValues(range);
    return fieldName === 'daysFrom' ? previewDaysValues.daysFrom : previewDaysValues.daysTo;
  }

  if (
    fieldName === 'dateFromYear'
    || fieldName === 'dateFromMonth'
    || fieldName === 'dateToYear'
    || fieldName === 'dateToMonth'
  ) {
    const dateDraft = buildMapTimeColorRangeDateDraft(range);
    if (fieldName === 'dateFromYear') {
      return dateDraft.fromYear;
    }
    if (fieldName === 'dateFromMonth') {
      return dateDraft.fromMonth;
    }
    if (fieldName === 'dateToYear') {
      return dateDraft.toYear;
    }
    return dateDraft.toMonth;
  }

  return typeof range[fieldName] === 'string' ? range[fieldName] : '';
}

function syncMapTimeColorPreviewFieldWidths(rootElement = selectionExtraEl) {
  rootElement?.querySelectorAll('.legend-value-input').forEach((input) => {
    const inputValueLength = typeof input.value === 'string' ? input.value.length : 0;
    const placeholderLength = typeof input.placeholder === 'string' ? input.placeholder.length : 0;
    const widthInChars = Math.max(4, inputValueLength, placeholderLength || 0);
    input.setAttribute('size', String(widthInChars));
    input.style.width = `${widthInChars}ch`;
  });
}

function syncTimeColorPreview(options = {}) {
  const skipPreviewRerender = Boolean(options?.skipPreviewRerender);
  if (infoPanelMode !== 'colors') {
    return;
  }

  const chartEl = selectionExtraEl?.querySelector('[data-map-time-color-chart]');
  if (chartEl) {
    chartEl.innerHTML = renderMapTimeColorChartMarkup(mapTimeColorRanges);
  }

  const previewEl = selectionExtraEl?.querySelector('[data-map-time-color-preview]');
  if (previewEl && !skipPreviewRerender) {
    previewEl.innerHTML = renderMapTimeColorPreviewMarkup(mapTimeColorRanges);
  }
  previewEl?.querySelectorAll('[data-map-time-color-preview-field]').forEach((inputElement) => {
    const rangeId = inputElement.getAttribute('data-map-time-color-preview-range-id');
    const fieldName = inputElement.getAttribute('data-map-time-color-preview-field');
    const range = mapTimeColorRanges.find((entry) => entry.id === rangeId);
    if (!range || !fieldName) {
      return;
    }

    if (inputElement instanceof HTMLInputElement && inputElement.type === 'checkbox') {
      inputElement.checked = range.enabled !== false;
    } else {
      inputElement.value = getMapTimeColorPreviewFieldValue(range, fieldName);
    }
    if (fieldName === 'color') {
      syncMapTimeColorMenuElement(inputElement.closest('.time-color-menu'), range.color);
    }
  });
  syncMapTimeColorPreviewFieldWidths(previewEl);

  selectionExtraEl?.querySelectorAll('[data-map-time-color-row-id]').forEach((rowElement) => {
    const rangeId = rowElement.getAttribute('data-map-time-color-row-id');
    const range = mapTimeColorRanges.find((entry) => entry.id === rangeId);
    if (!range) {
      return;
    }

    const labelInputEl = rowElement.querySelector('[data-map-time-color-field="label"]');
    if (labelInputEl && labelInputEl !== document.activeElement) {
      labelInputEl.value = range.label;
    }

    const dateFieldSelectEl = rowElement.querySelector('[data-map-time-color-field="dateField"]');
    if (dateFieldSelectEl) {
      dateFieldSelectEl.value = range.dateField;
    }

    const colorValueEl = rowElement.querySelector('.time-color-picker-value');
    if (colorValueEl) {
      colorValueEl.textContent = formatMapTimeColorValueLabel(range.color);
    }

    const colorInputEl = rowElement.querySelector('[data-map-time-color-field="color"]');
    if (colorInputEl) {
      colorInputEl.value = range.color;
      syncMapTimeColorMenuElement(colorInputEl.closest('.time-color-menu'), range.color);
    }

    const daysFromInputEl = rowElement.querySelector('[data-map-time-color-field="daysFrom"]');
    if (daysFromInputEl) {
      daysFromInputEl.value = buildMapTimeColorMiddleBoundaryState(range, 'end').daysValue;
    }

    const daysToInputEl = rowElement.querySelector('[data-map-time-color-field="daysTo"]');
    if (daysToInputEl) {
      daysToInputEl.value = buildMapTimeColorMiddleBoundaryState(range, 'start').daysValue;
    }

    const dateFromInputEl = rowElement.querySelector('[data-map-time-color-field="dateFrom"]');
    if (dateFromInputEl) {
      dateFromInputEl.value = range.dateFrom;
    }

    const dateToInputEl = rowElement.querySelector('[data-map-time-color-field="dateTo"]');
    if (dateToInputEl) {
      dateToInputEl.value = range.dateTo;
    }

    const dateFromYearInputEl = rowElement.querySelector('[data-map-time-color-field="dateFromYear"]');
    if (dateFromYearInputEl) {
      dateFromYearInputEl.value = buildMapTimeColorMiddleBoundaryState(range, 'start').yearValue;
    }

    const dateFromMonthInputEl = rowElement.querySelector('[data-map-time-color-field="dateFromMonth"]');
    if (dateFromMonthInputEl) {
      dateFromMonthInputEl.value = buildMapTimeColorMiddleBoundaryState(range, 'start').monthValue;
    }

    const dateToYearInputEl = rowElement.querySelector('[data-map-time-color-field="dateToYear"]');
    if (dateToYearInputEl) {
      dateToYearInputEl.value = buildMapTimeColorMiddleBoundaryState(range, 'end').yearValue;
    }

    const dateToMonthInputEl = rowElement.querySelector('[data-map-time-color-field="dateToMonth"]');
    if (dateToMonthInputEl) {
      dateToMonthInputEl.value = buildMapTimeColorMiddleBoundaryState(range, 'end').monthValue;
    }

    const modeInputEl = rowElement.querySelector('[data-map-time-color-field="mode"]');
    if (modeInputEl) {
      modeInputEl.value = range.mode;
    }

    syncMapTimeColorMiddleRowInvalidState(rowElement);
  });
}

function paintFilterPanel() {
  clearHoveredPersonSourceRowId();
  syncOverviewSpacing(false, true);
  overviewDefaultEls.forEach((element) => {
    element.hidden = true;
  });

  const fromMonth = mapDateFilterDraft.fromMonth;
  const fromYear = mapDateFilterDraft.fromYear;
  const toMonth = mapDateFilterDraft.toMonth;
  const toYear = mapDateFilterDraft.toYear;
  const hasMonthOptions = mapDateFilterOptions.length > 0;
  const filteredPeopleLabel = isMapPointsLoading
    ? 'Odświeżanie...'
    : (allPeople.length === 1
      ? '1 osoba została wyszukana'
      : `${formatNumber(allPeople.length)} osób zostało wyszukanych`);
  const isFromMonthActive = hasMonthOptions && Boolean(fromYear);
  const isToMonthActive = hasMonthOptions && Boolean(toYear);
  const hasInvalidDateRange = mapDateFilterHasInvalidRange;
  const hasDraftChanges = hasMapDateFilterDraftChanges();
  const defaultDraft = buildDefaultMapDateFilterDraft();
  const currentVisitType = mapDateFilterDraft.visitType;
  const currentRegion = mapDateFilterDraft.region;
  const currentPostalCode = mapDateFilterDraft.postalCode;
  const currentProducer = mapDateFilterDraft.producer;
  const currentInstallerCompany = mapDateFilterDraft.installerCompany;
  const canResetNewestDate = Boolean(toYear || toMonth);
  const canResetOldestDate = Boolean(fromMonth || fromYear !== defaultDraft.fromYear);
  const canResetVisitType = Boolean(currentVisitType);
  const canResetRegion = Boolean(currentRegion);
  const canResetPostalCode = Boolean(currentPostalCode);
  const canResetProducer = Boolean(currentProducer);
  const canResetInstallerCompany = Boolean(currentInstallerCompany);

  mapDateFilterRenderedCount = allPeople.length > 0
    ? Math.min(allPeople.length, Math.max(mapDateFilterRenderedCount, MAP_DATE_FILTER_BATCH_SIZE))
    : 0;

  selectionHeaderEl.hidden = false;
  selectionTitleEl.textContent = 'Filtr';
  selectionCopyEl.hidden = true;
  selectionMetaEl.innerHTML = `
    <div class="filter-panel-toolbar">
      <strong class="filter-panel-count">${escapeHtml(filteredPeopleLabel)}</strong>
      <button
        type="button"
        class="button-muted filter-panel-reset"
        data-map-date-filter-reset
        ${hasDraftChanges ? '' : 'disabled'}
      >
        Resetuj wszystko
      </button>
    </div>
  `;
  selectionMetaEl.hidden = false;

  const filterResultsMarkup = renderMapDateFilterResults();

  selectionExtraEl.innerHTML = `
    <form class="time-filter-panel" data-map-date-filter-form>
      <div class="filter-date-stack">
        <div class="field filter-date-box">
          <span>Najnowsza data</span>
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
          <button
            type="button"
            class="button-muted filter-panel-section-reset"
            data-map-date-filter-reset-field="newestDate"
            ${canResetNewestDate ? '' : 'disabled'}
          >
            Resetuj
          </button>
        </div>
        <div class="field filter-date-box">
          <span>Najstarsza data</span>
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
          <button
            type="button"
            class="button-muted filter-panel-section-reset"
            data-map-date-filter-reset-field="oldestDate"
            ${canResetOldestDate ? '' : 'disabled'}
          >
            Resetuj
          </button>
        </div>
      </div>

      <div class="map-filter-divider" aria-hidden="true"></div>

      <label class="field filter-date-box">
        <span>Województwo</span>
        <div class="select-wrap">
          <select name="region">
            ${buildMapFilterSelectOptionsMarkup(mapFilterOptions.regions, currentRegion, 'Wszystkie województwa')}
          </select>
        </div>
        <button
          type="button"
          class="button-muted filter-panel-section-reset"
          data-map-date-filter-reset-field="region"
          ${canResetRegion ? '' : 'disabled'}
        >
          Resetuj
        </button>
      </label>

      <label class="field filter-date-box">
        <span>Producent</span>
        <div class="select-wrap">
          <select name="producer">
            ${buildMapFilterSelectOptionsMarkup(mapFilterOptions.producers, currentProducer, 'Wszyscy producenci')}
          </select>
        </div>
        <button
          type="button"
          class="button-muted filter-panel-section-reset"
          data-map-date-filter-reset-field="producer"
          ${canResetProducer ? '' : 'disabled'}
        >
          Resetuj
        </button>
      </label>

      <label class="field filter-date-box">
        <span>Kod pocztowy</span>
        <div class="select-wrap">
          <select name="postalCode">
            ${buildMapFilterSelectOptionsMarkup(mapFilterOptions.postalCodes, currentPostalCode, 'Wszystkie kody')}
          </select>
        </div>
        <button
          type="button"
          class="button-muted filter-panel-section-reset"
          data-map-date-filter-reset-field="postalCode"
          ${canResetPostalCode ? '' : 'disabled'}
        >
          Resetuj
        </button>
      </label>

      <label class="field filter-date-box">
        <span>Typ wizyty</span>
        <div class="select-wrap">
          <select name="visitType">
            ${buildMapFilterSelectOptionsMarkup(mapFilterOptions.visitTypes, currentVisitType, 'Wszystkie typy')}
          </select>
        </div>
        <button
          type="button"
          class="button-muted filter-panel-section-reset"
          data-map-date-filter-reset-field="visitType"
          ${canResetVisitType ? '' : 'disabled'}
        >
          Resetuj
        </button>
      </label>

      <label class="field filter-date-box">
        <span>Firma montująca</span>
        <div class="select-wrap">
          <select name="installerCompany">
            ${buildMapFilterSelectOptionsMarkup(mapFilterOptions.installerCompanies, currentInstallerCompany, 'Wszystkie firmy')}
          </select>
        </div>
        <button
          type="button"
          class="button-muted filter-panel-section-reset"
          data-map-date-filter-reset-field="installerCompany"
          ${canResetInstallerCompany ? '' : 'disabled'}
        >
          Resetuj
        </button>
      </label>
    </form>

  `;

  selectionExtraEl.hidden = false;
}

function renderMapDateFilterResults() {
  if (isMapPointsLoading) {
    return '<p class="empty-state">Trwa odświeżanie wyników filtra dat.</p>';
  }

  if (allPeople.length === 0) {
    return '';
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
      const isVisibleOnMap = allPeople.some((entry) => entry.sourceRowId === person.sourceRowId);
      return `
        <button
          type="button"
          class="person-row map-history-row${isCurrent ? ' is-current' : ''}"
          data-map-filter-source-row-id="${escapeHtml(person.sourceRowId)}"
          data-map-hover-source-row-id="${escapeHtml(person.sourceRowId)}"
        >
          <div class="list-card-heading">
            <strong>${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</strong>
            ${renderMapPersonRowTools(person, { isVisibleOnMap, isCurrent })}
          </div>
          ${renderPersonMetaLine(person, isVisibleOnMap ? 'Widoczna na mapie' : 'Poza bieżącym filtrem mapy')}
        </button>
      `;
    })
    .join('');
}

function renderPersonMetaLine(person, locationLabel = null) {
  const personId = String(person?.sourceRowId || person?.id || 'Brak');
  const parts = [
    `<span class="map-person-meta-id">ID: ${escapeHtml(personId)} <span class="map-person-id-copy" data-map-copy-person-id="${escapeHtml(personId)}" role="button" tabindex="0" aria-label="Kopiuj ID"><i class="fa-regular fa-copy" aria-hidden="true"></i></span></span>`,
    `Ostatnia wpłata: ${escapeHtml(formatDate(person?.lastPaymentAt))}`
  ];

  if (locationLabel) {
    parts.push(escapeHtml(locationLabel));
  }

  return `<span class="map-person-meta-line">${parts.join(' • ')}</span>`;
}

function renderPersonIdKeyValueRow(person) {
  const personId = String(person?.sourceRowId || person?.id || 'Brak');
  return `
    <div class="kv-row">
      <span class="kv-label">ID</span>
      <span class="kv-value">
        <span class="map-kv-id-wrap">
          <span>${escapeHtml(personId)}</span>
          <span
            class="map-person-id-copy"
            data-map-copy-person-id="${escapeHtml(personId)}"
            role="button"
            tabindex="0"
            aria-label="Kopiuj ID"
          >
            <i class="fa-regular fa-copy" aria-hidden="true"></i>
          </span>
        </span>
      </span>
    </div>
  `;
}

function renderMapPersonRowTools(person, options = {}) {
  const sourceRowId = String(person?.sourceRowId || '').trim();
  if (!sourceRowId) {
    return '';
  }

  const isCurrent = options.isCurrent === true;
  const isVisibleOnMap = options.isVisibleOnMap === true;
  const isBookmarked = person?.isBookmarked === true;
  const swatchColor = resolveMapPersonRowSwatchColor(person, { isCurrent, isVisibleOnMap });
  const swatchBorderColor = swatchColor === '#ffffff' ? 'rgba(48, 67, 54, 0.28)' : '';

  return `
    <span class="map-person-row-tools">
      <span
        class="map-person-row-bookmark${isBookmarked ? ' is-active' : ''}"
        data-map-person-bookmark-toggle="${escapeHtml(sourceRowId)}"
        data-map-person-bookmarked="${String(isBookmarked)}"
        aria-label="${isBookmarked ? 'Usuń zakładkę' : 'Dodaj zakładkę'}"
      >
        <i class="${isBookmarked ? 'fa-solid' : 'fa-regular'} fa-bookmark" aria-hidden="true"></i>
      </span>
      <span
        class="map-person-row-color"
        style="--map-person-row-color: ${escapeHtml(swatchColor)}; --map-person-row-color-border: ${escapeHtml(swatchBorderColor)}"
        aria-label="Kolor osoby na mapie"
      ></span>
    </span>
  `;
}

function resolveMapPersonRowSwatchColor(person, options = {}) {
  if (options.isVisibleOnMap !== true) {
    return '#ffffff';
  }

  const markerStyle = buildDefaultPersonMarkerStyle(person);
  return sanitizeMapPersonSwatchColor(markerStyle?.fillColor || DEFAULT_PERSON_MARKER_STYLE.fillColor || '#4db06f');
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
  persistMapPersonSearchQuery();

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
    void loadPoints({
      reason: 'person-search',
      refreshSearchResults: false
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
    void loadPoints({
      reason: 'person-search',
      refreshSearchResults: false
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
  selectionTitleEl.textContent = 'Historia przeglądania';
  selectionCopyEl.textContent = '';
  selectionCopyEl.hidden = true;
  selectionMetaEl.innerHTML = '';
  selectionMetaEl.hidden = true;

  if (historyEntries.length === 0) {
    selectionExtraEl.innerHTML = '<p class="empty-state">Historia wyboru osób jest jeszcze pusta.</p>';
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
              <strong>${escapeHtml(person?.fullName || person?.companyName || 'Ładowanie osoby...')}</strong>
              ${person
                ? renderMapPersonRowTools(person, {
                    isVisibleOnMap: allPeople.some((entry) => entry.sourceRowId === sourceRowId),
                    isCurrent
                  })
                : ''}
            </div>
            ${person
              ? renderPersonMetaLine(
                  person,
                  allPeople.some((entry) => entry.sourceRowId === sourceRowId)
                    ? 'Widoczna na mapie'
                    : 'Poza bieżącym filtrem mapy'
                )
              : `<span class="map-person-meta-line"><span class="map-person-meta-id">ID: ${escapeHtml(String(sourceRowId || 'Brak'))}</span> • Ostatnia wpłata: Brak</span>`}
          </button>
        `;
      })
      .join('')}
  `;
  bindHoverTrackingToRenderedPersonLists();
  selectionExtraEl.hidden = false;
}

function syncOverviewSpacing(
  isHistoryMode,
  isFilterMode = false,
  isSearchMode = false,
  isColorsMode = false,
  isListMode = false,
  isOverlapListMode = false
) {
  overviewViewEl?.classList.toggle('map-info-view-history', Boolean(isHistoryMode));
  overviewViewEl?.classList.toggle('map-info-view-filter', Boolean(isFilterMode));
  overviewViewEl?.classList.toggle('map-info-view-search', Boolean(isSearchMode));
  overviewViewEl?.classList.toggle('map-info-view-colors', Boolean(isColorsMode));
  overviewViewEl?.classList.toggle('map-info-view-list', Boolean(isListMode));
  selectionExtraEl?.classList.toggle('map-selection-cards-history', Boolean(isHistoryMode));
  selectionExtraEl?.classList.toggle('map-selection-cards-filter', Boolean(isFilterMode));
  selectionExtraEl?.classList.toggle('map-selection-cards-search', Boolean(isSearchMode));
  selectionExtraEl?.classList.toggle('map-selection-cards-colors', Boolean(isColorsMode));
  selectionExtraEl?.classList.toggle('map-selection-cards-list', Boolean(isListMode));
  overviewViewEl?.classList.toggle('map-info-view-overlap-list', Boolean(isOverlapListMode));
  selectionExtraEl?.classList.toggle('map-selection-cards-overlap-list', Boolean(isOverlapListMode));
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

function bindLazyLoadingToRenderedPersonListResults() {
  const listElement = selectionExtraEl?.querySelector('[data-map-person-list-results]');
  if (!listElement || listElement.dataset.lazyLoadingBound === 'true') {
    return;
  }

  listElement.dataset.lazyLoadingBound = 'true';
  listElement.addEventListener('scroll', () => {
    void maybeLoadMorePersonListResults(listElement);
  });
}

function bindLazyLoadingToRenderedBookmarkedPersonListResults() {
  const listElement = selectionExtraEl?.querySelector('[data-map-bookmarked-list-results]');
  if (!listElement || listElement.dataset.lazyLoadingBound === 'true') {
    return;
  }

  listElement.dataset.lazyLoadingBound = 'true';
  listElement.addEventListener('scroll', () => {
    void maybeLoadMoreBookmarkedPersonListResults(listElement);
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

async function maybeLoadMorePersonListResults(listElement) {
  if (infoPanelMode !== 'list' || !personListState.hasMore) {
    return;
  }

  const loadedContentHeight = personListState.results.length * getMapListRowStride();
  const viewportBottom = listElement.scrollTop + listElement.clientHeight;
  if (viewportBottom + MAP_PERSON_LIST_SCROLL_THRESHOLD_PX < loadedContentHeight) {
    return;
  }

  appendPersonListResults();
}

async function maybeLoadMoreBookmarkedPersonListResults(listElement) {
  if (infoPanelMode !== 'bookmarked' || !bookmarkedPersonListState.hasMore) {
    return;
  }

  const loadedContentHeight = bookmarkedPersonListState.results.length * getMapBookmarkedListRowStride();
  const viewportBottom = listElement.scrollTop + listElement.clientHeight;
  if (viewportBottom + MAP_PERSON_LIST_SCROLL_THRESHOLD_PX < loadedContentHeight) {
    return;
  }

  appendBookmarkedPersonListResults();
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

function appendPersonListResults() {
  const listElement = selectionExtraEl?.querySelector('[data-map-person-list-results]');
  if (!listElement) {
    paintListPanel();
    return;
  }

  const listSource = getListVisiblePeople();
  const nextRenderedCount = Math.min(listSource.length, personListState.renderedCount + MAP_PERSON_LIST_BATCH_SIZE);
  const items = listSource.slice(personListState.renderedCount, nextRenderedCount);
  if (items.length === 0) {
    return;
  }

  personListState = {
    ...personListState,
    results: listSource.slice(0, nextRenderedCount),
    total: listSource.length,
    isLoading: false,
    hasLoaded: true,
    hasMore: nextRenderedCount < listSource.length,
    renderedCount: nextRenderedCount
  };
  removeMapListResultsTail(listElement);
  listElement.insertAdjacentHTML(
    'beforeend',
    renderPersonListRows(items, getCurrentSelectedPersonSourceRowId())
  );
  syncMapListResultsTail(listElement);
  updateMapListRowHeight(listElement);
  updateMapListCountLabel();
  syncHoveredPersonListRows();
}

function appendBookmarkedPersonListResults() {
  const listElement = selectionExtraEl?.querySelector('[data-map-bookmarked-list-results]');
  if (!listElement) {
    paintBookmarkedListPanel();
    return;
  }

  const bookmarkedPeople = getBookmarkedVisiblePeople();
  const nextRenderedCount = Math.min(
    bookmarkedPeople.length,
    bookmarkedPersonListState.renderedCount + MAP_PERSON_LIST_BATCH_SIZE
  );
  const items = bookmarkedPeople.slice(bookmarkedPersonListState.renderedCount, nextRenderedCount);
  if (items.length === 0) {
    return;
  }

  bookmarkedPersonListState = {
    ...bookmarkedPersonListState,
    results: bookmarkedPeople.slice(0, nextRenderedCount),
    total: bookmarkedPeople.length,
    isLoading: false,
    hasLoaded: true,
    hasMore: nextRenderedCount < bookmarkedPeople.length,
    renderedCount: nextRenderedCount
  };
  removeMapBookmarkedListResultsTail(listElement);
  listElement.insertAdjacentHTML(
    'beforeend',
    renderBookmarkedPersonListRows(items, getCurrentSelectedPersonSourceRowId())
  );
  syncMapBookmarkedListResultsTail(listElement);
  updateMapBookmarkedListRowHeight(listElement);
  updateMapBookmarkedListCountLabel();
  syncHoveredPersonListRows();
}

function updateMapSearchCountLabel() {
  const counterEl = selectionMetaEl?.querySelector('.search-panel-count');
  if (!counterEl) {
    return;
  }

  counterEl.textContent = personSearchState.total === 1
    ? '1 osoba została wyszukana'
    : `${formatNumber(personSearchState.total)} osób zostało wyszukanych`;
}

function updateMapListCountLabel() {
  const counterEl = selectionMetaEl?.querySelector('.list-panel-count');
  if (!counterEl) {
    return;
  }

  counterEl.textContent = personListState.total === 1
    ? '1 osoba została wyszukana'
    : `${formatNumber(personListState.total)} osób zostało wyszukanych`;
}

function updateMapBookmarkedListCountLabel() {
  const counterEl = selectionMetaEl?.querySelector('.list-panel-count-bookmarked');
  if (!counterEl) {
    return;
  }

  counterEl.textContent = bookmarkedPersonListState.total === 1
    ? '1 osoba zapisana'
    : `${formatNumber(bookmarkedPersonListState.total)} osób zapisanych`;
}

function showMapSearchLoadingState(listElement) {
  if (listElement.querySelector('[data-map-search-loading-more]')) {
    return;
  }

  const loading = document.createElement('p');
  loading.className = 'empty-state';
  loading.dataset.mapSearchLoadingMore = 'true';
  loading.textContent = 'Ładowanie kolejnych wyników...';
  listElement.appendChild(loading);
}

function removeMapSearchResultsTail(listElement) {
  removeMapSearchLoadingState(listElement);
  listElement.querySelector('[data-map-search-results-spacer]')?.remove();
}

function removeMapSearchLoadingState(listElement) {
  listElement.querySelector('[data-map-search-loading-more]')?.remove();
}

function removeMapListResultsTail(listElement) {
  listElement.querySelector('[data-map-list-results-spacer]')?.remove();
}

function removeMapBookmarkedListResultsTail(listElement) {
  listElement.querySelector('[data-map-bookmarked-results-spacer]')?.remove();
}

function syncMapSearchResultsTail(listElement) {
  removeMapSearchResultsTail(listElement);
  if (personSearchState.isLoading && personSearchState.hasLoaded) {
    showMapSearchLoadingState(listElement);
  }
  appendMapSearchResultsSpacer(listElement);
}

function syncMapListResultsTail(listElement) {
  removeMapListResultsTail(listElement);
  appendMapListResultsSpacer(listElement);
}

function syncMapBookmarkedListResultsTail(listElement) {
  removeMapBookmarkedListResultsTail(listElement);
  appendMapBookmarkedListResultsSpacer(listElement);
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

function appendMapListResultsSpacer(listElement) {
  const remainingCount = Math.max(0, personListState.total - personListState.results.length);
  if (remainingCount <= 0) {
    return;
  }

  const spacer = document.createElement('div');
  spacer.className = 'results-spacer';
  spacer.dataset.mapListResultsSpacer = 'true';
  spacer.style.height = `${Math.round(remainingCount * getMapListRowStride())}px`;
  spacer.setAttribute('aria-hidden', 'true');
  listElement.appendChild(spacer);
}

function appendMapBookmarkedListResultsSpacer(listElement) {
  const remainingCount = Math.max(0, bookmarkedPersonListState.total - bookmarkedPersonListState.results.length);
  if (remainingCount <= 0) {
    return;
  }

  const spacer = document.createElement('div');
  spacer.className = 'results-spacer';
  spacer.dataset.mapBookmarkedResultsSpacer = 'true';
  spacer.style.height = `${Math.round(remainingCount * getMapBookmarkedListRowStride())}px`;
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

function updateMapListRowHeight(listElement) {
  const rows = Array.from(listElement.querySelectorAll('.person-row'));
  if (rows.length === 0) {
    return;
  }

  const nextHeight = Math.round(rows.reduce((sum, row) => sum + row.offsetHeight, 0) / rows.length);
  if (Number.isFinite(nextHeight) && nextHeight > 0 && nextHeight !== mapListRowHeight) {
    mapListRowHeight = nextHeight;
    const spacer = listElement.querySelector('[data-map-list-results-spacer]');
    if (spacer) {
      const remainingCount = Math.max(0, personListState.total - personListState.results.length);
      spacer.style.height = `${Math.round(remainingCount * getMapListRowStride())}px`;
    }
  }
}

function getMapListRowStride() {
  return mapListRowHeight + MAP_PERSON_LIST_ROW_GAP_PX;
}

function updateMapBookmarkedListRowHeight(listElement) {
  const rows = Array.from(listElement.querySelectorAll('.person-row'));
  if (rows.length === 0) {
    return;
  }

  const nextHeight = Math.round(rows.reduce((sum, row) => sum + row.offsetHeight, 0) / rows.length);
  if (Number.isFinite(nextHeight) && nextHeight > 0 && nextHeight !== mapBookmarkedListRowHeight) {
    mapBookmarkedListRowHeight = nextHeight;
    const spacer = listElement.querySelector('[data-map-bookmarked-results-spacer]');
    if (spacer) {
      const remainingCount = Math.max(0, bookmarkedPersonListState.total - bookmarkedPersonListState.results.length);
      spacer.style.height = `${Math.round(remainingCount * getMapBookmarkedListRowStride())}px`;
    }
  }
}

function getMapBookmarkedListRowStride() {
  return mapBookmarkedListRowHeight + MAP_PERSON_LIST_ROW_GAP_PX;
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
    personListState.results.find((entry) => entry.sourceRowId === sourceRowId) ||
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

function syncPersonMarkerAppearance(marker, sourceRowId, options = {}) {
  if (!marker || !sourceRowId) {
    return;
  }

  const personKey = buildPersonKeyFromSourceRowId(sourceRowId);
  const isActivePerson = activeSelection?.type === 'person' && activeSelection.key === personKey;
  const isHoveredPerson = hoveredPersonSourceRowId === sourceRowId;
  const person = findPersonBySourceRowId(sourceRowId);

  if (typeof marker.setStyle === 'function') {
    const defaultStyle = buildDefaultPersonMarkerStyle(person);
    if (!defaultStyle) {
      peopleLayer?.removeLayer(marker);
      visiblePeopleMarkers.delete(personKey);
      if (activeSelection?.type === 'person' && activeSelection.key === personKey && activeSelection.marker === marker) {
        activeSelection.marker = null;
      }
      return;
    }

    const nextStyle = isHoveredPerson
        ? HOVER_PERSON_MARKER_STYLE
      : isActivePerson
        ? ACTIVE_PERSON_MARKER_STYLE
        : defaultStyle;
    marker.setStyle(nextStyle);
  }

  if (typeof marker.setIcon === 'function' && marker.__personMarkerVariant === 'supplemental') {
    syncSupplementalPersonMarkerIcon(marker, sourceRowId, {
      isActivePerson,
      isHoveredPerson
    });
  }

  if (!options.skipHighlightedOrder) {
    syncHighlightedPersonMarkerOrder();
  }
}

function syncSupplementalPersonMarkerIcon(marker, sourceRowId, state) {
  marker.setIcon(buildSupplementalPersonIcon(sourceRowId));
  if (typeof marker.setZIndexOffset === 'function') {
    marker.setZIndexOffset(state?.isHoveredPerson ? 2200 : state?.isActivePerson ? 1800 : 0);
  }
}

function refreshAllPersonMarkerAppearances() {
  for (const [personKey, marker] of visiblePeopleMarkers.entries()) {
    const person = findPersonBySourceRowId(marker.__personSourceRowId);
    if (!shouldRenderMapTimeColorPersonMarker(person)) {
      peopleLayer?.removeLayer(marker);
      visiblePeopleMarkers.delete(personKey);
      if (activeSelection?.type === 'person' && activeSelection.key === personKey && activeSelection.marker === marker) {
        activeSelection.marker = null;
      }
      continue;
    }

    syncPersonMarkerAppearance(marker, marker.__personSourceRowId, { skipHighlightedOrder: true });
  }

  for (const [personKey, marker] of supplementalPeopleMarkers.entries()) {
    const person = findPersonBySourceRowId(marker.__personSourceRowId);
    if (!shouldRenderMapTimeColorPersonMarker(person)) {
      supplementalPeopleLayer?.removeLayer(marker);
      supplementalPeopleMarkers.delete(personKey);
      if (activeSelection?.type === 'person' && activeSelection.key === personKey && activeSelection.marker === marker) {
        activeSelection.marker = null;
      }
      continue;
    }

    syncPersonMarkerAppearance(marker, marker.__personSourceRowId, { skipHighlightedOrder: true });
  }

  syncSupplementalPeopleMarkers();
  syncHighlightedPersonMarkerOrder();
}

function buildSupplementalPersonIcon(sourceRowId) {
  const size = SUPPLEMENTAL_PERSON_ICON_SIZE;
  const center = size / 2;
  const radius = SUPPLEMENTAL_PERSON_ICON_RADIUS;
  const person = findPersonBySourceRowId(sourceRowId);
  const matchedRange = getMapTimeColorRangeForPerson(person);
  if (!matchedRange) {
    return null;
  }
  const baseFill = matchedRange?.color || DEFAULT_PERSON_MARKER_STYLE.fillColor;
  const strokeColor = HOVER_PERSON_MARKER_STYLE.color;
  const innerStrokeColor = '#d2efff';
  const hatchColor = 'rgba(255,255,255,0.38)';
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
    const person = findPersonBySourceRowId(sourceRowId);
    if (requiredSourceRowIds.has(sourceRowId) && shouldRenderMapTimeColorPersonMarker(person)) {
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
    if (!person || !shouldRenderMapTimeColorPersonMarker(person) || !Number.isFinite(person.lat) || !Number.isFinite(person.lng)) {
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
  if (!shouldRenderMapTimeColorPersonMarker(person)) {
    return null;
  }

  const personKey = buildPersonKey(person);
  let marker = supplementalPeopleMarkers.get(personKey);
  const latLng = [person.lat, person.lng];
  const icon = buildSupplementalPersonIcon(person.sourceRowId);
  if (!icon) {
    return null;
  }

  if (!marker) {
    marker = L.marker(latLng, {
      icon,
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
  marker.setIcon(icon);
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
