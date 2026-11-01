import { chromium, expect } from "@playwright/test";
import { triangle } from "./asset-fixtures";
import { enterEditor, openAssetActions } from "./editor-navigation";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:5173");
  await enterEditor(page);
  async function monitor() {
    await page.evaluate(async () => {
      const path = "/packages/assets/src/index.ts";
      const { ModelCache } = await import(path);
      const prepare = ModelCache.prototype.prepare;
      Reflect.set(window, "decodeRequests", 0);
      ModelCache.prototype.prepare = function (...args: unknown[]) {
        Reflect.set(window, "decodeRequests", Reflect.get(window, "decodeRequests") + 1);
        return prepare.apply(this, args);
      };
    });
  }
  await monitor();
  await openAssetActions(page);
  await page.getByRole("checkbox", { name: "Import only", exact: true }).check();
  await page.keyboard.press("Escape");
  await page.locator('input[accept=".glb,.fbx,.png,.jpg,.jpeg"]').setInputFiles({
    name: "stored.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from(triangle()),
  });
  await expect(page.locator(".statusbar")).toContainText("Imported stored.glb");
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => Reflect.get(window, "decodeRequests"))).toBe(0);
  await page.getByRole("button", { name: "Back to home", exact: true }).click();
  await expect(page.locator(".pf-home")).toBeVisible();
  await page.reload();
  await expect(page.locator(".pf-home")).toBeVisible();
  await monitor();
  await enterEditor(page);
  expect(await page.evaluate(() => Reflect.get(window, "decodeRequests"))).toBe(0);
  await page.getByRole("button", { name: /stored.glb GLB · INSTANCE/ }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => Reflect.get(window, "decodeRequests"))).toBe(1);
  await expect(page.getByRole("treeitem").filter({ hasText: "stored.glb" })).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const path = "/packages/assets/src/blobs.ts";
      const { blobs } = await import(path);
      return blobs.bytes;
    }),
  ).toBe(0);
  await page.getByRole("button", { name: "Reimport stored.glb", exact: true }).click();
  await page.locator('input[accept=".glb,.fbx,.png,.jpg,.jpeg"]').dispatchEvent("cancel");
  await expect(page.locator(".statusbar")).toContainText("Import selection cancelled");
  await page.getByLabel("3D scene viewport", { exact: true }).focus();
  await page.keyboard.press("Control+i");
  await page.locator('input[accept=".glb,.fbx,.png,.jpg,.jpeg"]').setInputFiles({
    name: "another.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from(triangle(1)),
  });
  await expect(page.locator(".statusbar")).toContainText("Imported another.glb");
  await expect(page.getByRole("dialog", { name: "Review reimport", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.screenshot({ path: "build/disk-assets-editor.png" });
  expect(errors).toEqual([]);
  console.log(
    "PASS library-only import and cold reopen do not decode models; placement loads on demand; retained source byte cache remains zero",
  );
} finally {
  await browser.close();
}
