const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timeComparer', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  savePreferences: (preferences) => ipcRenderer.invoke('preferences:save', preferences),
  registerShortcut: (accelerator) => ipcRenderer.invoke('shortcut:register', accelerator),
  setShortcutCapture: (active) => ipcRenderer.send('shortcut:capture', Boolean(active)),
  onSystemTimeZoneChanged: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('system-time-zone-changed', (_event, timeZone) => callback(timeZone));
  },
  hide: () => ipcRenderer.send('window:hide'),
  quit: () => ipcRenderer.send('app:quit'),
});
