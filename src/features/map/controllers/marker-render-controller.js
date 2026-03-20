export function createMarkerRenderController(options) {
  const requestAnimationFrameFn =
    options?.requestAnimationFrameFn ||
    ((callback) => requestAnimationFrame(callback));
  const markerBatchSize = Number(options?.markerBatchSize || 250);
  const getMarkerSyncGeneration = options?.getMarkerSyncGeneration || (() => 0);
  const getLeaflet = options?.getLeaflet || (() => options?.leaflet || null);
  const getPersonRenderer = options?.getPersonRenderer || (() => null);
  const buildPersonKey = options?.buildPersonKey || (() => '');
  const buildCustomPointKey = options?.buildCustomPointKey || (() => '');
  const visiblePeopleMarkers = options?.visiblePeopleMarkers;
  const visibleCustomMarkers = options?.visibleCustomMarkers;
  const buildDefaultPersonMarkerStyle = options?.buildDefaultPersonMarkerStyle || (() => null);
  const attachLazyPopup = options?.attachLazyPopup || (() => {});
  const buildPersonPopupHtml = options?.buildPersonPopupHtml || (() => '');
  const buildPersonPopupHtmlAsync = options?.buildPersonPopupHtmlAsync || (() => Promise.resolve(''));
  const onSelectPersonPoint = options?.onSelectPersonPoint || (() => {});
  const getActiveSelection = options?.getActiveSelection || (() => null);
  const setActiveSelectionMarker = options?.setActiveSelectionMarker || (() => {});
  const applyMarkerSelection = options?.applyMarkerSelection || (() => {});
  const getPeopleLayer = options?.getPeopleLayer || (() => null);
  const getCustomLayer = options?.getCustomLayer || (() => null);
  const syncPersonMarkerAppearance = options?.syncPersonMarkerAppearance || (() => {});
  const buildCustomPointPopupHtml = options?.buildCustomPointPopupHtml || (() => '');
  const onSelectCustomPoint = options?.onSelectCustomPoint || (() => {});

  function scheduleMarkerRender(state) {
    requestAnimationFrameFn(() => {
      renderMarkerBatch(state);
    });
  }

  function renderMarkerBatch(state) {
    if (state.generation !== getMarkerSyncGeneration()) {
      return;
    }

    const leaflet = getLeaflet();
    if (!leaflet || !visiblePeopleMarkers || !visibleCustomMarkers) {
      return;
    }

    let processed = 0;

    while (state.peopleIndex < state.people.length && processed < markerBatchSize) {
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

      const marker = leaflet.circleMarker([person.lat, person.lng], {
        ...markerStyle,
        renderer: getPersonRenderer()
      });
      marker.__personSourceRowId = person.sourceRowId;
      attachLazyPopup(marker, () => buildPersonPopupHtml(person), () => {
        void onSelectPersonPoint(person, marker, { panelMode: 'selection' });
      }, {
        buildAsyncHtml: () => buildPersonPopupHtmlAsync(person)
      });

      const activeSelection = getActiveSelection();
      if (activeSelection?.key === key) {
        applyMarkerSelection(marker, 'person');
        setActiveSelectionMarker(marker);
      }

      const peopleLayer = getPeopleLayer();
      peopleLayer?.addLayer(marker);
      visiblePeopleMarkers.set(key, marker);
      syncPersonMarkerAppearance(marker, person.sourceRowId);
      processed += 1;
    }

    while (state.customPointIndex < state.customPoints.length && processed < markerBatchSize) {
      const point = state.customPoints[state.customPointIndex];
      state.customPointIndex += 1;

      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
        continue;
      }

      const key = buildCustomPointKey(point);
      if (visibleCustomMarkers.has(key)) {
        continue;
      }

      const marker = leaflet.marker([point.lat, point.lng], {
        title: point.label
      });
      attachLazyPopup(marker, () => buildCustomPointPopupHtml(point), () => {
        onSelectCustomPoint(point, marker, { panelMode: 'selection' });
      });

      const activeSelection = getActiveSelection();
      if (activeSelection?.key === key) {
        applyMarkerSelection(marker, 'custom');
        setActiveSelectionMarker(marker);
      }

      const customLayer = getCustomLayer();
      customLayer?.addLayer(marker);
      visibleCustomMarkers.set(key, marker);
      processed += 1;
    }

    if (state.peopleIndex < state.people.length || state.customPointIndex < state.customPoints.length) {
      scheduleMarkerRender(state);
    }
  }

  return {
    scheduleMarkerRender,
    renderMarkerBatch
  };
}
