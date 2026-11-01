import { chromium, expect, _electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
const native = process.env.TEST_NATIVE === "1",
  profile = native ? await mkdtemp(resolve("build/commands-profile-")) : undefined;
const app = native
  ? await _electron.launch({
      executablePath: process.env.TEST_DESKTOP_EXECUTABLE,
      args: [
        ...(process.env.TEST_DESKTOP_EXECUTABLE ? [] : ["."]),
        `--user-data-dir=${profile}`,
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
      cwd: process.cwd(),
    })
  : undefined;
const browser = native
  ? undefined
  : await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
try {
  const page = app
      ? await app.firstWindow()
      : await browser!.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("filechooser", () => {});
  if (!app) await page.goto("http://localhost:5173");
  await expect(page.locator(".pf-home")).toBeVisible();
  await page.keyboard.press("Control+n");
  await expect(page.getByRole("dialog", { name: "New game" })).toBeVisible();
  await expect(page.getByLabel("Game name", { exact: true })).toBeFocused();
  await page.getByLabel("Game name", { exact: true }).fill("Shortcut acceptance");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  const ready = () =>
    expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await ready();
  const viewport = page.getByLabel("3D scene viewport", { exact: true });
  await page.getByRole("treeitem").filter({ hasText: "Ground" }).click();
  await viewport.focus();
  for (const [key, mode] of [
    ["e", "rotate"],
    ["r", "scale"],
    ["w", "translate"],
  ]) {
    await page.keyboard.press(key);
    await expect(page.getByTitle(`${mode} (${key.toUpperCase()})`, { exact: true })).toHaveClass(
      /active/,
    );
  }
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(page.getByRole("treeitem")).toHaveCount(3);
  await ready();
  await viewport.focus();
  await page.keyboard.press("Control+x");
  await expect(page.getByRole("treeitem")).toHaveCount(2);
  await ready();
  await page.keyboard.press("Control+v");
  await expect(page.getByRole("treeitem")).toHaveCount(3);
  await ready();
  await viewport.focus();
  await page.keyboard.press("Delete");
  await expect(page.getByRole("treeitem")).toHaveCount(2);
  await ready();
  await page.getByRole("treeitem").filter({ hasText: "Ground" }).click();
  await viewport.focus();
  await page.keyboard.press("Control+d");
  await expect(page.getByRole("treeitem")).toHaveCount(3);
  await ready();
  await viewport.focus();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("treeitem")).toHaveCount(2);
  await ready();
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByRole("treeitem")).toHaveCount(3);
  await ready();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("treeitem")).toHaveCount(2);
  await ready();
  await page.keyboard.press("Control+y");
  await expect(page.getByRole("treeitem")).toHaveCount(3);
  await ready();
  await page.getByRole("treeitem").filter({ hasText: "Ground" }).last().click();
  await viewport.focus();
  await page.keyboard.press("F2");
  await page.getByLabel("Rename item", { exact: true }).fill("Keyboard copy");
  await page.getByLabel("Rename item", { exact: true }).press("Enter");
  await expect(page.getByRole("treeitem").filter({ hasText: "Keyboard copy" })).toBeVisible();
  await ready();
  await viewport.focus();
  await page.keyboard.press("Delete");
  await expect(page.getByRole("treeitem")).toHaveCount(2);
  await ready();
  await page.getByRole("treeitem").filter({ hasText: "Ground" }).click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+g");
  await page.getByLabel("Rename item", { exact: true }).press("Escape");
  await expect(page.getByRole("treeitem")).toHaveCount(3);
  await ready();
  await viewport.focus();
  await page.keyboard.press("Delete");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("treeitem")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await viewport.focus();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("treeitem")).toHaveCount(2);
  await ready();
  await page.getByRole("treeitem").filter({ hasText: "Ground" }).click();
  const name = page.getByLabel("Entity name", { exact: true });
  await name.fill("");
  await name.pressSequentially("were");
  await name.press("Delete");
  await expect(page.getByRole("treeitem")).toHaveCount(2);
  await expect(page.getByTitle("translate (W)", { exact: true })).toHaveClass(/active/);
  await name.fill("Ground");
  await name.blur();
  await ready();
  await viewport.focus();
  if (!native) {
    await page.evaluate(async () => {
      const path = "/packages/runtime/src/index.ts";
      const { Engine } = await import(path);
      const play = Engine.prototype.play;
      Engine.prototype.play = function (...args: unknown[]) {
        Reflect.set(window, "shortcutEngine", this);
        return play.apply(this, args);
      };
    });
  }
  await page.keyboard.press("F5");
  await expect(page.getByRole("button", { name: "Stop scene", exact: true })).toBeEnabled();
  if (!native) {
    await page.keyboard.down("w");
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, "shortcutEngine").input.has("KeyW")))
      .toBe(true);
    await page.keyboard.up("w");
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, "shortcutEngine").input.has("KeyW")))
      .toBe(false);
  }
  await page.keyboard.press("F1");
  await expect(page.getByRole("dialog", { name: "Commands and shortcuts" })).toBeVisible();
  await page.keyboard.press("F5");
  await expect(page.getByRole("button", { name: "Stop scene", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Commands and shortcuts" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pause simulation", exact: true })).not.toHaveClass(
    /active/,
  );
  await page.keyboard.press("Control+d");
  await expect(page.getByRole("treeitem")).toHaveCount(2);
  await page.keyboard.press("F6");
  await expect(page.getByRole("button", { name: "Pause simulation", exact: true })).toHaveClass(
    /active/,
  );
  await page.keyboard.press("F6");
  await expect(page.getByRole("button", { name: "Pause simulation", exact: true })).not.toHaveClass(
    /active/,
  );
  await page.keyboard.press("Shift+F5");
  await ready();
  await viewport.focus();
  await page.keyboard.press("Control+3");
  await expect(page.locator(".ui-editor")).toBeVisible();
  await page.getByRole("button", { name: "Add UI element", exact: true }).click();
  await expect(page.locator(".ui-tree button")).toHaveCount(1);
  await ready();
  await page.locator(".ui-tree button").first().click();
  await page.keyboard.press("F2");
  await expect(page.getByLabel("UI Name", { exact: true })).toBeFocused();
  await page.getByLabel("UI Name", { exact: true }).fill("Keyboard widget");
  await page.getByLabel("UI Name", { exact: true }).press("Enter");
  await ready();
  await page.locator(".ui-tree button").first().click();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+4");
  await expect(page.locator(".ui-editor")).toHaveCount(0);
  await page.keyboard.press("Control+3");
  await expect(page.locator(".ui-editor")).toBeVisible();
  await page.locator(".ui-tree button").first().click();
  await page.keyboard.press("Control+v");
  await expect(page.locator(".ui-tree button")).toHaveCount(2);
  await ready();
  await page.locator(".ui-tree button").last().focus();
  await page.keyboard.press("Control+x");
  await expect(page.locator(".ui-tree button")).toHaveCount(1);
  await ready();
  await page.locator(".ui-tree button").first().click();
  await page.keyboard.press("Control+d");
  await expect(page.locator(".ui-tree button")).toHaveCount(2);
  await ready();
  await page.locator(".ui-tree button").last().focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".ui-tree button")).toHaveCount(1);
  await expect(page.getByRole("treeitem")).toHaveCount(2);
  await ready();
  await viewport.focus();
  await page.keyboard.press("Control+Shift+p");
  const palette = page.getByRole("dialog", { name: "Commands and shortcuts" });
  await expect(palette).toBeVisible();
  await page.screenshot({ path: "build/" + (native ? "native-" : "") + "commands-palette.png" });
  await expect(page.getByLabel("Search commands", { exact: true })).toBeFocused();
  await page.keyboard.type("settings");
  await page.getByLabel("Search commands", { exact: true }).press("Enter");
  await expect(page.getByRole("dialog", { name: "Import settings", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await viewport.focus();
  if (app) {
    const path = resolve("build/commands-native.pif");
    await rm(path, { force: true });
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, path);
    await page.keyboard.press("Control+s");
    await expect.poll(() => Bun.file(path).exists()).toBe(true);
  } else {
    const download = page.waitForEvent("download");
    await page.keyboard.press("Control+s");
    expect((await download).suggestedFilename()).toBe("Shortcut acceptance.pif");
  }
  await expect(page.getByRole("button", { name: "Save project", exact: true })).toBeEnabled();
  const chooser = page.waitForEvent("filechooser", { timeout: 5000 });
  await page.keyboard.press("Control+i");
  expect((await chooser).isMultiple()).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    (native ? "PASS Electron shortcuts:" : "PASS browser shortcuts:") +
      " Home, transforms, undo/redo, duplicate/delete/group/rename, typing/modal guards, Play/Pause/Stop, UI context, palette, save/import",
  );
} finally {
  await browser?.close();
  await app?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
}
