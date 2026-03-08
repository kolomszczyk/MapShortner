const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appApi', {
  getBootstrap: () => ipcRenderer.invoke('app:getBootstrap'),
  checkNow: () => ipcRenderer.invoke('updater:checkNow'),
  installNow: () => ipcRenderer.invoke('updater:installNow'),
  saveGoogleMapsApiKey: (apiKey) => ipcRenderer.invoke('settings:saveGoogleMapsApiKey', apiKey),
  exportTrasaArchive: (payload) => ipcRenderer.invoke('trasa:export', payload),
  importTrasaArchive: () => ipcRenderer.invoke('trasa:import'),
  pickAccessFile: () => ipcRenderer.invoke('access:pickFile'),
  importAccessDatabase: (payload) => ipcRenderer.invoke('access:import', payload),
  runGeocoding: (payload) => ipcRenderer.invoke('geocode:run', payload),
  getDashboardSummary: () => ipcRenderer.invoke('dashboard:getSummary'),
  getImportTables: () => ipcRenderer.invoke('data:getTables'),
  getTableRows: (payload) => ipcRenderer.invoke('data:getTableRows', payload),
  listPeople: (payload) => ipcRenderer.invoke('people:list', payload),
  getPersonDetails: (sourceRowId) => ipcRenderer.invoke('people:getDetails', sourceRowId),
  getMapPoints: (payload) => ipcRenderer.invoke('map:getPoints', payload),
  buildRoute: (payload) => ipcRenderer.invoke('route:build', payload),
  addNote: (payload) => ipcRenderer.invoke('notes:add', payload),
  addCustomPoint: (payload) => ipcRenderer.invoke('customPoints:add', payload),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('updater:status', (_event, message) => callback(message));
  },
  onOperationStatus: (callback) => {
    ipcRenderer.on('app:operationStatus', (_event, payload) => callback(payload));
  }
});
