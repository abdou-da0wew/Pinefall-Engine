import { test, expect } from "bun:test";
import { defaultRecipe, parseRecipe, normalizeGlb } from "../packages/assets/src/recipe";
import { prepareGlbRecord, reconcileSubassets, parseImport } from "../packages/assets/src/record";
import { adoptImport } from "../packages/assets/src/import";
import { createGame } from "../packages/project/src";
import {
  packProject,
  unpackProject,
  projectFiles,
  sceneFromFiles,
  sealProjectFiles,
} from "../packages/project/src/pif";
import { inspectGlb } from "../packages/assets/src/glb";
import { makeGlb, skinnedTriangle } from "./asset-fixtures";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Vector3, AnimationMixer } from "three";
const recipe = { ...defaultRecipe(), settings: { unitScale: 0.01, outputUp: "Z" as const } };
test("normalization changes world coordinates without rewriting skin/animation source data", async () => {
  const input = skinnedTriangle(),
    before = new Uint8Array(input),
    cooked = normalizeGlb(input, recipe);
  expect(input).toEqual(before);
  expect(normalizeGlb(input, recipe)).toEqual(cooked);
  const loader = new GLTFLoader();
  const a = await loader.parseAsync(new Uint8Array(input).buffer, ""),
    b = await loader.parseAsync(new Uint8Array(cooked).buffer, "");
  const ma = new AnimationMixer(a.scene),
    mb = new AnimationMixer(b.scene);
  ma.clipAction(a.animations[0]).play();
  mb.clipAction(b.animations[0]).play();
  ma.update(0.5);
  mb.update(0.5);
  a.scene.updateMatrixWorld(true);
  b.scene.updateMatrixWorld(true);
  const expected = a.scene.getObjectByName("Bone")!.getWorldPosition(new Vector3());
  expected.set(expected.x, expected.z, -expected.y).multiplyScalar(0.01);
  expect(
    b.scene.getObjectByName("Bone")!.getWorldPosition(new Vector3()).distanceTo(expected),
  ).toBeLessThan(1e-6);
  expect(inspectGlb(cooked).clips).toEqual(inspectGlb(input).clips);
  expect(inspectGlb(cooked).identities?.some((i) => i.label === "Pinefall normalization")).toBe(
    false,
  );
});
test("PIF v4 preserves explicit recipe and wider identities; downgrade and legacy recipe injection fail", async () => {
  const prepared = await prepareGlbRecord("rig.glb", skinnedTriangle(), recipe),
    scene = adoptImport(createGame("Normalized"), prepared).scene;
  expect(prepared.metadata.version).toBe(2);
  expect(prepared.metadata.subassets).toEqual([]);
  expect(scene.assets[0].import!.subassets.some((s) => s.kind === "skeleton")).toBe(true);
  const files = projectFiles(scene),
    manifest = JSON.parse(new TextDecoder().decode(files.get("project.json")));
  expect(manifest.version).toBe(4);
  expect(manifest.minimumReader).toBe(4);
  const roundtrip = await unpackProject(await packProject(scene));
  expect(roundtrip.assets[0].import).toEqual(scene.assets[0].import);
  manifest.version = 3;
  manifest.minimumReader = 3;
  files.set("project.json", new TextEncoder().encode(JSON.stringify(manifest)));
  const sealed = await sealProjectFiles(files);
  await expect(sceneFromFiles(sealed)).rejects.toThrow("v4");
  expect(() =>
    parseRecipe({ importer: "pinefall-three-185", version: 1, settings: recipe.settings }),
  ).toThrow("Legacy");
  expect(() => parseRecipe({ ...recipe, settings: { unitScale: NaN, outputUp: "Z" } })).toThrow();
  expect(() => parseImport({ ...prepared.metadata, version: 1 })).toThrow();
});
test("source IDs survive node rename/reorder; duplicate names demand explicit kind-safe mapping", async () => {
  const a = makeGlb({
    asset: { version: "2.0" },
    scenes: [{ nodes: [0, 1] }],
    nodes: [{ name: "Left", extras: { pinefallSourceId: "persistent-left" } }, { name: "Right" }],
  });
  const b = makeGlb({
    asset: { version: "2.0" },
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: "Right" },
      { name: "Renamed", extras: { pinefallSourceId: "persistent-left" } },
    ],
  });
  const old = (await prepareGlbRecord("a.glb", a, defaultRecipe())).metadata;
  old.subassets = reconcileSubassets(old.report);
  const report = inspectGlb(b),
    next = reconcileSubassets(report, old);
  expect(next.find((s) => s.key === "source:persistent-left")!.id).toBe(
    old.subassets.find((s) => s.key === "source:persistent-left")!.id,
  );
  const duplicate = inspectGlb(
    makeGlb({ asset: { version: "2.0" }, nodes: [{ name: "Same" }, { name: "Same" }] }),
  );
  expect(duplicate.identities!.every((i) => i.ambiguous)).toBe(true);
  const id = old.subassets[0].id,
    key = duplicate.identities![0].key;
  expect(reconcileSubassets(duplicate, old, { ["node:" + key]: id })[0].id).toBe(id);
  expect(() => reconcileSubassets(duplicate, old, { ["node:" + key]: "foreign" })).toThrow(
    "Invalid",
  );
});
test("GLB skin/animation validation rejects missing joints and nonmonotonic times before Three", () => {
  const decode = (bytes: Uint8Array) => {
    const v = new DataView(bytes.buffer),
      length = v.getUint32(12, true);
    return {
      doc: JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))),
      bin: bytes.slice(28 + length),
    };
  };
  const { doc, bin } = decode(skinnedTriangle());
  doc.skins[0].joints = [999];
  expect(() => inspectGlb(makeGlb(doc, bin))).toThrow("joint");
  const fresh = decode(skinnedTriangle()),
    animation = fresh.doc.animations[0],
    accessor = fresh.doc.accessors[animation.samplers[0].input],
    view = fresh.doc.bufferViews[accessor.bufferView];
  const data = new DataView(fresh.bin.buffer);
  data.setFloat32((view.byteOffset || 0) + (accessor.byteOffset || 0) + 4, -1, true);
  expect(() => inspectGlb(makeGlb(fresh.doc, fresh.bin))).toThrow("times");
});
test("scene roots and primitive instancing expansion are bounded before loader allocation", () => {
  expect(() =>
    inspectGlb(makeGlb({ asset: { version: "2.0" }, nodes: [{}], scenes: [{ nodes: [0, 0] }] })),
  ).toThrow("roots");
  expect(() =>
    inspectGlb(makeGlb({ asset: { version: "2.0" }, nodes: [{}], scenes: [{ nodes: [999] }] })),
  ).toThrow("root");
  const bytes = skinnedTriangle(),
    v = new DataView(bytes.buffer),
    size = v.getUint32(12, true),
    doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + size))),
    bin = bytes.slice(28 + size);
  doc.meshes[0].primitives = Array.from({ length: 128 }, () =>
    structuredClone(doc.meshes[0].primitives[0]),
  );
  doc.nodes = Array.from({ length: 32 }, () => ({ mesh: 0 }));
  doc.skins = [];
  doc.animations = [];
  doc.scenes = [{ nodes: doc.nodes.map((_: unknown, i: number) => i) }];
  expect(() => inspectGlb(makeGlb(doc, bin))).toThrow("Expanded");
});

test("optional GPU instancing cannot bypass expanded-object admission", () => {
  const bytes = makeGlb({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 0 } } } }],
  });
  expect(() => inspectGlb(bytes)).toThrow("GPU instancing");
});

test("shared accessors cannot hide aggregate skeleton matrix expansion", () => {
  const joints = Array.from({ length: 2048 }, (_, i) => i);
  const bytes = makeGlb({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: joints.map(() => ({})),
    skins: Array.from({ length: 5 }, () => ({ joints })),
  });
  expect(() => inspectGlb(bytes)).toThrow("Aggregate skeleton joint budget");
});
