const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appApi', {
  getVersion: () => process.versions.electron,
  checkNow: () => ipcRenderer.invoke('updater:checkNow'),
  installNow: () => ipcRenderer.invoke('updater:installNow'),
  getMapPoints: () => ipcRenderer.invoke('map:getPoints'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('updater:status', (_, message) => callback(message));
  }
});
