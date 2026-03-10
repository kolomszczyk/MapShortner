import { applySummary, escapeHtml, formatDate, initShell } from './app-shell.js';

initShell('map');

const mapEl = document.getElementById('service-map');
const settingsButtonEl = document.querySelector('.settings-gear-button');

const DEFAULT_PERSON_MARKER_STYLE = {
  radius: 7,
  color: '#23412e',
  weight: 2,
  fillColor: '#4db06f',
  fillOpacity: 0.9
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

settingsButtonEl?.addEventListener('click', () => {
  window.location.href = './index.html';
});

window.appApi.onOperationStatus(async (payload) => {
  if (payload?.summary) {
    applySummary(payload.summary);
  }

  if (
    payload?.status === 'completed' &&
    (payload.type === 'import' || payload.type === 'trasa-import' || payload.type === 'geocoding')
  ) {
    await loadPoints();
  }
});

bootstrap();

async function bootstrap() {
  const bootstrapData = await window.appApi.getBootstrap();
  applySummary(bootstrapData.summary);
  buildMap();
  requestAnimationFrame(() => {
    loadPoints().catch((error) => {
      console.error('Map points load failed', error);
    });
  });
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
    attachLazyPopup(marker, () => buildPersonPopupHtml(person));

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
    attachLazyPopup(marker, () => buildCustomPointPopupHtml(point));

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

function attachLazyPopup(marker, buildHtml) {
  marker.on('click', () => {
    if (!marker.getPopup()) {
      marker.bindPopup(buildHtml());
    }
    marker.openPopup();
  });
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
