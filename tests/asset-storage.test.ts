import { test, expect } from "bun:test";
import { BlobStore, BLOB_PREFIX, hashBytes, blobs } from "../packages/assets/src/blobs";
import { referenceScene, materializeScene } from "../packages/assets/src/documents";
import { DependencyGraph, conversionKey } from "../packages/assets/src/dependencies";
import { prepareGlbRecord, reconcileSubassets } from "../packages/assets/src/record";
import { adoptImport } from "../packages/assets/src/import";
import { createGame } from "../packages/project/src";
import { parseScene } from "../packages/runtime/src/schema";
import { triangle } from "./asset-fixtures";
test("immutable deduplicated blobs and atomic hash/budget admission", async () => {
  const store = new BlobStore(8),
    input = new Uint8Array([1, 2, 3]),
    ref = await store.put(input);
  input[0] = 9;
  const copy = store.read(ref);
  copy[0] = 8;
  expect(store.read(ref)[0]).toBe(1);
  expect(await store.put(new Uint8Array([1, 2, 3]))).toBe(ref);
  expect(store.bytes).toBe(3);
  const good = new Uint8Array([4, 5]),
    goodRef = BLOB_PREFIX + (await hashBytes(good));
  await expect(
    store.admit([
      { ref: goodRef, bytes: good },
      { ref: BLOB_PREFIX + "0".repeat(64), bytes: good },
    ]),
  ).rejects.toThrow("hash");
  expect(store.count).toBe(1);
  await expect(store.put(new Uint8Array(6))).rejects.toThrow("budget");
  expect(store.bytes).toBe(3);
  store.retain([]);
  expect(store.bytes).toBe(0);
});
test("reference documents are compact, portable at export, reject mixed schema and wrong hashes", async () => {
  const result = await prepareGlbRecord("triangle.glb", triangle()),
    scene = adoptImport(createGame("refs"), result).scene;
  const working = await referenceScene(scene);
  expect(working.version).toBe(2);
  expect(working.assets[0].data.startsWith(BLOB_PREFIX)).toBe(true);
  const count = blobs.count;
  expect(await referenceScene(working)).toEqual(working);
  expect(blobs.count).toBe(count);
  expect(materializeScene(working)).toEqual(scene);
  const mixed = structuredClone(scene);
  mixed.assets[0].import!.sources = working.assets[0].import!.sources;
  expect(() => parseScene(mixed)).toThrow("embedded");
  const wrong = structuredClone(working);
  wrong.assets[0].data = BLOB_PREFIX + "0".repeat(64);
  expect(() => parseScene(wrong)).toThrow("mismatch");
});
test("dependency source and cooked-output changes invalidate only appropriate direct consumers", () => {
  const graph = new DependencyGraph([
    { id: "source", sourceHash: "a", artifactHash: "b", dependencies: [] },
    {
      id: "raw",
      sourceHash: "x",
      artifactHash: "y",
      dependencies: [{ id: "source", mode: "source" }],
    },
    {
      id: "cooked",
      sourceHash: "x",
      artifactHash: "y",
      dependencies: [{ id: "source", mode: "artifact" }],
    },
  ]);
  expect(graph.changed("source", { sourceHash: "c", artifactHash: "b" })).toEqual(["raw"]);
  expect(graph.changed("source", { sourceHash: "c", artifactHash: "d" })).toEqual(["cooked"]);
  expect(
    () =>
      new DependencyGraph([
        { id: "a", sourceHash: "", artifactHash: "", dependencies: [{ id: "a", mode: "source" }] },
      ]),
  ).toThrow("Cyclic");
  expect(
    () =>
      new DependencyGraph([
        {
          id: "a",
          sourceHash: "",
          artifactHash: "",
          dependencies: [{ id: "missing", mode: "source" }],
        },
      ]),
  ).toThrow("Missing");
});
test("cache identity canonicalizes recipe ordering and invalidates companion bytes/settings", async () => {
  const source = [
    { name: "a", sha256: "one" },
    { name: "texture", sha256: "two" },
  ];
  const key = await conversionKey(source, { a: 1, b: 2 });
  expect(await conversionKey([...source].reverse(), { b: 2, a: 1 })).toBe(key);
  expect(await conversionKey(source, { a: 2, b: 2 })).not.toBe(key);
  expect(
    await conversionKey([{ ...source[0] }, { ...source[1], sha256: "changed" }], { a: 1, b: 2 }),
  ).not.toBe(key);
});
test("explicit rename mapping retains identity and rejects duplicates/foreign IDs", async () => {
  const { metadata } = await prepareGlbRecord("triangle.glb", triangle());
  metadata.report.materials = ["old"];
  metadata.subassets = reconcileSubassets(metadata.report);
  const report = { ...metadata.report, materials: ["new", "other"] };
  const id = metadata.subassets[0].id;
  expect(reconcileSubassets(report, metadata, { "material:name:new": id })[0].id).toBe(id);
  expect(() =>
    reconcileSubassets(report, metadata, { "material:name:new": id, "material:name:other": id }),
  ).toThrow("more than once");
  expect(() => reconcileSubassets(report, metadata, { "material:name:new": "foreign" })).toThrow(
    "Invalid",
  );
});
