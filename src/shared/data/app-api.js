export function onOperationStatus(callback) {
  return window.appApi.onOperationStatus(callback);
}

export function getBootstrap() {
  return window.appApi.getBootstrap();
}

export function getImportTables() {
  return window.appApi.getImportTables();
}

export function getTableRows(payload) {
  return window.appApi.getTableRows(payload);
}

export function listPeople(payload) {
  return window.appApi.listPeople(payload);
}

export function getPersonDetails(sourceRowId) {
  return window.appApi.getPersonDetails(sourceRowId);
}

export function addNote(payload) {
  return window.appApi.addNote(payload);
}

export function openPersonInAccess(payload) {
  return window.appApi.accessbrigeladkfjlakgjOpenPerson(payload);
}

export function setPersonBookmark(payload) {
  return window.appApi.setPersonBookmark(payload);
}

export function onTileDownloadState(callback) {
  return window.appApi.onTileDownloadState(callback);
}

export function queueViewportTilePrefetch(payload) {
  return window.appApi.queueViewportTilePrefetch(payload);
}

export function queueHoverTilePrefetch(payload) {
  return window.appApi.queueHoverTilePrefetch(payload);
}

export function getMapPoints(payload) {
  return window.appApi.getMapPoints(payload);
}

export function getMapDateFilterOptions() {
  return window.appApi.getMapDateFilterOptions();
}

export function getMapFilterOptions() {
  return window.appApi.getMapFilterOptions();
}

export function setMapSelectionHistory(payload) {
  return window.appApi.setMapSelectionHistory(payload);
}

export function getMapSelectionHistory() {
  return window.appApi.getMapSelectionHistory();
}