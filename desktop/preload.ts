import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("engineDesktop", {
  save: (name: string, text: string) => ipcRenderer.invoke("save", name, text),
});
