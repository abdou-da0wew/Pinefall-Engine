import { registerProjectSource } from "../packages/project/src/source-registration";
import { FolderHistory } from "./folder-history";
import { Worker } from "node:worker_threads";
import type { FolderRecent, RepackSettings } from "../packages/project/src/disk-api";
import { installIdeKit } from "../packages/project/src/ide-kit";
import {
  type BrowserWindow,
  dialog,
  ipcMain,
  shell,
  protocol,
  net,
  type IpcMainInvokeEvent,
} from "electron";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DiskWorkspace } from "../packages/project/src/disk-workspace";
import { atomicWrite } from "../packages/project/src/atomic-file";
import type {
  ExternalEditorKind as ExternalEditor,
  ExternalEditorPreference as EditorPreference,
} from "../packages/project/src/disk-api";
const editorKinds: ExternalEditor[] = [
  "system",
  "vscode",
  "vscodium",
  "visual-studio",
  "text-editor",
];

export function installWorkspaceBridge(win: BrowserWindow, preferences: string) {
  let session: { id: string; disk: DiskWorkspace } | undefined;
  const history = new FolderHistory(preferences + ".folders.json");
  let current: FolderRecent | undefined;
  let archiveWorker: Worker | undefined;
  let archiveCancellation = 0;
  let dirty = true,
    generation = 0,
    lastSuccess: number | undefined,
    archiveError: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const runArchive = (root: string, archive: string, mode: "pack" | "unpack") =>
    new Promise<void>((resolve, reject) => {
      if (archiveWorker) {
        reject(Error("Archive operation already running"));
        return;
      }
      const worker = new Worker(join(import.meta.dirname, "archive-worker.mjs"), {
        workerData: { root, archive, mode },
        resourceLimits: { maxOldGenerationSizeMb: 128 },
      });
      archiveWorker = worker;
      let done = false;
      const finish = (error?: Error) => {
        if (done) return;
        done = true;
        clearTimeout(deadline);
        archiveWorker = undefined;
        void worker.terminate();
        if (error) reject(error);
        else resolve();
      };
      const deadline = setTimeout(() => {
        worker.postMessage("cancel");
      }, 300000);
      worker.on("message", (message) => finish(message.error ? Error(message.error) : undefined));
      worker.on("error", finish);
      worker.on("exit", () => finish(Error("Archive worker exited before completion")));
    });
  const status = () => ({
    settings: current!.settings,
    archive: current!.archive,
    busy: !!archiveWorker,
    dirty,
    lastSuccess,
    error: archiveError,
  });
  const schedule = () => {
    clearTimeout(timer);
    if (win.isDestroyed() || !current?.archive || current.settings.mode === "manual") return;
    const delay =
      current.settings.mode === "interval" ? current.settings.intervalSeconds * 1000 : 1500;
    timer = setTimeout(() => {
      if (dirty && !archiveWorker)
        void repack()
          .catch(() => {})
          .finally(schedule);
      else schedule();
    }, delay);
  };
  const repack = async () => {
    if (!current?.archive || !session) throw Error("Choose a PIF destination first");
    const record = current,
      revision = generation;
    archiveError = undefined;
    try {
      await runArchive(session.disk.root, record.archive!, "pack");
      if (current === record) {
        dirty = generation !== revision;
        lastSuccess = Date.now();
      }
    } catch (error) {
      archiveError = String(error);
      throw error;
    }
  };
  const activate = async (root: string) => {
    if (archiveWorker)
      throw Error("Finish or cancel the archive operation before switching folders");
    const disk = await DiskWorkspace.open(root);
    try {
      const entries = await disk.inventory(),
        id = randomUUID();
      const remembered = await history.remember(disk.root);
      disk.watch((change) => {
        if (!win.isDestroyed() && session?.id === id) {
          dirty = true;
          generation++;
          if (current?.settings.mode === "per-action") schedule();
          win.webContents.send("workspace:changed", { id, ...change });
        }
      });
      await session?.disk.close();
      session = { id, disk };
      current = remembered;
      dirty = true;
      generation++;
      lastSuccess = undefined;
      archiveError = undefined;
      schedule();
      return { id, root: disk.root, entries };
    } catch (error) {
      await disk.close();
      throw error;
    }
  };
  let editor: EditorPreference = { kind: "system" };
  const ready = readFile(preferences, "utf8")
    .then((text) => {
      const value = JSON.parse(text) as EditorPreference;
      if (
        editorKinds.includes(value.kind) &&
        (value.kind === "system" ||
          (typeof value.executable === "string" && isAbsolute(value.executable)))
      )
        editor = value;
    })
    .catch(() => {});
  const guard = (event: IpcMainInvokeEvent) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
      throw Error("Invalid workspace sender");
    const url = new URL(event.senderFrame.url);
    const allowed = ["index.html", "game.html"].map((name) =>
      join(import.meta.dirname, "../dist", name),
    );
    if (url.protocol !== "file:" || !allowed.includes(fileURLToPath(url)))
      throw Error("Workspace sender is not the bundled application");
  };
  const get = (event: IpcMainInvokeEvent, id: unknown) => {
    guard(event);
    if (!session || typeof id !== "string" || id !== session.id)
      throw Error("Disk project session unavailable");
    return session.disk;
  };
  ipcMain.handle("workspace:recents", async (event) => {
    guard(event);
    await history.ready;
    return history.records;
  });
  ipcMain.handle("workspace:reopen", async (event, id: unknown) => {
    guard(event);
    await history.ready;
    const record = history.records.find((r) => r.id === id);
    if (!record) throw Error("Unknown recent folder");
    return activate(record.root);
  });
  ipcMain.handle("workspace:repack-status", (event, id: unknown) => {
    get(event, id);
    return status();
  });
  ipcMain.handle(
    "workspace:configure-repack",
    async (event, id: unknown, value: RepackSettings) => {
      get(event, id);
      current!.settings = history.validate(value);
      await history.save();
      schedule();
      return status();
    },
  );
  ipcMain.handle("workspace:cancel-archive", (event) => {
    guard(event);
    archiveCancellation++;
    archiveWorker?.postMessage("cancel");
  });
  ipcMain.handle("workspace:repack", async (event, id: unknown, saveAs: unknown) => {
    get(event, id);
    const cancellation = archiveCancellation;
    if (archiveWorker) throw Error("Archive operation already running");
    if (!current!.archive || saveAs === true) {
      const result = await dialog.showSaveDialog(win, {
        title: "Back up raw project folder (PIF8)",
        filters: [{ name: "Pinefall folder archive", extensions: ["pif"] }],
      });
      if (result.canceled || !result.filePath) return status();
      get(event, id);
      if (cancellation !== archiveCancellation) throw Error("Archive selection cancelled");
      current!.archive = result.filePath;
      await history.save();
    }
    await repack();
    schedule();
    return status();
  });
  let openingArchive = false;
  ipcMain.handle("workspace:open-folder-archive", async (event) => {
    if (openingArchive) throw Error("Project archive selection already open");
    openingArchive = true;
    try {
      guard(event);
      const cancellation = archiveCancellation;
      if (archiveWorker) throw Error("Archive operation already running");
      const input = await dialog.showOpenDialog(win, {
        title: "Open Pinefall project (PIF1–8)",
        properties: ["openFile"],
        filters: [{ name: "Pinefall folder archive", extensions: ["pif"] }],
      });
      if (input.canceled || !input.filePaths[0]) return null;
      if (cancellation !== archiveCancellation) throw Error("Archive selection cancelled");
      const output = await dialog.showOpenDialog(win, {
        title: "Choose an empty extraction folder",
        properties: ["openDirectory", "createDirectory"],
      });
      if (output.canceled || !output.filePaths[0]) return null;
      if (cancellation !== archiveCancellation) throw Error("Archive selection cancelled");
      await runArchive(output.filePaths[0], input.filePaths[0], "unpack");
      return await activate(output.filePaths[0]);
    } finally {
      openingArchive = false;
    }
  });
  ipcMain.handle("workspace:ide-kit", async (event, id: unknown) => {
    const disk = get(event, id);
    const files = JSON.parse(
      await readFile(join(import.meta.dirname, "../dist/sdk/manifest.json"), "utf8"),
    );
    return installIdeKit(disk, files);
  });
  let choosing = false;
  ipcMain.handle("workspace:choose", async (event) => {
    guard(event);
    if (choosing) throw Error("Project folder selection already open");
    choosing = true;
    try {
      const result = await dialog.showOpenDialog(win, {
        title: "Choose a working project folder",
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return await activate(result.filePaths[0]);
    } finally {
      choosing = false;
    }
  });
  ipcMain.handle("workspace:inventory", (event, id: unknown) => get(event, id).inventory());
  ipcMain.handle(
    "workspace:read",
    (event, id: unknown, path: string, offset: number, length: number) =>
      get(event, id).read(path, offset, length),
  );
  ipcMain.handle("workspace:register-source", (event, id: unknown, path: string, name: string) =>
    registerProjectSource(get(event, id), path, name),
  );
  ipcMain.handle("workspace:hash", (event, id: unknown, path: string) =>
    get(event, id).fingerprint(path),
  );
  ipcMain.handle(
    "workspace:write",
    (event, id: unknown, path: string, bytes: Uint8Array, expected: string | null) =>
      get(event, id).write(path, bytes, expected),
  );
  ipcMain.handle(
    "workspace:upload-begin",
    (event, id: unknown, path: string, total: number, expected: string | null) =>
      get(event, id).beginUpload(path, total, expected),
  );
  ipcMain.handle(
    "workspace:upload-append",
    (event, id: unknown, ticket: string, offset: number, bytes: Uint8Array) =>
      get(event, id).appendUpload(ticket, offset, bytes),
  );
  ipcMain.handle("workspace:upload-finish", (event, id: unknown, ticket: string, hash?: string) =>
    get(event, id).finishUpload(ticket, hash),
  );
  ipcMain.handle("workspace:upload-cancel", (event, id: unknown, ticket: string) =>
    get(event, id).cancelUpload(ticket),
  );
  protocol.handle("pinefall-project", async (request) => {
    try {
      const url = new URL(request.url);
      if (request.method !== "GET" || !session || url.hostname !== session.id)
        return new Response("Unavailable project grant", { status: 403 });
      const path = await session.disk.externalPath(decodeURIComponent(url.pathname.slice(1)));
      const response = await net.fetch(pathToFileURL(path).toString());
      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type": "application/octet-stream",
          "Access-Control-Allow-Origin": "null",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return new Response("Missing or unsafe project file", { status: 404 });
    }
  });
  ipcMain.handle("workspace:close", async (event, id: unknown) => {
    const disk = get(event, id);
    clearTimeout(timer);
    archiveWorker?.postMessage("cancel");
    current = undefined;
    session = undefined;
    await disk.close();
  });
  ipcMain.handle("workspace:editor", async (event) => {
    guard(event);
    await ready;
    return editor;
  });
  ipcMain.handle("workspace:configure-editor", async (event, kind: ExternalEditor) => {
    guard(event);
    await ready;
    if (!editorKinds.includes(kind)) throw Error("Unknown external editor");
    let executable: string | undefined;
    if (kind !== "system") {
      const result = await dialog.showOpenDialog(win, {
        title: "Choose the external editor executable",
        properties: ["openFile"],
        ...(process.platform === "win32"
          ? { filters: [{ name: "Editor executable", extensions: ["exe"] }] }
          : {}),
      });
      if (result.canceled || !result.filePaths[0]) return editor;
      executable = result.filePaths[0];
      if (!isAbsolute(executable) || !(await stat(executable)).isFile())
        throw Error("Invalid editor executable");
      if (process.platform === "win32" && !executable.toLowerCase().endsWith(".exe"))
        throw Error("Choose the editor EXE, not a command script");
    }
    const next = { kind, ...(executable ? { executable } : {}) };
    await atomicWrite(preferences, JSON.stringify(next));
    editor = next;
    return editor;
  });
  ipcMain.handle(
    "workspace:open-external",
    async (event, id: unknown, path: string, line = 1, column = 1) => {
      const disk = get(event, id);
      if (
        !Number.isInteger(line) ||
        line < 1 ||
        line > 1000000 ||
        !Number.isInteger(column) ||
        column < 1 ||
        column > 65536
      )
        throw Error("Invalid source position");
      const full = await disk.externalPath(path);
      if (!/\.(ts|tsx|glsl|vert|frag|wgsl|hlsl|json|txt|md)$/i.test(full))
        throw Error("Open externally is limited to source and metadata files");
      await ready;
      if (editor.kind === "system") {
        const error = await shell.openPath(full);
        if (error) throw Error(error);
        return;
      }
      if (!editor.executable) throw Error("Configure an external editor first");
      const args =
        editor.kind === "vscode" || editor.kind === "vscodium"
          ? ["--reuse-window", disk.root, "--goto", `${full}:${line}:${column}`]
          : editor.kind === "visual-studio"
            ? ["/Edit", full]
            : [full];
      await new Promise<void>((resolve, reject) => {
        const child = spawn(editor.executable!, args, {
          shell: false,
          cwd: disk.root,
          stdio: "ignore",
          detached: true,
        });
        child.once("error", reject);
        child.once("spawn", () => {
          child.unref();
          resolve();
        });
      });
    },
  );
  ipcMain.handle("workspace:reveal", (event, id: unknown) => {
    const disk = get(event, id);
    return shell.openPath(disk.root).then((error) => {
      if (error) throw Error(error);
    });
  });
  win.once("closed", () => {
    clearTimeout(timer);
    archiveWorker?.postMessage("cancel");
    void session?.disk.close();
    session = undefined;
    current = undefined;
  });
}
