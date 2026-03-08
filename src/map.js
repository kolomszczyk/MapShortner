import {
  applySummary,
  escapeHtml,
  formatDate,
  formatMoney,
  initShell,
  renderKeyValueList
} from './app-shell.js';

initShell('map');

const mapEl = document.getElementById('service-map');
const pointsSearchInput = document.getElementById('points-search');
const includeUnresolvedCheckbox = document.getElementById('include-unresolved');
const refreshPointsBtn = document.getElementById('refresh-points-btn');
const pointsListEl = document.getElementById('points-list');
const routeForm = document.getElementById('route-form');
const routeResultsEl = document.getElementById('route-results');
const detailTitleEl = document.getElementById('map-detail-title');
const detailMetaEl = document.getElementById('map-detail-meta');
const customPointForm = document.getElementById('custom-point-form');

let mapInstance;
let peopleLayer;
let customLayer;
let routeLayer;
let currentPeople = [];
let currentCustomPoints = [];

bootstrap();

refreshPointsBtn.addEventListener('click', () => loadPoints());
pointsSearchInput.addEventListener('input', () => loadPoints());
includeUnresolvedCheckbox.addEventListener('change', () => loadPoints());

routeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(routeForm);
  try {
    const route = await window.appApi.buildRoute({
      originAddress: form.get('originAddress'),
      originLat: Number(form.get('originLat')),
      originLng: Number(form.get('originLng')),
      lastVisitWeight: Number(form.get('lastVisitWeight')),
      distanceWeight: Number(form.get('distanceWeight')),
      limit: Number(form.get('limit')),
      query: pointsSearchInput.value
    });
    renderRoute(route);
  } catch (error) {
    routeResultsEl.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
});

customPointForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(customPointForm);
  await window.appApi.addCustomPoint({
    label: form.get('label'),
    addressText: form.get('addressText'),
    lat: Number(form.get('lat')),
    lng: Number(form.get('lng'))
  });
  customPointForm.reset();
  await loadPoints();
});

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
  routeLayer = L.layerGroup().addTo(mapInstance);
}

async function loadPoints() {
  const payload = await window.appApi.getMapPoints({
    query: pointsSearchInput.value,
    includeUnresolved: includeUnresolvedCheckbox.checked
  });
  currentPeople = payload.people || [];
  currentCustomPoints = payload.customPoints || [];

  renderPointList();
  renderMarkers();
}

