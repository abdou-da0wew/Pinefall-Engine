import { test, expect } from "bun:test";
import { inspectGlb, fromDataURI, imageDimensions } from "../packages/assets/src/glb";
import {
  prepareGlbRecord,
  verifyImport,
  parseImport,
  safeName,
} from "../packages/assets/src/record";
import { adoptImport } from "../packages/assets/src/import";
import { createGame, placeModel } from "../packages/project/src";
import {
  projectFiles,
  packProject,
  unpackProject,
  sealProjectFiles,
  sceneFromFiles,
} from "../packages/project/src/pif";
import { History } from "../packages/editor/src/history";
import { JobQueue } from "../packages/assets/src/jobs";
import { inspectFbx } from "../packages/assets/src/fbx";
import { makeGlb, triangle, binaryFbx, simpleFbx } from "./asset-fixtures";
test("bounded GLB inspection validates geometry and rejects mandatory unknown extensions", () => {
  expect(inspectGlb(triangle()).vertices).toBe(3);
  expect(() =>
    inspectGlb(makeGlb({ asset: { version: "2.0" }, extensionsRequired: ["MALICIOUS_extension"] })),
  ).toThrow("extension");
  expect(() =>
    inspectGlb(makeGlb({ asset: { version: "2.0" }, nodes: [{ children: [0] }] })),
  ).toThrow("Cyclic");
  expect(() =>
    inspectGlb(makeGlb({ asset: { version: "2.0" }, nodes: [{ children: [2] }] })),
  ).toThrow();
  expect(() =>
    inspectGlb(
      makeGlb({
        asset: { version: "2.0" },
        buffers: [{ byteLength: 2, uri: "https://example.com/a" }],
      }),
    ),
  ).toThrow();
  expect(() =>
    inspectGlb(
      makeGlb({
        asset: { version: "2.0" },
        accessors: [{ componentType: 5126, count: 5000000, type: "VEC3" }],
      }),
    ),
  ).toThrow();
});
test("PNG dimensions are inspected without decoding and oversized textures are rejected", () => {
  const bytes = new Uint8Array(24),
    v = new DataView(bytes.buffer);
  v.setUint32(0, 0x89504e47);
  v.setUint32(4, 0x0d0a1a0a);
  v.setUint32(12, 0x49484452);
  v.setUint32(16, 9000);
  v.setUint32(20, 9000);
  expect(imageDimensions(bytes)).toEqual([9000, 9000]);
  expect(() =>
    inspectGlb(
      makeGlb(
        {
          asset: { version: "2.0" },
          buffers: [{ byteLength: 24 }],
          bufferViews: [{ buffer: 0, byteLength: 24 }],
          images: [{ bufferView: 0, mimeType: "image/png" }],
        },
        bytes,
      ),
    ),
  ).toThrow("dimension");
  expect(() => fromDataURI("data:text/html;base64,YQ==")).toThrow();
});
test("stable reimport preserves entity transforms and subasset identity; stale generations fail", async () => {
  const first = adoptImport(
    createGame("Reimport"),
    await prepareGlbRecord("triangle.glb", triangle()),
  );
  const placed = placeModel(first.scene, first.asset.id);
  placed.scene.entities.find((e) => e.id === placed.entity.id)!.transform.position = [4, 5, 6];
  const before = structuredClone(placed.scene.entities);
  const target = { id: first.asset.id, data: first.asset.data, revision: 1 };
  const result = adoptImport(
    placed.scene,
    await prepareGlbRecord("triangle.glb", triangle(2)),
    target,
  );
  expect(result.asset.id).toBe(first.asset.id);
  expect(result.asset.import!.revision).toBe(2);
  expect(result.asset.import!.subassets[0].id).toBe(first.asset.import!.subassets[0].id);
  expect(result.scene.entities).toEqual(before);
  expect(() =>
    adoptImport(
      result.scene,
      { name: result.asset.name, data: result.asset.data, metadata: result.asset.import! },
      target,
    ),
  ).toThrow("changed");
  await verifyImport(result.asset.data, result.asset.import!);
});
test("PIF v3 stores original sources separately, verifies them and preserves v2 without provenance", async () => {
  const result = adoptImport(
    createGame("Sources"),
    await prepareGlbRecord("triangle.glb", triangle()),
  );
  const files = projectFiles(result.scene);
  expect(JSON.parse(new TextDecoder().decode(files.get("project.json"))).version).toBe(3);
  expect(files.has("sources/0-0.bin")).toBe(true);
  expect(new TextDecoder().decode(files.get("scene.json"))).not.toContain("base64");
  const restored = await unpackProject(await packProject(result.scene));
  expect(restored.assets).toEqual(result.scene.assets);
  const damaged = projectFiles(result.scene);
  damaged.set("sources/0-0.bin", triangle(4));
  await expect(sceneFromFiles(await sealProjectFiles(damaged))).rejects.toThrow("Source hash");
  const bad = structuredClone(result.scene);
  bad.assets[0].import!.artifactHash = "0".repeat(64);
  await expect(packProject(bad)).rejects.toThrow("Artifact hash");
});
test("source paths and ambiguous companions are rejected", async () => {
  for (const s of ["../x.png", "https://bad/x", "C:\\x.png", "\0x"])
    expect(() => safeName(s)).toThrow();
  const record = (await prepareGlbRecord("x.glb", triangle())).metadata;
  record.sources.push({ ...record.sources[0], name: "X.GLB" });
  expect(() => parseImport(record)).toThrow("Ambiguous");
});
test("history interns unchanged blobs and releases pins on reset; unicode uses bytes", async () => {
  const result = adoptImport(createGame("History"), await prepareGlbRecord("x.glb", triangle()));
  const history = new History();
  for (let i = 0; i < 20; i++) {
    result.scene.name = "日本" + i;
    history.commit(result.scene);
  }
  const old = history.undo(result.scene)!;
  expect(old.assets[0].data).toBe(result.asset.data);
  expect(history.redo(old)!.assets[0].import).toEqual(result.asset.import);
  expect(history.retainedBytes).toBeGreaterThan(0);
  history.reset();
  expect(history.retainedBytes).toBe(0);
});
test("queue serializes heavy tasks and cancels queued work without invoking it", async () => {
  const queue = new JobQueue();
  let release!: () => void,
    called = false;
  const first = queue.run(
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
  );
  const abort = new AbortController();
  const second = queue.run(async () => {
    called = true;
  }, abort.signal);
  void second.catch(() => {});
  abort.abort();
  await expect(second).rejects.toThrow("Cancelled");
  release();
  await first;
  expect(called).toBe(false);
  expect(await queue.run(async () => 42)).toBe(42);
});

test("FBX binary header, array expansion declarations and ASCII count limits are rejected before parser allocation", async () => {
  await inspectFbx(binaryFbx());
  await inspectFbx(new TextEncoder().encode(simpleFbx));
  const bytes = binaryFbx(),
    bad = bytes.slice(),
    view = new DataView(bad.buffer);
  view.setUint32(27, 0xffffffff, true);
  await expect(inspectFbx(bad)).rejects.toThrow("bounds");
  await expect(
    inspectFbx(new TextEncoder().encode(simpleFbx.replace("*9", "*999999999"))),
  ).rejects.toThrow("count");
});
test("non-finite binary accessor values cannot reach Three or the GPU", () => {
  const bytes = triangle(),
    view = new DataView(bytes.buffer);
  const offset = 28 + view.getUint32(12, true);
  view.setFloat32(offset, NaN, true);
  expect(() => inspectGlb(bytes)).toThrow("Non-finite");
});
