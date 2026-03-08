const countryPolygon = [
  { lat: 54.52, lng: 14.12 },
  { lat: 54.58, lng: 15.28 },
  { lat: 54.72, lng: 16.58 },
  { lat: 54.78, lng: 18.75 },
  { lat: 54.47, lng: 19.92 },
  { lat: 54.36, lng: 22.85 },
  { lat: 53.89, lng: 23.88 },
  { lat: 52.95, lng: 23.64 },
  { lat: 51.52, lng: 24.12 },
  { lat: 49.38, lng: 22.84 },
  { lat: 49.05, lng: 22.07 },
  { lat: 49.18, lng: 20.24 },
  { lat: 49.56, lng: 18.81 },
  { lat: 50.31, lng: 17.16 },
  { lat: 50.87, lng: 15.01 },
  { lat: 51.58, lng: 14.61 },
  { lat: 52.82, lng: 14.15 }
];

const mapEl = document.getElementById('poland-map');
const pointsListEl = document.getElementById('points-list');
const fallbackCenter = [52.1, 19.4];
const fallbackZoom = 6;

let mapInstance;
let markerLayer;

function pointInPolygon(point, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const current = polygon[i];
    const previous = polygon[j];
    const intersects =
      current.lat > point.lat !== previous.lat > point.lat &&
      point.lng <
        ((previous.lng - current.lng) * (point.lat - current.lat)) /
          (previous.lat - current.lat) +
          current.lng;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function renderPointsList(points) {
  pointsListEl.replaceChildren();

  points.forEach((point, index) => {
    const item = document.createElement('li');
    item.className = 'point-item';
    item.innerHTML = `
      <span class="point-index">Punkt ${index + 1}</span>
      <span class="point-coords">
        <strong>${point.lat.toFixed(4)}</strong> N,
        <strong>${point.lng.toFixed(4)}</strong> E
      </span>
    `;
    pointsListEl.appendChild(item);
  });
}

function renderScene(points) {
  renderMarkers(points);
  renderPointsList(points);
}

function buildLeafletMap() {
  if (typeof L === 'undefined') {
    mapEl.innerHTML = `
      <div class="map-error">
        Nie udalo sie zaladowac biblioteki mapy. Widok OpenStreetMap wymaga dostepu do internetu.
      </div>
    `;
    return;
  }

  mapInstance = L.map(mapEl, {
    zoomControl: true,
    minZoom: 2,
    maxZoom: 18
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mapInstance);

  markerLayer = L.layerGroup().addTo(mapInstance);
  mapInstance.setView(fallbackCenter, fallbackZoom);
}

function renderMarkers(points) {
  if (!mapInstance || !markerLayer) {
    return;
  }

  markerLayer.clearLayers();

  points.forEach((point, index) => {
    if (!pointInPolygon(point, countryPolygon)) {
      return;
    }

    const marker = L.circleMarker([point.lat, point.lng], {
      radius: 8,
      color: '#9a3412',
      weight: 2,
      fillColor: '#f97316',
      fillOpacity: 0.9
    });

    marker.bindPopup(
      `Punkt ${index + 1}<br>${point.lat.toFixed(4)} N, ${point.lng.toFixed(4)} E`
    );
    markerLayer.addLayer(marker);
  });
}

async function loadPoints() {
  try {
    const points = await window.appApi.getMapPoints();

    if (!Array.isArray(points)) {
      throw new Error('Plik JSON nie zawiera tablicy punktow.');
    }

    return points.filter((point) => pointInPolygon(point, countryPolygon));
  } catch (error) {
    mapEl.innerHTML = `
      <div class="map-error">
        Nie udalo sie wczytac punktow z pliku JSON: ${error.message}
      </div>
    `;
    return [];
  }
}

async function initMapPage() {
  buildLeafletMap();

  const points = await loadPoints();
  renderScene(points);
}

initMapPage();
