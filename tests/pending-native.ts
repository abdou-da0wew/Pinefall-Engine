import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { enterEditor, openAssetActions } from "./editor-navigation";
import { _electron, expect } from "@playwright/test";
import { texturedFbx } from "./asset-fixtures";
const profile = await mkdtemp(resolve("build/isolated-native-profile-"));
const app = await _electron.launch({
  executablePath: process.env.TEST_DESKTOP_EXECUTABLE,
  args: [
    ...(process.env.TEST_DESKTOP_EXECUTABLE ? [] : ["."]),
    `--user-data-dir=${profile}`,
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
  cwd: process.cwd(),
});
try {
  const page = await app.firstWindow(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await enterEditor(page);
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  const chooser = page.locator('input[accept=".glb,.fbx,.png,.jpg,.jpeg"]');
  await chooser.setInputFiles({
    name: "native-repair.fbx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(texturedFbx),
  });
  const repair = page.getByRole("button", {
    name: "Repair native-repair.fbx: missing albedo.png",
    exact: true,
  });
  await openAssetActions(page);
  await expect(repair).toBeVisible();
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve, reject) => {
        const r = indexedDB.open("pinefall-assets-v1");
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction(["pending", "checkpoints"], "readonly"),
            p = tx.objectStore("pending").getAll(),
            c = tx.objectStore("checkpoints").get("current");
          tx.oncomplete = () => {
            resolve(
              p.result.some(
                (row: { projectId: string }) => row.projectId === c.result?.scene?.project?.id,
              ),
            );
            db.close();
          };
        };
      }),
  );
  await page.reload();
  await enterEditor(page);
  await openAssetActions(page);
  await expect(repair).toBeVisible();
  const png = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, 2, 2);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!)));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await repair.click();
  await chooser.setInputFiles({
    name: "albedo.png",
    mimeType: "image/png",
    buffer: Buffer.from(png),
  });
  await expect(page.locator(".statusbar")).toContainText("Imported native-repair.fbx");
  await expect(repair).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
  console.log(
    "PASS packaged Electron missing-companion recovery across reload and real textured FBX repair",
  );
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
}
