const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pixelDesktop", {
  getRuntime: () => ipcRenderer.invoke("pixel:get-runtime"),
  openExternal: (url) => ipcRenderer.invoke("pixel:open-external", url)
});
