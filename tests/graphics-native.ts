import { _electron, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
const profile = await mkdtemp(resolve("build/graphics-profile-"));
async function launch() {
  return _electron.launch({
    args: [".", `--user-data-dir=${profile}`, "--no-sandbox"],
    cwd: process.cwd(),
  });
}
let app = await launch();
try {
  let page = await app.firstWindow();
  await expect(page.getByRole("heading", { name: /Your next world/ })).toBeVisible();
  await page.getByRole("button", { name: "Editor settings", exact: true }).click();
  await expect(page.getByLabel("3D renderer", { exact: true })).toBeEnabled();
  await page.getByLabel("Browser / UI compositing", { exact: true }).selectOption("software");
  await page.getByLabel("3D renderer", { exact: true }).selectOption("software");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  let state = await page.evaluate(() => window.engineDesktop!.getGraphics());
  expect(state.saved).toEqual({ compositor: "software", renderer: "software" });
  expect(state.active.renderer).toBe("auto");
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await expect(page.getByRole("heading", { name: /Your next world/ })).toBeVisible();
  state = await page.evaluate(() => window.engineDesktop!.getGraphics());
  expect(state.active).toEqual(state.saved);
  expect(state.features.gpu_compositing).toContain("software");
  await page.getByRole("button", { name: "Editor settings", exact: true }).click();
  await page.screenshot({ path: "build/graphics-settings.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByLabel("Game name", { exact: true }).fill("CPU 3D verification");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled({
    timeout: 60000,
  });
  const renderer = await page
    .getByLabel("3D scene viewport", { exact: true })
    .evaluate((canvas) => {
      const gl = (canvas as HTMLCanvasElement).getContext("webgl2")!;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "unknown";
    });
  expect(renderer).toMatch(/SwiftShader/i);
  await page.screenshot({ path: "build/graphics-cpu-3d.png" });
  console.log(
    "PASS persisted graphics choices apply after restart; software UI compositing and real SwiftShader 3D:",
    renderer,
  );
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
}