function renderPointList() {
  const combined = [
    ...currentPeople.map((person) => ({ kind: 'person', ...person })),
    ...currentCustomPoints.map((point) => ({ kind: 'custom', ...point }))
  ];

  pointsListEl.innerHTML = combined.length
    ? combined
        .map((entry) =>
          entry.kind === 'person'
            ? `
              <button type="button" class="point-card" data-point-id="${escapeHtml(entry.sourceRowId)}">
                <strong>${escapeHtml(entry.fullName || entry.companyName || 'Bez nazwy')}</strong>
                <span>${escapeHtml(entry.routeAddress || entry.addressText || 'Brak adresu')}</span>
                <span>Wizyta: ${escapeHtml(formatDate(entry.lastVisitAt))}</span>
                <span>Wplata: ${escapeHtml(formatDate(entry.lastPaymentAt))}</span>
              </button>
            `
            : `
              <button type="button" class="point-card point-card-custom" data-custom-point-id="${entry.id}">
                <strong>${escapeHtml(entry.label)}</strong>
                <span>${escapeHtml(entry.addressText || 'Punkt lokalny')}</span>
                <span>${escapeHtml(`${entry.lat.toFixed(4)}, ${entry.lng.toFixed(4)}`)}</span>
              </button>
            `
        )
        .join('')
    : '<p class="empty-state">Brak punktow do wyswietlenia.</p>';

  pointsListEl.querySelectorAll('[data-point-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const personId = button.dataset.pointId;
      const person = currentPeople.find((entry) => entry.sourceRowId === personId);
      if (person) {
        focusMapPoint(person.lat, person.lng);
      }
      await renderPersonDetails(personId);
    });
  });

  pointsListEl.querySelectorAll('[data-custom-point-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const point = currentCustomPoints.find((entry) => String(entry.id) === button.dataset.customPointId);
      if (!point) {
        return;
      }
      focusMapPoint(point.lat, point.lng);
      detailTitleEl.textContent = point.label;
      detailMetaEl.innerHTML = renderKeyValueList([
        { label: 'Adres', value: point.addressText || 'Punkt lokalny' },
        { label: 'Wspolrzedne', value: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` }
      ]);
    });
  });
}

function renderMarkers() {
  if (!mapInstance) {
    return;
  }

  peopleLayer.clearLayers();
  customLayer.clearLayers();
  routeLayer.clearLayers();

  currentPeople.forEach((person) => {
    if (!Number.isFinite(person.lat) || !Number.isFinite(person.lng)) {
      return;
    }

    const marker = L.circleMarker([person.lat, person.lng], {
      radius: 7,
      color: '#23412e',
      weight: 2,
      fillColor: '#4db06f',
      fillOpacity: 0.9
    });
    marker.bindPopup(
      `
        <strong>${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</strong><br>
        ${escapeHtml(person.routeAddress || person.addressText || 'Brak adresu')}<br>
        Ostatnia wizyta: ${escapeHtml(formatDate(person.lastVisitAt))}<br>
        Ostatnia wplata: ${escapeHtml(formatDate(person.lastPaymentAt))}
      `
    );
    marker.on('click', () => {
      renderPersonDetails(person.sourceRowId);
    });
    peopleLayer.addLayer(marker);
  });

  currentCustomPoints.forEach((point) => {
    const marker = L.marker([point.lat, point.lng], {
      title: point.label
    });
    marker.bindPopup(
      `<strong>${escapeHtml(point.label)}</strong><br>${escapeHtml(point.addressText || 'Punkt lokalny')}`
    );
    customLayer.addLayer(marker);
  });
}

async function renderPersonDetails(sourceRowId) {
  const details = await window.appApi.getPersonDetails(sourceRowId);
  if (!details) {
    return;
  }

  detailTitleEl.textContent = details.person.fullName || 'Szczegoly punktu';
  detailMetaEl.innerHTML = renderKeyValueList([
    { label: 'Adres', value: details.person.routeAddress || details.person.addressText },
    { label: 'Telefon', value: details.person.phone },
    { label: 'Ostatnia wizyta', value: formatDate(details.person.lastVisitAt) },
    { label: 'Ostatnia wplata', value: formatDate(details.person.lastPaymentAt) },
    { label: 'Planowana wizyta', value: formatDate(details.person.plannedVisitAt) },
    { label: 'Suma wplat', value: formatMoney(details.person.raw['Suma wpłat']) },
    { label: 'Uwagi', value: details.person.raw.Uwagi || 'Brak' }
  ]);
}

function renderRoute(route) {
  routeLayer.clearLayers();

  const latlngs = [[route.origin.lat, route.origin.lng]];
  route.points.forEach((point) => {
    latlngs.push([point.lat, point.lng]);
  });

  if (latlngs.length > 1) {
    const polyline = L.polyline(latlngs, {
      color: '#c84f23',
      weight: 4,
      opacity: 0.85,
      dashArray: '10 8'
    });
    routeLayer.addLayer(polyline);
    mapInstance.fitBounds(polyline.getBounds().pad(0.15));
  }

  routeResultsEl.innerHTML = route.points.length
    ? route.points
        .map(
          (point, index) => `
            <article class="list-card route-card">
              <div class="list-card-heading">
                <strong>${index + 1}. ${escapeHtml(point.fullName || point.companyName || 'Bez nazwy')}</strong>
                <span>${point.hopDistanceKm.toFixed(1)} km</span>
              </div>
              <p>${escapeHtml(point.routeAddress || point.addressText || 'Brak adresu')}</p>
              <p>Score: ${point.routeScore.toFixed(1)} | Wizyta: ${point.daysSinceVisit} dni</p>
            </article>
          `
        )
        .join('')
    : '<p class="empty-state">Brak punktow do trasy.</p>';
}

function focusMapPoint(lat, lng) {
  if (!mapInstance || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }
  mapInstance.setView([lat, lng], 10, { animate: true });
}
