export function isPointVisible(bounds, point) {
  if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) {
    return false;
  }

  return bounds.contains([point.lat, point.lng]);
}

export function buildPersonKey(person) {
  return buildPersonKeyFromSourceRowId(person?.sourceRowId);
}

export function buildPersonKeyFromSourceRowId(sourceRowId) {
  if (!sourceRowId) {
    return '';
  }

  return `person:${sourceRowId}`;
}

export function buildCustomPointKey(point) {
  return `custom:${point.id}`;
}
