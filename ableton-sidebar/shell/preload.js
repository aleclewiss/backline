const { contextBridge, ipcRenderer } = require('electron')

// The UI detects window.backline to switch to native behaviors: real file
// drag-out (instead of the drop-bar/staging fallbacks) and window controls.
contextBridge.exposeInMainWorld('backline', {
  shell: true,
  startDrag: (filePath) => ipcRenderer.send('backline:dragout', filePath),
  setAlwaysOnTop: (on) => ipcRenderer.send('backline:always-on-top', on),
  isAlwaysOnTop: () => ipcRenderer.invoke('backline:is-always-on-top'),
  openLogs: () => ipcRenderer.send('backline:open-logs'),
})
