import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("http://localhost:5173/tests/runtime.html");
  await page.evaluate(async () => {
    const path = "/packages/assets/src/blobs.ts";
    const { DiskBlobStore } = await import(path);
    Reflect.set(window, "diskAcceptance", new DiskBlobStore("disk-acceptance"));
  });
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  await session.send("HeapProfiler.collectGarbage");
  const metric = async () =>
    (await session.send("Performance.getMetrics")).metrics.find((m) => m.name === "JSHeapUsedSize")!
      .value;
  const before = await metric();
  const refs = await page.evaluate(async () => {
    const store = Reflect.get(window, "diskAcceptance");
    const refs: string[] = [];
    for (let i = 0; i < 16; i++) {
      const bytes = new Uint8Array(3_000_000);
      bytes.fill(i + 1);
      refs.push(await store.put(bytes));
      if (store.bytes !== 0) throw Error("Source bytes retained in memory");
    }
    return refs;
  });
  await session.send("HeapProfiler.collectGarbage");
  const growth = (await metric()) - before;
  expect(growth).toBeLessThan(12 * 1024 * 1024);
  await page.reload();
  await page.evaluate(async (refs) => {
    const path = "/packages/assets/src/blobs.ts";
    const { DiskBlobStore } = await import(path);
    const store = new DiskBlobStore("disk-acceptance");
    Reflect.set(window, "diskAcceptance", store);
    const check = (ok: boolean, message: string) => {
      if (!ok) throw Error(message);
    };
    check(store.bytes === 0 && store.count === 0, "fresh store has no resident inventory");
    check((await store.sizeOf(refs[0])) === 3_000_000, "cold metadata");
    const data = await store.readAsync(refs[0]);
    check(data[0] === 1 && data.length === 3_000_000, "cold verified source read");
    check(store.bytes === 0, "read does not populate permanent RAM cache");
    const quota = new DiskBlobStore("disk-quota", 10);
    const results = await Promise.allSettled([
      quota.put(new Uint8Array(8).fill(1)),
      quota.put(new Uint8Array(8).fill(2)),
    ]);
    check(
      results.filter((x) => x.status === "fulfilled").length === 1,
      "concurrent quota admission is atomic",
    );
    check(
      results.filter((x) => x.status === "rejected").length === 1,
      "quota does not fall back to RAM",
    );
    const open = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("disk-acceptance");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = open.transaction("bytes", "readwrite");
      tx.objectStore("bytes").put(new Uint8Array([99]), refs[0]);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    open.close();
    let corrupt = false;
    try {
      await store.readAsync(refs[0]);
    } catch (error) {
      corrupt = String(error).includes("hash mismatch");
    }
    check(corrupt, "cold corruption is rejected, not cached");
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      if (this.name === "bytes") throw new DOMException("injected full disk", "QuotaExceededError");
      return original.apply(this, args);
    };
    let failed = false;
    try {
      await store.put(new Uint8Array([4, 5, 6]));
    } catch {
      failed = true;
    } finally {
      IDBObjectStore.prototype.put = original;
    }
    check(failed && store.bytes === 0, "failed disk transaction has no hidden resident fallback");
  }, refs);
  const second = await page.context().newPage();
  await second.goto("http://localhost:5173/tests/runtime.html");
  await second.evaluate(async (ref) => {
    const path = "/packages/assets/src/blobs.ts";
    const { DiskBlobStore } = await import(path);
    const store = new DiskBlobStore("disk-acceptance");
    await store.readAsync(ref);
    Reflect.set(window, "heldDisk", store);
  }, refs[1]);
  await page.evaluate(async (ref) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("disk-acceptance");
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("metadata", "readwrite"),
        store = tx.objectStore("metadata"),
        r = store.get(ref);
      r.onsuccess = () => {
        r.result.touched = 0;
        store.put(r.result, ref);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    Reflect.get(window, "diskAcceptance").retain([]);
  }, refs[1]);
  async function pruneAndExists() {
    return page.evaluate(async (ref) => {
      await Reflect.get(window, "diskAcceptance").prune([]);
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open("disk-acceptance");
        r.onsuccess = () => resolve(r.result);
      });
      const exists = await new Promise<boolean>((resolve) => {
        const r = db.transaction("metadata").objectStore("metadata").getKey(ref);
        r.onsuccess = () => resolve(r.result !== undefined);
      });
      db.close();
      return exists;
    }, refs[1]);
  }
  expect(await pruneAndExists()).toBe(true);
  await second.close();
  await expect.poll(pruneAndExists).toBe(false);
  console.log(
    "PASS 48 MB durable sources, zero permanent byte cache, cold reload/read, hash corruption, concurrent quota injected write failure and cross-window reclamation safety; measured post-GC JS heap growth " +
      Math.round(growth / 1024) +
      " KiB",
  );
} finally {
  await browser.close();
}
