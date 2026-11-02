import { app, BrowserWindow, Menu } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { allowsGamePermission } from "../../desktop/game-permissions";
import { graphicsSwitches, defaultGraphics } from "../../packages/editor/src/graphics";
const graphics = { ...defaultGraphics };
if (process.argv.includes("--legacy-gl")) graphics.renderer = "legacy-gl";
if (process.argv.includes("--software-rendering")) graphics.renderer = "software";
for (const [key, value] of graphicsSwitches(graphics, process.platform))
  app.commandLine.appendSwitch(key, value);
Menu.setApplicationMenu(null);
void app.whenReady().then(() => {
  const entry = join(import.meta.dirname, "game/index.html"),
    url = pathToFileURL(entry).href,
    allowed = new Set([url]);
  const win = new BrowserWindow({
    title: "Nightfall Keep",
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#08161d",
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, target) => {
    if (target !== url) event.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler((wc, permission, callback, details) =>
    callback(
      wc === win.webContents &&
        allowsGamePermission(permission, details.requestingUrl, details.isMainFrame, allowed),
    ),
  );
  win.webContents.session.setPermissionCheckHandler(
    (wc, permission, _origin, details) =>
      wc === win.webContents &&
      allowsGamePermission(permission, details.requestingUrl, details.isMainFrame, allowed),
  );
  void win.loadFile(entry);
});
app.on("window-all-closed", () => app.quit());
