export function createOverlapSelectionController(options) {
  const getMapInstance = options?.getMapInstance || (() => null);
  const getPersonMarkerBySourceRowId =
    options?.getPersonMarkerBySourceRowId ||
    (() => null);
  const getVisiblePeopleMarkers = options?.getVisiblePeopleMarkers || (() => null);
  const getSupplementalPeopleMarkers = options?.getSupplementalPeopleMarkers || (() => null);
  const findPersonBySourceRowId = options?.findPersonBySourceRowId || (() => null);
  const overlapDistancePx = Number(options?.overlapDistancePx || 0);

  function getVisiblePeopleWithOverlappingMarkers(person) {
    const mapInstance = getMapInstance();
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
      if (anchorPoint.distanceTo(markerPoint) <= overlapDistancePx) {
        overlappingSourceRowIds.add(sourceRowId);
      }
    };

    const visiblePeopleMarkers = getVisiblePeopleMarkers();
    const supplementalPeopleMarkers = getSupplementalPeopleMarkers();

    for (const marker of visiblePeopleMarkers?.values?.() || []) {
      considerMarker(marker);
    }
    for (const marker of supplementalPeopleMarkers?.values?.() || []) {
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

  return {
    getVisiblePeopleWithOverlappingMarkers
  };
}
