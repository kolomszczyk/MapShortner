const { contextBridge, ipcRenderer } = require('electron');
const runtimeMeta = ipcRenderer.sendSync('app:getRuntimeMetaSync');

contextBridge.exposeInMainWorld('appApi', {
  runtimeMeta,
  getBootstrap: () => ipcRenderer.invoke('app:getBootstrap'),
  addOperationLogEntry: (payload) => ipcRenderer.invoke('app:addOperationLogEntry', payload),
  getUpdaterState: () => ipcRenderer.invoke('updater:getState'),
  showUpdateAnnouncement: () => ipcRenderer.invoke('updater:showAnnouncement'),
  hideUpdateAnnouncement: () => ipcRenderer.invoke('updater:hideAnnouncement'),
  checkNow: () => ipcRenderer.invoke('updater:checkNow'),
  simulateUpdater: (payload) => ipcRenderer.invoke('updater:simulate', payload),
  installNow: () => ipcRenderer.invoke('updater:installNow'),
  skipStartupUpdate: () => ipcRenderer.invoke('updater:skipStartup'),
  saveAccessPassword: (password) => ipcRenderer.invoke('settings:saveAccessPassword', password),
  saveGoogleMapsApiKey: (apiKey) => ipcRenderer.invoke('settings:saveGoogleMapsApiKey', apiKey),
  exportTrasaArchive: (payload) => ipcRenderer.invoke('trasa:export', payload),
  importTrasaArchive: () => ipcRenderer.invoke('trasa:import'),
  pickAccessFile: () => ipcRenderer.invoke('access:pickFile'),
  importAccessDatabase: (payload) => ipcRenderer.invoke('access:import', payload),
  runGeocoding: (payload) => ipcRenderer.invoke('geocode:run', payload),
  getDashboardSummary: () => ipcRenderer.invoke('dashboard:getSummary'),
  getTileDownloadState: () => ipcRenderer.invoke('tiles:getState'),
  saveTileDownloadSettings: (payload) => ipcRenderer.invoke('tiles:saveSettings', payload),
  resetTileDownloadSettings: () => ipcRenderer.invoke('tiles:resetSettings'),
  startTileDownload: () => ipcRenderer.invoke('tiles:startDownload'),
  pauseTileDownload: () => ipcRenderer.invoke('tiles:pauseDownload'),
  deleteOfflinePackageTiles: () => ipcRenderer.invoke('tiles:deleteOfflinePackage'),
  deleteExtraCachedTiles: () => ipcRenderer.invoke('tiles:deleteExtraTiles'),
  queueViewportTilePrefetch: (payload) => ipcRenderer.invoke('tiles:queueViewportPrefetch', payload),
  queueHoverTilePrefetch: (payload) => ipcRenderer.invoke('tiles:queueHoverPrefetch', payload),
  getImportTables: () => ipcRenderer.invoke('data:getTables'),
  getTableRows: (payload) => ipcRenderer.invoke('data:getTableRows', payload),
  listPeople: (payload) => ipcRenderer.invoke('people:list', payload),
  getPersonDetails: (sourceRowId) => ipcRenderer.invoke('people:getDetails', sourceRowId),
  getMapPoints: (payload) => ipcRenderer.invoke('map:getPoints', payload),
  getMapDateFilterOptions: () => ipcRenderer.invoke('map:getDateFilterOptions'),
  getMapSelectionHistory: () => ipcRenderer.invoke('map:getSelectionHistory'),
  setMapSelectionHistory: (payload) => ipcRenderer.invoke('map:setSelectionHistory', payload),
  buildRoute: (payload) => ipcRenderer.invoke('route:build', payload),
  addNote: (payload) => ipcRenderer.invoke('notes:add', payload),
  addCustomPoint: (payload) => ipcRenderer.invoke('customPoints:add', payload),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('updater:status', (_event, message) => callback(message));
  },
  onUpdaterState: (callback) => {
    ipcRenderer.on('updater:state', (_event, state) => callback(state));
  },
  onOperationStatus: (callback) => {
    ipcRenderer.on('app:operationStatus', (_event, payload) => callback(payload));
  },
  onOperationLogEntry: (callback) => {
    ipcRenderer.on('app:operationLogEntry', (_event, payload) => callback(payload));
  },
  onTileDownloadState: (callback) => {
    ipcRenderer.on('tiles:state', (_event, payload) => callback(payload));
  }
});
