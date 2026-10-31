import { chromium, expect } from "@playwright/test";
import { texturedFbx } from "./asset-fixtures";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto((process.env.TEST_BASE_URL || "http://localhost:5173") + "/");
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  const input = page.locator('input[accept=".glb,.fbx,.png,.jpg,.jpeg"]');
  await input.setInputFiles({
    name: "repair.fbx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(texturedFbx),
  });
  await expect(
    page.getByRole("button", { name: "Repair repair.fbx: missing albedo.png", exact: true }),
  ).toBeVisible();
  const persisted = await page.evaluate(async () => {
    const path = "/packages/assets/src/database.ts";
    const { assetDatabase } = await import(path);
    const restored = await assetDatabase.restoreCheckpoint();
    return restored?.scene?.project?.id;
  });
  expect(persisted).toBeTruthy();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Repair repair.fbx: missing albedo.png", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Repair repair.fbx: missing albedo.png", exact: true })
    .click();
  await input.setInputFiles({
    name: "albedo.png",
    mimeType: "image/png",
    buffer: Buffer.from("invalid image"),
  });
  await expect(page.locator(".statusbar")).toContainText("Error");
  await expect(
    page.getByRole("button", { name: "Repair repair.fbx: missing albedo.png", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: "Reimport repair.fbx", exact: true })).toHaveCount(
    0,
  );
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
  await page
    .getByRole("button", { name: "Repair repair.fbx: missing albedo.png", exact: true })
    .click();
  await input.setInputFiles({
    name: "albedo.png",
    mimeType: "image/png",
    buffer: Buffer.from(png),
  });
  await expect(page.locator(".statusbar")).toContainText("Imported repair.fbx");
  await expect(
    page.getByRole("button", { name: "Repair repair.fbx: missing albedo.png", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  // An edited source that introduces a missing companion must keep the old asset/revision.
  await page.getByRole("button", { name: "Reimport repair.fbx", exact: true }).click();
  await input.setInputFiles({
    name: "repair.fbx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(texturedFbx.replaceAll("albedo.png", "replacement.png")),
  });
  const retryReimport = page.getByRole("button", {
    name: "Repair repair.fbx: missing replacement.png",
    exact: true,
  });
  await expect(retryReimport).toBeVisible();
  const pendingTarget = await page.evaluate(async () => {
    const path = "/packages/assets/src/database.ts",
      { assetDatabase } = await import(path);
    const checkpoint = await assetDatabase.restoreCheckpoint(),
      projectId = checkpoint.scene.project.id;
    const rows = await assetDatabase.pendingImports(projectId),
      attempt = rows.find((r: { missing: string }) => r.missing === "replacement.png");
    const target = structuredClone(attempt.target);
    attempt.target.revision++;
    await assetDatabase.putPending(attempt);
    return { id: attempt.id, target };
  });
  await retryReimport.click();
  await input.setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: Buffer.from(png),
  });
  await expect(page.locator(".statusbar")).toContainText("target changed");
  await expect(retryReimport).toBeEnabled();
  await expect(page.getByRole("dialog", { name: "Review reimport" })).toHaveCount(0);
  await page.evaluate(async ({ id, target }) => {
    const path = "/packages/assets/src/database.ts",
      { assetDatabase } = await import(path);
    const attempt = await assetDatabase.getPending(id);
    attempt.target = target;
    await assetDatabase.putPending(attempt);
  }, pendingTarget);
  await retryReimport.click();
  await input.setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: Buffer.from(png),
  });
  await expect(page.getByRole("dialog", { name: "Review reimport" })).toBeVisible();
  await page.getByRole("button", { name: "Apply reimport", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Reimported repair.fbx");
  await expect(retryReimport).toHaveCount(0);
  const checks = await page.evaluate(async () => {
    const p = "/packages/assets/src/pending.ts",
      d = "/packages/assets/src/database.ts";
    const { rememberMissing, repairFiles } = await import(p),
      { AssetDatabase } = await import(d);
    const db = new AssetDatabase("pending-safety"),
      controller = new AbortController();
    const context = {
      id: "attempt",
      projectId: "project",
      recipe: {
        importer: "pinefall-three-185",
        version: 2,
        settings: { unitScale: 1, outputUp: "Y" },
      },
      missing: "albedo.png",
    };
    await rememberMissing([new File(["source"], "model.fbx")], context, controller.signal, db);
    const cold = new AssetDatabase("pending-safety"),
      rows = await cold.pendingImports("project");
    let wrong = false,
      corrupt = false,
      cancelled = false;
    try {
      await repairFiles(rows[0], [], "other", controller.signal);
    } catch {
      wrong = true;
    }
    rows[0].files[0].bytes[0] ^= 1;
    try {
      await repairFiles(rows[0], [], "project", controller.signal);
    } catch {
      corrupt = true;
    }
    controller.abort();
    try {
      await rememberMissing([new File(["new"], "model.fbx")], context, controller.signal, db);
    } catch {
      cancelled = true;
    }
    const retained = await cold.pendingImports("project");
    await db.deletePending("attempt");
    return {
      wrong,
      corrupt,
      cancelled,
      original: new TextDecoder().decode(retained[0].files[0].bytes),
      remaining: (await cold.pendingImports("project")).length,
    };
  });
  const storage = await page.evaluate(async () => {
    const path = "/packages/assets/src/database.ts",
      pendingPath = "/packages/assets/src/pending.ts";
    const { AssetDatabase } = await import(path),
      { rememberMissing } = await import(pendingPath);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("pending-migration", 1);
      request.onupgradeneeded = () => {
        for (const key of ["blobs", "artifacts", "checkpoints"])
          request.result.createObjectStore(key);
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("checkpoints", "readwrite");
        tx.objectStore("checkpoints").put({ marker: "preserved" }, "sentinel");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
    const db = new AssetDatabase("pending-migration");
    await db.pendingSummaries("project");
    const preserved = await new Promise<boolean>((resolve, reject) => {
      const request = indexedDB.open("pending-migration");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result,
          q = db.transaction("checkpoints").objectStore("checkpoints").get("sentinel");
        q.onsuccess = () => {
          resolve(q.result.marker === "preserved" && db.version === 2);
          db.close();
        };
      };
    });
    const context = {
        id: "0",
        projectId: "project",
        recipe: {
          importer: "pinefall-three-185",
          version: 2,
          settings: { unitScale: 1, outputUp: "Y" },
        },
        missing: "missing.png",
      },
      signal = new AbortController().signal;
    for (let i = 0; i < 8; i++)
      await rememberMissing(
        [new File(["source"], "model.fbx")],
        { ...context, id: String(i) },
        signal,
        db,
      );
    let bounded = false,
      quota = false;
    try {
      await rememberMissing(
        [new File(["extra"], "model.fbx")],
        { ...context, id: "9" },
        signal,
        db,
      );
    } catch {
      bounded = true;
    }
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "pending") throw new DOMException("Injected quota", "QuotaExceededError");
      return put.apply(this, args);
    };
    try {
      await rememberMissing([new File(["replacement"], "model.fbx")], context, signal, db);
    } catch {
      quota = true;
    } finally {
      IDBObjectStore.prototype.put = put;
    }
    return {
      preserved,
      bounded,
      quota,
      count: (await db.pendingSummaries("project")).length,
      original: new TextDecoder().decode((await db.getPending("0")).files[0].bytes),
    };
  });
  expect(storage).toEqual({
    preserved: true,
    bounded: true,
    quota: true,
    count: 8,
    original: "source",
  });
  expect(checks).toEqual({
    wrong: true,
    corrupt: true,
    cancelled: true,
    original: "source",
    remaining: 0,
  });
  expect(errors).toEqual([]);
  console.log(
    "PASS persistent missing-companion repair: reload, real FBX conversion, scoped project, digest corruption, cancelled write and discard",
  );
} finally {
  await browser.close();
}
