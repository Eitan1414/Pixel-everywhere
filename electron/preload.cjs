const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pixelDesktop", {
  getRuntime: () => ipcRenderer.invoke("pixel:get-runtime"),
  openExternal: (url) => ipcRenderer.invoke("pixel:open-external", url),
  apiRequest: (request) => ipcRenderer.invoke("pixel:api-request", request),
  selectUpdateFile: (request) => ipcRenderer.invoke("pixel:select-update-file", request),
  installUpdate: (request) => ipcRenderer.invoke("pixel:install-update", request),
  onUpdateProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pixel:update-progress", listener);
    return () => ipcRenderer.removeListener("pixel:update-progress", listener);
  }
});
