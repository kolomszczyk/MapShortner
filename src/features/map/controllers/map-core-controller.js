export function initializeMapCore(options = {}) {
  const leaflet = options.leaflet;
  const mapElement = options.mapElement;
  if (!mapElement) {
    return null;
  }

  if (typeof leaflet === 'undefined') {
    mapElement.innerHTML = `
      <div class="map-error">
        Nie udalo sie zaladowac biblioteki mapy.
      </div>
    `;
    return null;
  }

  const minZoom = Number(options.minZoom ?? 2);
  const maxZoom = Number(options.maxZoom ?? 18);

  const mapInstance = leaflet.map(mapElement, {
    attributionControl: false,
    preferCanvas: true,
    zoomControl: true,
    scrollWheelZoom: false,
    zoomSnap: options.minWheelZoomSnap,
    zoomDelta: options.buttonZoomStep,
    minZoom,
    maxZoom
  });
  const personRenderer = leaflet.canvas({ padding: 0.5 });

  mapInstance.getContainer().classList.add('offline-map');
  installAcceleratedWheelZoom(mapInstance, {
    mapElement,
    wheelZoomMultiplier: options.wheelZoomMultiplier,
    wheelLineHeightPx: options.wheelLineHeightPx,
    wheelPageHeightFactor: options.wheelPageHeightFactor
  });

  const tileLayer = leaflet.tileLayer(options.buildTileUrlTemplate?.(), {
    keepBuffer: 3,
    minZoom,
    maxZoom,
    updateWhenIdle: false,
    crossOrigin: false
  }).addTo(mapInstance);

  leaflet.control.scale({
    position: 'bottomleft',
    metric: true,
    imperial: false,
    maxWidth: 160
  }).addTo(mapInstance);

  applyInitialMapViewport(mapInstance, {
    restoredMapViewportState: options.restoredMapViewportState,
    polandBounds: options.polandBounds
  });

  const peopleLayer = leaflet.layerGroup().addTo(mapInstance);
  const supplementalPeopleLayer = leaflet.layerGroup().addTo(mapInstance);
  const customLayer = leaflet.layerGroup().addTo(mapInstance);

  mapInstance.on('moveend zoomend', () => {
    options.onMoveEndZoomEnd?.();
  });
  mapInstance.on('mousemove', (event) => {
    options.onMouseMove?.(event?.latlng);
  });
  mapInstance.on('mouseout', () => {
    options.onMouseOut?.();
  });

  requestAnimationFrame(() => {
    mapInstance.invalidateSize();
  });

  return {
    mapInstance,
    tileLayer,
    peopleLayer,
    supplementalPeopleLayer,
    customLayer,
    personRenderer
  };
}

function focusPoland(mapInstance, options = {}) {
  mapInstance.fitBounds(options.polandBounds, {
    padding: [24, 24]
  });
}

function applyInitialMapViewport(mapInstance, options = {}) {
  const restoredMapViewportState = options.restoredMapViewportState;
  if (!restoredMapViewportState) {
    focusPoland(mapInstance, options);
    return;
  }

  mapInstance.setView(
    [restoredMapViewportState.center.lat, restoredMapViewportState.center.lng],
    clampMapZoom(mapInstance, restoredMapViewportState.zoom),
    { animate: false }
  );
}

function installAcceleratedWheelZoom(mapInstance, options = {}) {
  const container = mapInstance.getContainer();
  let lastWheelAt = 0;

  container.addEventListener(
    'wheel',
    (event) => {
      if (!mapInstance._loaded) {
        return;
      }

      event.preventDefault();

      const delta = buildWheelZoomDelta(event, lastWheelAt, container, options);
      lastWheelAt = performance.now();

      if (!delta) {
        return;
      }

      const zoomPoint = mapInstance.mouseEventToContainerPoint(event);
      const nextZoom = clampMapZoom(mapInstance, mapInstance.getZoom() + delta);

      if (Math.abs(nextZoom - mapInstance.getZoom()) < 0.001) {
        return;
      }

      mapInstance.setZoomAround(zoomPoint, nextZoom, false);
    },
    { passive: false }
  );
}

function buildWheelZoomDelta(event, previousWheelAt, container, options = {}) {
  const pixelDeltaY = normalizeWheelDeltaToPixels(
    event.deltaY,
    event.deltaMode,
    container.clientHeight || options.mapElement?.clientHeight || 0,
    options
  );
  const pixelDeltaX = normalizeWheelDeltaToPixels(
    event.deltaX,
    event.deltaMode,
    container.clientWidth || options.mapElement?.clientWidth || 0,
    options
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

  return -Math.sign(dominantDelta) * baseStep * acceleration * Number(options.wheelZoomMultiplier || 1);
}

function normalizeWheelDeltaToPixels(delta, deltaMode, viewportSize, options = {}) {
  if (!delta) {
    return 0;
  }

  if (deltaMode === 1) {
    return delta * Number(options.wheelLineHeightPx || 18);
  }

  if (deltaMode === 2) {
    return delta * Math.max(viewportSize, 1) * Number(options.wheelPageHeightFactor || 0.85);
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
    Math.abs(pixelDeltaX) > 0
    || !Number.isInteger(event.deltaY)
    || !Number.isInteger(event.deltaX)
    || dominantMagnitude < 48
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

function clampMapZoom(mapInstance, zoom) {
  return clampNumber(zoom, mapInstance.getMinZoom(), mapInstance.getMaxZoom());
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
