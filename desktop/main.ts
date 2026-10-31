import { app, BrowserWindow, ipcMain, dialog, Menu } from "electron";
import { atomicWrite } from "../packages/project/src/atomic-file";
import { join } from "node:path";
import { appendFileSync, existsSync, renameSync, statSync } from "node:fs";
if (process.argv.includes("--legacy-gl")) {
  app.commandLine.appendSwitch("use-gl", "angle");
  app.commandLine.appendSwitch("use-angle", "gl");
  app.commandLine.appendSwitch("disable-features", "Vulkan");
  if (process.platform === "linux") app.commandLine.appendSwitch("ozone-platform", "x11");
}
function log(type: string, message: string) {
  try {
    const path = join(app.getPath("userData"), "engine.jsonl");
    if (existsSync(path) && statSync(path).size > 512000) renameSync(path, path + ".1");
    appendFileSync(
      path,
      JSON.stringify({ time: new Date().toISOString(), type, message: message.slice(0, 2000) }) +
        "\n",
    );
  } catch {}
}
void app.whenReady().then(() => {
  const win = new BrowserWindow({
    icon: join(import.meta.dirname, "../dist/pinefall-app-icon.png"),
    width: 1440,
    height: 900,
    minWidth: 850,
    minHeight: 650,
    backgroundColor: "#14211b",
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file:")) event.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  win.webContents.on("render-process-gone", (_e, details) => log("crash", JSON.stringify(details)));
  win.webContents.on("console-message", (_event, _level, message) => log("renderer", message));
  ipcMain.handle("save", async (event, name: unknown, text: unknown) => {
    if (
      event.sender !== win.webContents ||
      typeof name !== "string" ||
      !(typeof text === "string" || text instanceof Uint8Array) ||
      text.length > (typeof text === "string" ? 9000000 : 16 * 1024 * 1024)
    )
      throw Error("Invalid save");
    const result = await dialog.showSaveDialog(win, {
      defaultPath: name.replace(/[^a-zA-Z0-9._ -]/g, "_"),
    });
    if (result.canceled || !result.filePath) return false;
    await atomicWrite(result.filePath, text);
    return true;
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Pinefall Engine",
        submenu: [
          {
            label: "Open standalone player",
            click: () => void win.loadFile(join(import.meta.dirname, "../dist/game.html")),
          },
          {
            label: "Open editor",
            click: () => void win.loadFile(join(import.meta.dirname, "../dist/index.html")),
          },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Diagnostics",
        submenu: [
          { role: "toggleDevTools" },
          {
            label: "Show log location",
            click: () =>
              void dialog.showMessageBox(win, {
                message: app.getPath("userData"),
                detail:
                  "engine.jsonl · bounded native/renderer log. Legacy OpenGL launch: add --legacy-gl. No sandbox disabling required.",
              }),
          },
          { role: "reload" },
        ],
      },
    ]),
  );
  void win.loadFile(join(import.meta.dirname, "../dist/index.html"));
  log("startup", "Desktop initialized");
});
app.on("window-all-closed", () => app.quit());
