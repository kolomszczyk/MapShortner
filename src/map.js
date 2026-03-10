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
const TILE_URL_TEMPLATE = 'maptiles://tiles/{z}/{x}/{y}.png';

let mapInstance;
let peopleLayer;
let customLayer;
let personRenderer;
let markerRenderGeneration = 0;
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
    minZoom: 2,
    maxZoom: 18
  });
  personRenderer = L.canvas({ padding: 0.5 });

  mapInstance.getContainer().classList.add('offline-map');
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

  renderMarkers(payload.people || [], payload.customPoints || []);
}

function focusPoland() {
  mapInstance.fitBounds(POLAND_BOUNDS, {
    padding: [24, 24]
  });
}

function renderMarkers(people, customPoints) {
  peopleLayer.clearLayers();
  customLayer.clearLayers();
  markerRenderGeneration += 1;

  scheduleMarkerRender({
    generation: markerRenderGeneration,
    people,
    customPoints,
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
  if (state.generation !== markerRenderGeneration) {
    return;
  }

  let processed = 0;

  while (state.peopleIndex < state.people.length && processed < MARKER_BATCH_SIZE) {
    const person = state.people[state.peopleIndex];
    state.peopleIndex += 1;

    if (!Number.isFinite(person.lat) || !Number.isFinite(person.lng)) {
      continue;
    }

    const marker = L.circleMarker([person.lat, person.lng], {
      ...DEFAULT_PERSON_MARKER_STYLE,
      renderer: personRenderer
    });
    attachLazyPopup(marker, () => buildPersonPopupHtml(person));

    peopleLayer.addLayer(marker);
    processed += 1;
  }

  while (state.customPointIndex < state.customPoints.length && processed < MARKER_BATCH_SIZE) {
    const point = state.customPoints[state.customPointIndex];
    state.customPointIndex += 1;

    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      continue;
    }

    const marker = L.marker([point.lat, point.lng], {
      title: point.label
    });
    attachLazyPopup(marker, () => buildCustomPointPopupHtml(point));

    customLayer.addLayer(marker);
    processed += 1;
  }

  if (state.peopleIndex < state.people.length || state.customPointIndex < state.customPoints.length) {
    scheduleMarkerRender(state);
  }
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
