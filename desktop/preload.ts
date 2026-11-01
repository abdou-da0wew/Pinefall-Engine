import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("engineDesktop", {
  getGraphics: () => ipcRenderer.invoke("graphics:get"),
  saveGraphics: (value: unknown) => ipcRenderer.invoke("graphics:save", value),
  save: (name: string, text: string | Uint8Array) => ipcRenderer.invoke("save", name, text),
});
