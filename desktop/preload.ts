import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("engineDesktop", {
  workspace: {
    registerSource: (id: string, path: string, name: string) =>
      ipcRenderer.invoke("workspace:register-source", id, path, name),
    recents: () => ipcRenderer.invoke("workspace:recents"),
    reopen: (id: string) => ipcRenderer.invoke("workspace:reopen", id),
    openFolderArchive: () => ipcRenderer.invoke("workspace:open-folder-archive"),
    repackStatus: (id: string) => ipcRenderer.invoke("workspace:repack-status", id),
    configureRepack: (id: string, settings: unknown) =>
      ipcRenderer.invoke("workspace:configure-repack", id, settings),
    repack: (id: string, saveAs?: boolean) => ipcRenderer.invoke("workspace:repack", id, saveAs),
    cancelArchive: () => ipcRenderer.invoke("workspace:cancel-archive"),
    installIdeKit: (id: string) => ipcRenderer.invoke("workspace:ide-kit", id),
    choose: () => ipcRenderer.invoke("workspace:choose"),
    inventory: (id: string) => ipcRenderer.invoke("workspace:inventory", id),
    read: (id: string, path: string, offset: number, length: number) =>
      ipcRenderer.invoke("workspace:read", id, path, offset, length),
    hash: (id: string, path: string) => ipcRenderer.invoke("workspace:hash", id, path),
    write: (id: string, path: string, bytes: Uint8Array, expected: string | null) =>
      ipcRenderer.invoke("workspace:write", id, path, bytes, expected),
    beginUpload: (id: string, path: string, total: number, expected: string | null) =>
      ipcRenderer.invoke("workspace:upload-begin", id, path, total, expected),
    appendUpload: (id: string, ticket: string, offset: number, bytes: Uint8Array) =>
      ipcRenderer.invoke("workspace:upload-append", id, ticket, offset, bytes),
    finishUpload: (id: string, ticket: string, hash?: string) =>
      ipcRenderer.invoke("workspace:upload-finish", id, ticket, hash),
    cancelUpload: (id: string, ticket: string) =>
      ipcRenderer.invoke("workspace:upload-cancel", id, ticket),
    close: (id: string) => ipcRenderer.invoke("workspace:close", id),
    editor: () => ipcRenderer.invoke("workspace:editor"),
    configureEditor: (kind: string) => ipcRenderer.invoke("workspace:configure-editor", kind),
    openExternal: (id: string, path: string, line?: number, column?: number) =>
      ipcRenderer.invoke("workspace:open-external", id, path, line, column),
    reveal: (id: string) => ipcRenderer.invoke("workspace:reveal", id),
    onChanged: (callback: (event: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: unknown) => callback(value);
      ipcRenderer.on("workspace:changed", listener);
      return () => ipcRenderer.removeListener("workspace:changed", listener);
    },
  },
  getGraphics: () => ipcRenderer.invoke("graphics:get"),
  saveGraphics: (value: unknown) => ipcRenderer.invoke("graphics:save", value),
  save: (name: string, text: string | Uint8Array) => ipcRenderer.invoke("save", name, text),
});
