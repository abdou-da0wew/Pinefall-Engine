import { chromium, expect } from "@playwright/test";
import { triangle } from "./asset-fixtures";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto((process.env.TEST_BASE_URL || "http://localhost:5173") + "/tests/runtime.html");
  await page.evaluate(async (bytes) => {
    const databasePath = "/packages/assets/src/database.ts",
      blobPath = "/packages/assets/src/blobs.ts",
      projectPath = "/packages/project/src/index.ts",
      recordPath = "/packages/assets/src/record.ts",
      importPath = "/packages/assets/src/import.ts";
    const { AssetDatabase } = await import(databasePath),
      { blobs } = await import(blobPath),
      { createGame } = await import(projectPath),
      { prepareGlbRecord } = await import(recordPath),
      { adoptImport, prepareImport } = await import(importPath);
    const check = (ok: boolean, message: string) => {
      if (!ok) throw Error(message);
    };
    const db = new AssetDatabase("storage-test"),
      scene = adoptImport(
        createGame("Previous"),
        await prepareGlbRecord("sample.glb", new Uint8Array(bytes)),
      ).scene;
    await db.saveCheckpoint(scene, 1);
    scene.name = "Newest";
    await db.saveCheckpoint(scene, 2);
    blobs.retain([]);
    check((await db.restoreCheckpoint()).scene.name === "Newest", "cold hydration");
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("storage-test");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const mutate = (work: (tx: IDBTransaction) => void) =>
      new Promise<void>((resolve, reject) => {
        const tx = raw.transaction(["checkpoints", "blobs"], "readwrite");
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        work(tx);
      });
    await mutate((tx) => {
      const store = tx.objectStore("checkpoints"),
        r = store.get("current");
      r.onsuccess = () => {
        r.result.scene.name = null;
        store.put(r.result, "current");
      };
    });
    check((await db.restoreCheckpoint()).recovered, "invalid current falls back");
    // Inject synchronous quota failure at the real IndexedDB write boundary.
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.name === "blobs") throw new DOMException("injected quota", "QuotaExceededError");
      return put.apply(this, args);
    };
    let failed = false;
    try {
      await db.saveCheckpoint(scene, 3);
    } catch {
      failed = true;
    } finally {
      IDBObjectStore.prototype.put = put;
    }
    check(failed, "quota write rejected");
    check((await db.restoreCheckpoint()).scene.name === "Previous", "quota preserved checkpoint");
    await mutate((tx) => {
      const r = tx.objectStore("blobs").openCursor();
      r.onsuccess = () => {
        const row = r.result;
        if (row) {
          row.update(new Uint8Array([99]));
          row.continue();
        }
      };
    });
    failed = false;
    try {
      await db.restoreCheckpoint();
    } catch {
      failed = true;
    }
    check(failed, "corrupt bytes rejected even when session copy exists");
    await mutate((tx) => tx.objectStore("blobs").clear());
    failed = false;
    try {
      await db.restoreCheckpoint();
    } catch {
      failed = true;
    }
    check(failed, "missing bytes rejected");
    const stages: string[] = [];
    const file = new File([new Uint8Array(bytes)], "cache.glb");
    await prepareImport([file], new AbortController().signal);
    await prepareImport([file], new AbortController().signal, (u: { stage: string }) =>
      stages.push(u.stage),
    );
    check(stages.includes("cache-hit"), "persistent conversion hit");
    // Seed an actual editor recovery document and test a new JS context below.
    const editor = new AssetDatabase();
    scene.name = "Reload proof";
    await editor.saveCheckpoint(scene, 5);
    raw.close();
  }, Array.from(triangle()));
  await page.goto((process.env.TEST_BASE_URL || "http://localhost:5173") + "/");
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Reimport sample.glb" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Reimport sample.glb" })).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "PASS real IndexedDB: cold hydration, previous recovery, injected quota abort, corrupt/missing bytes, cache hit, editor reload",
  );
} finally {
  await browser.close();
}
