import { applySummary, escapeHtml, formatDate, initShell } from './app-shell.js';

initShell('map');

const mapEl = document.getElementById('service-map');

const DEFAULT_PERSON_MARKER_STYLE = {
  radius: 7,
  color: '#23412e',
  weight: 2,
  fillColor: '#4db06f',
  fillOpacity: 0.9
};

let mapInstance;
let peopleLayer;
let customLayer;
let resizeTimer;

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
  await loadPoints();
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
    zoomControl: true,
    minZoom: 5,
    maxZoom: 18
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mapInstance);

  mapInstance.setView([52.1, 19.4], 6);
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

function renderMarkers(people, customPoints) {
  peopleLayer.clearLayers();
  customLayer.clearLayers();

  const bounds = [];

  for (const person of people) {
    if (!Number.isFinite(person.lat) || !Number.isFinite(person.lng)) {
      continue;
    }

    const marker = L.circleMarker([person.lat, person.lng], DEFAULT_PERSON_MARKER_STYLE);
    marker.bindPopup(
      `
        <strong>${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</strong><br>
        ${escapeHtml(person.routeAddress || person.addressText || 'Brak adresu')}<br>
        Ostatnia wizyta: ${escapeHtml(formatDate(person.lastVisitAt))}<br>
        Ostatnia wplata: ${escapeHtml(formatDate(person.lastPaymentAt))}
      `
    );

    peopleLayer.addLayer(marker);
    bounds.push([person.lat, person.lng]);
  }

  for (const point of customPoints) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      continue;
    }

    const marker = L.marker([point.lat, point.lng], {
      title: point.label
    });

    marker.bindPopup(
      `<strong>${escapeHtml(point.label)}</strong><br>${escapeHtml(point.addressText || 'Punkt lokalny')}`
    );

    customLayer.addLayer(marker);
    bounds.push([point.lat, point.lng]);
  }

  if (bounds.length > 0) {
    mapInstance.fitBounds(bounds, {
      padding: [36, 36]
    });
  } else {
    mapInstance.setView([52.1, 19.4], 6);
  }
}
