import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("engineDesktop", {
  save: (name: string, text: string | Uint8Array) => ipcRenderer.invoke("save", name, text),
});
