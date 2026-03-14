const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updaterSplashApi', {
  getState: () => ipcRenderer.invoke('updaterSplash:getState'),
  onStatus: (callback) => {
    ipcRenderer.on('updater:status', (_event, message) => callback(message));
  },
  onState: (callback) => {
    ipcRenderer.on('updater:state', (_event, state) => callback(state));
  }
});
