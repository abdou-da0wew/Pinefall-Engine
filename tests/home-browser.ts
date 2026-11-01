import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect, _electron } from "@playwright/test";
const native = process.env.TEST_NATIVE === "1",
  profile = native ? await mkdtemp(resolve("build/home-profile-")) : undefined;
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
  if (!native) await page.goto(process.env.TEST_BASE_URL ?? "http://localhost:5173");
  await expect(page.getByRole("heading", { name: /Your next world/ })).toBeVisible();
  expect(await page.locator("canvas").count()).toBe(0);
  await page.screenshot({
    path: "build/ui-" + (native ? "native-" : "") + "home-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Editor settings", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Editor settings" })
    .getByRole("combobox")
    .first()
    .selectOption("compact");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await page.getByRole("button", { name: /Plugins marketplace/ }).click();
  await expect(page.getByText("TODO · LATER", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Marketplace coming later" })).toBeDisabled();
  await page.getByRole("button", { name: "Recent projects", exact: true }).click();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByLabel("Game name", { exact: true }).fill("UI acceptance project");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await expect(page.locator(".viewport-stats").first()).not.toContainText("— FPS");
  await page.screenshot({ path: "build/ui-" + (native ? "native-" : "") + "editor-desktop.png" });
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  await page.getByRole("menuitem", { name: "Import settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Import settings", exact: true })).toBeVisible();
  await page.screenshot({ path: "build/ui-" + (native ? "native-" : "") + "import-dialog.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Assets", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "New game", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("menuitem", { name: "Editor settings", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Editor settings" })
    .getByRole("combobox")
    .first()
    .selectOption("comfortable");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
  await page.screenshot({
    path: "build/ui-" + (native ? "native-" : "") + "editor-comfortable.png",
  });
  await page.getByRole("button", { name: "Back to home", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Your next world/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "UI acceptance project", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
  await expect(
    page.getByRole("heading", { name: "UI acceptance project", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({
    path: "build/ui-" + (native ? "native-" : "") + "home-narrow.png",
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: /UI acceptance project Open project/ }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await expect(page.locator(".viewport-stats").first()).not.toContainText("— FPS");
  await page.screenshot({ path: "build/ui-" + (native ? "native-" : "") + "editor-narrow.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "PASS home, blank game, no GPU on home, recent archive reload, settings, marketplace TODO, dialog/menu focus and viewport overflow",
  );
} finally {
  await browser?.close();
  await app?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
}
