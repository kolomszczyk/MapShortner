export function createVisibleMarkerDiffController(options) {
  const getMapInstance = options?.getMapInstance || (() => null);
  const buildPersonKey = options?.buildPersonKey || (() => '');
  const buildCustomPointKey = options?.buildCustomPointKey || (() => '');
  const visiblePeopleMarkers = options?.visiblePeopleMarkers;
  const visibleCustomMarkers = options?.visibleCustomMarkers;
  const getPeopleLayer = options?.getPeopleLayer || (() => null);
  const getCustomLayer = options?.getCustomLayer || (() => null);
  const incrementMarkerSyncGeneration =
    options?.incrementMarkerSyncGeneration || (() => 0);
  const scheduleMarkerRender = options?.scheduleMarkerRender || (() => {});

  function applyVisibleMarkerDiff(nextPeople, nextCustomPoints) {
    if (!getMapInstance() || !visiblePeopleMarkers || !visibleCustomMarkers) {
      return;
    }

    const normalizedPeople = Array.isArray(nextPeople) ? nextPeople : [];
    const normalizedCustomPoints = Array.isArray(nextCustomPoints) ? nextCustomPoints : [];
    const nextVisiblePeopleKeys = new Set(normalizedPeople.map((person) => buildPersonKey(person)));
    const nextVisibleCustomKeys = new Set(normalizedCustomPoints.map((point) => buildCustomPointKey(point)));

    for (const [key, marker] of visiblePeopleMarkers.entries()) {
      if (!nextVisiblePeopleKeys.has(key)) {
        getPeopleLayer()?.removeLayer(marker);
        visiblePeopleMarkers.delete(key);
      }
    }

    for (const [key, marker] of visibleCustomMarkers.entries()) {
      if (!nextVisibleCustomKeys.has(key)) {
        getCustomLayer()?.removeLayer(marker);
        visibleCustomMarkers.delete(key);
      }
    }

    const peopleToAdd = normalizedPeople.filter((person) => !visiblePeopleMarkers.has(buildPersonKey(person)));
    const customPointsToAdd = normalizedCustomPoints.filter(
      (point) => !visibleCustomMarkers.has(buildCustomPointKey(point))
    );

    const generation = incrementMarkerSyncGeneration();
    scheduleMarkerRender({
      generation,
      people: peopleToAdd,
      customPoints: customPointsToAdd,
      peopleIndex: 0,
      customPointIndex: 0
    });
  }

  return {
    applyVisibleMarkerDiff
  };
}
