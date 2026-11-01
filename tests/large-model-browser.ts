import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
const profile = await mkdtemp(resolve("build/large-profile-"));
const browser = await chromium.launchPersistentContext(profile, {
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--js-flags=--expose-gc",
  ],
});
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5173/tests/runtime.html");
  const result = await page.evaluate(
    async (target) => {
      const load = (path: string) => import(path);
      const { prepareImport, adoptImport } = await load("/packages/assets/src/import.ts");
      const { createGame } = await load("/packages/project/src/index.ts");
      const { projectJob } = await load("/packages/project/src/pif-client.ts");
      const { blobs } = await load("/packages/assets/src/blobs.ts");
      const { ModelCache } = await load("/packages/assets/src/cache.ts");
      const { assetDatabase } = await load("/packages/assets/src/database.ts");
      const count = target > 100_000_000 ? 900_000 : Math.floor((target - 2048) / 36) * 3;
      const file = (() => {
        const doc = {
          asset: { version: "2.0" },
          scene: 0,
          scenes: [{ nodes: [0] }],
          nodes: [{ mesh: 0, name: "Large mesh" }],
          meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
          buffers: [{ byteLength: target - 1024 }],
          bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: count * 12 }],
          accessors: [
            {
              bufferView: 0,
              componentType: 5126,
              count,
              type: "VEC3",
              min: [-1, -1, -1],
              max: [1, 1, 1],
            },
          ],
        };
        let text = new TextEncoder().encode(JSON.stringify(doc));
        let size = Math.ceil(text.length / 4) * 4;
        doc.buffers[0].byteLength = target - size - 28;
        text = new TextEncoder().encode(JSON.stringify(doc));
        size = Math.ceil(text.length / 4) * 4;
        doc.buffers[0].byteLength = target - size - 28;
        text = new TextEncoder().encode(JSON.stringify(doc));
        const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(target);
        const v = new DataView(bytes.buffer);
        v.setUint32(0, 0x46546c67, true);
        v.setUint32(4, 2, true);
        v.setUint32(8, target, true);
        v.setUint32(12, size, true);
        v.setUint32(16, 0x4e4f534a, true);
        bytes.fill(32, 20, 20 + size);
        bytes.set(text, 20);
        v.setUint32(20 + size, target - size - 28, true);
        v.setUint32(24 + size, 0x004e4942, true);
        let seed = 17;
        for (let i = 0; i < count * 3; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          v.setFloat32(28 + size + i * 4, (seed / 0xffffffff) * 2 - 1, true);
        }
        return new File([bytes], "large.glb");
      })();
      Reflect.get(window, "gc")?.();
      const signal = new AbortController().signal;
      const stages: string[] = [];
      const imported = await prepareImport([file], signal, (u: { stage: string }) =>
        stages.push(u.stage),
      );
      const scene = adoptImport(createGame("Large model roundtrip"), imported).scene;
      await assetDatabase.saveCheckpoint(scene, 1);
      const checkpoint = await assetDatabase.restoreCheckpoint();
      if (!checkpoint) throw Error("Missing checkpoint");
      if (target > 100_000_000)
        return {
          target,
          vertices: imported.metadata.report.vertices,
          resident: blobs.bytes,
          stages,
          archive: 0,
          roundtrip: true,
          decoded: false,
        };
      const archive = await projectJob("pack", scene);
      const archiveBytes = archive.length;
      const reopened = await projectJob("unpack", archive);
      if (reopened.assets[0].data !== scene.assets[0].data)
        throw Error("Roundtrip reference mismatch");
      const cache = new ModelCache();
      await cache.prepare(reopened.assets[0].data, signal);
      const lease = cache.acquire(reopened.assets[0].data, "large-test");
      let meshes = 0;
      lease.root.traverse((node: { isMesh?: boolean }) => {
        if (node.isMesh) meshes++;
      });
      if (!meshes) throw Error("No decoded meshes");
      lease.release();
      cache.dispose();
      return {
        target,
        vertices: imported.metadata.report.vertices,
        resident: blobs.bytes,
        stages,
        archive: archiveBytes,
        roundtrip: true,
        decoded: true,
      };
    },
    Number(process.env.TEST_MODEL_BYTES ?? 24_000_000),
  );
  expect(result.resident).toBe(0);
  expect(result.roundtrip).toBe(true);
  expect(result.vertices).toBeGreaterThan(500_000);
  console.log("PASS large model:", JSON.stringify(result));
} finally {
  await browser.close();
  await rm(profile, { recursive: true, force: true });
}
