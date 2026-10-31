import { _electron, expect } from "@playwright/test";
import { triangle, binaryFbx } from "./asset-fixtures";
import { unpackProject, inspectProject } from "../packages/project/src/pif";
const app = await _electron.launch({
  executablePath: process.env.TEST_DESKTOP_EXECUTABLE,
  args: [
    ...(process.env.TEST_DESKTOP_EXECUTABLE ? [] : ["."]),
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
  cwd: process.cwd(),
});
try {
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByLabel("Game name", { exact: true }).fill("Native assets");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await page.locator('input[accept=".glb,.fbx,.png,.jpg,.jpeg"]').setInputFiles({
    name: "native.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from(triangle()),
  });
  await expect(page.locator(".statusbar")).toContainText("Imported native.glb");
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.locator('input[accept=".glb,.fbx,.png,.jpg,.jpeg"]').setInputFiles({
    name: "native.fbx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(binaryFbx()),
  });
  await expect(page.locator(".statusbar")).toContainText("Imported native.fbx");
  await page.getByRole("button", { name: "Play scene", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop scene", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop scene", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  const path = process.cwd() + "/build/assets-native.pif";
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ filePath: path, canceled: false });
  }, path);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("PIF project saved");
  const archived = await Bun.file(path).bytes();
  const scene = await unpackProject(archived);
  expect((await inspectProject(archived)).formatVersion).toBe(4);
  expect(scene.assets[0].import?.version).toBe(2);
  expect(scene.assets.some((a) => a.name === "native.glb" && a.import?.revision === 1)).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "PASS packaged Electron model worker, renderer adoption, Play/Stop, PIF v4 binary save",
  );
} finally {
  await app.close();
}
