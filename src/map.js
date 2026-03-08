import {
  applySummary,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatMoney,
  initShell,
  renderKeyValueList
} from './app-shell.js';

initShell('map');

const mapEl = document.getElementById('service-map');
const pointsSearchInput = document.getElementById('points-search');
const includeUnresolvedCheckbox = document.getElementById('include-unresolved');
const refreshPointsBtn = document.getElementById('refresh-points-btn');
const timeFieldSelect = document.getElementById('time-field');
const timeFromInput = document.getElementById('time-from');
const timeToInput = document.getElementById('time-to');
const clearTimeFilterBtn = document.getElementById('clear-time-filter-btn');
const timeFilterSummaryEl = document.getElementById('time-filter-summary');
const showTimeColorsCheckbox = document.getElementById('show-time-colors');
const timeColorLegendEl = document.getElementById('time-color-legend');
const pointsListEl = document.getElementById('points-list');
const routeForm = document.getElementById('route-form');
const routeResultsEl = document.getElementById('route-results');
const detailTitleEl = document.getElementById('map-detail-title');
const detailMetaEl = document.getElementById('map-detail-meta');
const customPointForm = document.getElementById('custom-point-form');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_PERSON_MARKER_STYLE = {
  radius: 7,
  color: '#23412e',
  weight: 2,
  fillColor: '#4db06f',
  fillOpacity: 0.9
};
const MISSING_TIME_COLOR_BUCKET = {
  key: 'missing',
  label: 'Brak daty',
  style: {
    ...DEFAULT_PERSON_MARKER_STYLE,
    color: '#6d7370',
    fillColor: '#c0c6c2'
  }
};
const TIME_COLOR_BUCKETS = [
  {
    key: 'future',
    label: 'Po wczytaniu',
    minDays: Number.NEGATIVE_INFINITY,
    maxDays: -1,
    style: {
      ...DEFAULT_PERSON_MARKER_STYLE,
      color: '#1e4f94',
      fillColor: '#5a8ff0'
    }
  },
  {
    key: 'fresh',
    label: '0-30 dni',
    minDays: 0,
    maxDays: 30,
    style: DEFAULT_PERSON_MARKER_STYLE
  },
  {
    key: 'warm',
    label: '31-90 dni',
    minDays: 31,
    maxDays: 90,
    style: {
      ...DEFAULT_PERSON_MARKER_STYLE,
      color: '#816018',
      fillColor: '#d6b24f'
    }
  },
  {
    key: 'stale',
    label: '91-180 dni',
    minDays: 91,
    maxDays: 180,
    style: {
      ...DEFAULT_PERSON_MARKER_STYLE,
      color: '#8a4d1d',
      fillColor: '#dc8a49'
    }
  },
  {
    key: 'old',
    label: '180+ dni',
    minDays: 181,
    maxDays: Number.POSITIVE_INFINITY,
    style: {
      ...DEFAULT_PERSON_MARKER_STYLE,
      color: '#7c261c',
      fillColor: '#da6053'
    }
  }
];

const TIME_FIELD_META = {
  lastVisitAt: {
    label: 'ostatniej wizyty'
  },
  lastPaymentAt: {
    label: 'ostatniej wplaty'
  },
  plannedVisitAt: {
    label: 'planowanej wizyty'
  }
};

let mapInstance;
let peopleLayer;
let customLayer;
let routeLayer;
let allPeople = [];
let currentPeople = [];
let currentCustomPoints = [];
let hasRoutePreview = false;
let lastImportedAt = '';

window.appApi.onOperationStatus(async (payload) => {
  updateImportReference(payload?.summary);
  if (
    payload?.status === 'completed' &&
    (payload.type === 'import' || payload.type === 'trasa-import' || payload.type === 'geocoding')
  ) {
    await loadPoints();
  }
});

bootstrap();

refreshPointsBtn.addEventListener('click', () => loadPoints());
pointsSearchInput.addEventListener('input', () => loadPoints());
includeUnresolvedCheckbox.addEventListener('change', () => loadPoints());
timeFieldSelect.addEventListener('change', () => applyPointFilters());
timeFromInput.addEventListener('input', () => applyPointFilters());
timeToInput.addEventListener('input', () => applyPointFilters());
showTimeColorsCheckbox.addEventListener('change', () => {
  const timeFilter = getTimeFilter();
  renderTimeColorLegend(timeFilter);
  renderMarkers(timeFilter);
});
clearTimeFilterBtn.addEventListener('click', () => {
  timeFromInput.value = '';
  timeToInput.value = '';
  applyPointFilters();
});

routeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(routeForm);
  const timeFilter = getTimeFilter();
  try {
    const route = await window.appApi.buildRoute({
      originAddress: form.get('originAddress'),
      originLat: Number(form.get('originLat')),
      originLng: Number(form.get('originLng')),
      lastVisitWeight: Number(form.get('lastVisitWeight')),
      distanceWeight: Number(form.get('distanceWeight')),
      limit: Number(form.get('limit')),
      query: pointsSearchInput.value,
      dateField: timeFilter.field,
      dateFrom: timeFilter.from || null,
      dateTo: timeFilter.to || null
    });
    renderRoute(route);
  } catch (error) {
    routeLayer?.clearLayers();
    hasRoutePreview = false;
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
  updateImportReference(bootstrapData.summary);
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
  allPeople = payload.people || [];
  currentCustomPoints = payload.customPoints || [];
  applyPointFilters();
}

function applyPointFilters() {
  const timeFilter = getTimeFilter();
  currentPeople = allPeople.filter((person) => matchesTimeFilter(person, timeFilter));
  syncTimeInputs(timeFilter.field);
  invalidateRoutePreview('Zmieniono filtry punktow. Wylicz trase ponownie.');
  renderTimeFilterSummary(timeFilter);
  renderTimeColorLegend(timeFilter);
  renderPointList();
  renderMarkers(timeFilter);
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

function renderMarkers(timeFilter = getTimeFilter()) {
  if (!mapInstance) {
    return;
  }

  peopleLayer.clearLayers();
  customLayer.clearLayers();

  currentPeople.forEach((person) => {
    if (!Number.isFinite(person.lat) || !Number.isFinite(person.lng)) {
      return;
    }

    const markerColorMeta = getPersonTimeColorMeta(person, timeFilter);
    const marker = L.circleMarker([person.lat, person.lng], markerColorMeta.style);
    marker.bindPopup(
      `
        <strong>${escapeHtml(person.fullName || person.companyName || 'Bez nazwy')}</strong><br>
        ${escapeHtml(person.routeAddress || person.addressText || 'Brak adresu')}<br>
        ${markerColorMeta.description ? `${escapeHtml(markerColorMeta.description)}<br>` : ''}
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

function renderTimeFilterSummary(timeFilter) {
  const bounds = getDateBounds(timeFilter.field);
  const label = TIME_FIELD_META[timeFilter.field]?.label || 'daty';

  if (!bounds) {
    timeFilterSummaryEl.innerHTML = `
      <strong>0 z ${allPeople.length} punktow serwisowych</strong>
      <span>Brak zapisanych dat dla pola ${escapeHtml(label)}.</span>
    `;
    return;
  }

  const selectedRange =
    timeFilter.from || timeFilter.to
      ? `${formatDate(timeFilter.from || bounds.min)} - ${formatDate(timeFilter.to || bounds.max)}`
      : 'Wszystkie daty';

  timeFilterSummaryEl.innerHTML = `
    <strong>${currentPeople.length} z ${allPeople.length} punktow serwisowych</strong>
    <span>Filtr: ${escapeHtml(label)} | Zakres: ${escapeHtml(selectedRange)}</span>
    <span>Dostepne daty: ${escapeHtml(formatDate(bounds.min))} - ${escapeHtml(formatDate(bounds.max))}</span>
  `;
}

function renderTimeColorLegend(timeFilter) {
  if (!timeColorLegendEl) {
    return;
  }

  const label = TIME_FIELD_META[timeFilter.field]?.label || 'wybranego pola czasu';
  if (!showTimeColorsCheckbox?.checked) {
    timeColorLegendEl.innerHTML = `
      <strong>Kolory punktow sa wylaczone.</strong>
      <span>Wlacz opcje, aby kolorowac kropki wzgledem ostatniego wczytania i pola ${escapeHtml(label)}.</span>
    `;
    return;
  }

  if (!normalizeDateKey(lastImportedAt)) {
    timeColorLegendEl.innerHTML = `
      <strong>Brak czasu ostatniego wczytania.</strong>
      <span>Kolory pojawia sie po imporcie danych do SQLite.</span>
    `;
    return;
  }

  const swatches = [...TIME_COLOR_BUCKETS, MISSING_TIME_COLOR_BUCKET]
    .map(
      (bucket) => `
        <span
          class="legend-chip"
          style="--swatch-fill: ${bucket.style.fillColor}; --swatch-border: ${bucket.style.color};"
        >
          <i aria-hidden="true"></i>
          ${escapeHtml(bucket.label)}
        </span>
      `
    )
    .join('');

  timeColorLegendEl.innerHTML = `
    <strong>
      Kolory liczone wzgledem wczytania z ${escapeHtml(formatDateTime(lastImportedAt))}
    </strong>
    <span>Skala porownuje wybrane pole czasu z chwila ostatniego importu danych.</span>
    <div class="legend-swatches">${swatches}</div>
  `;
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
  hasRoutePreview = true;
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

function invalidateRoutePreview(message) {
  routeLayer?.clearLayers();

  if (!hasRoutePreview) {
    return;
  }

  routeResultsEl.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
  hasRoutePreview = false;
}

function getTimeFilter() {
  const field = Object.prototype.hasOwnProperty.call(TIME_FIELD_META, timeFieldSelect.value)
    ? timeFieldSelect.value
    : 'lastVisitAt';
  let from = normalizeDateKey(timeFromInput.value);
  let to = normalizeDateKey(timeToInput.value);

  if (from && to && from > to) {
    [from, to] = [to, from];
  }

  return { field, from, to };
}

function matchesTimeFilter(person, timeFilter) {
  if (!timeFilter.from && !timeFilter.to) {
    return true;
  }

  const pointDate = getDateKey(person?.[timeFilter.field]);
  if (!pointDate) {
    return false;
  }
  if (timeFilter.from && pointDate < timeFilter.from) {
    return false;
  }
  if (timeFilter.to && pointDate > timeFilter.to) {
    return false;
  }
  return true;
}

function syncTimeInputs(field) {
  const bounds = getDateBounds(field);

  timeFromInput.min = bounds?.min || '';
  timeFromInput.max = bounds?.max || '';
  timeToInput.min = bounds?.min || '';
  timeToInput.max = bounds?.max || '';
}

function getDateBounds(field) {
  let min = '';
  let max = '';

  for (const person of allPeople) {
    const value = getDateKey(person?.[field]);
    if (!value) {
      continue;
    }
    if (!min || value < min) {
      min = value;
    }
    if (!max || value > max) {
      max = value;
    }
  }

  return min && max ? { min, max } : null;
}

function getDateKey(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

function normalizeDateKey(value) {
  if (!value) {
    return '';
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : getDateKey(value);
}

function updateImportReference(summary) {
  if (!summary) {
    return;
  }
  lastImportedAt = summary?.importMeta?.imported_at || '';
}

function getPersonTimeColorMeta(person, timeFilter) {
  if (!showTimeColorsCheckbox?.checked || !normalizeDateKey(lastImportedAt)) {
    return {
      style: DEFAULT_PERSON_MARKER_STYLE,
      description: ''
    };
  }

  const daysBeforeImport = getDaysBeforeImport(person?.[timeFilter.field]);
  const bucket = getTimeColorBucket(daysBeforeImport);

  return {
    style: bucket.style,
    description: getTimeColorDescription(bucket)
  };
}

function getTimeColorBucket(daysBeforeImport) {
  if (daysBeforeImport == null) {
    return MISSING_TIME_COLOR_BUCKET;
  }

  return (
    TIME_COLOR_BUCKETS.find(
      (bucket) => daysBeforeImport >= bucket.minDays && daysBeforeImport <= bucket.maxDays
    ) || TIME_COLOR_BUCKETS[TIME_COLOR_BUCKETS.length - 1]
  );
}

function getTimeColorDescription(bucket) {
  if (bucket.key === 'missing') {
    return 'Kolor: brak daty w wybranym polu czasu.';
  }
  if (bucket.key === 'future') {
    return 'Kolor: data wypada po czasie ostatniego wczytania.';
  }
  return `Kolor: ${bucket.label} przed ostatnim wczytaniem.`;
}

function getDaysBeforeImport(value) {
  const pointDateKey = normalizeDateKey(value);
  const importedDateKey = normalizeDateKey(lastImportedAt);

  if (!pointDateKey || !importedDateKey) {
    return null;
  }

  return Math.round((dateKeyToUtcMs(importedDateKey) - dateKeyToUtcMs(pointDateKey)) / MS_PER_DAY);
}

function dateKeyToUtcMs(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function focusMapPoint(lat, lng) {
  if (!mapInstance || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }
  mapInstance.setView([lat, lng], 10, { animate: true });
}
