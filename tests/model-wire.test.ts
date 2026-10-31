import { test, expect } from "bun:test";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Group, Object3D, type KeyframeTrack, type Interpolant } from "three";
import { encodeModel, decodeModel, transfers } from "../packages/assets/src/wire";
import { makeGlb } from "./asset-fixtures";
function cubic(quaternion = false) {
  const times = [0, 1],
    values = quaternion
      ? [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]
      : [0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
  const bin = new Float32Array([...times, ...values]);
  return makeGlb(
    {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: "Animated" }],
      buffers: [{ byteLength: bin.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 8 },
        { buffer: 0, byteOffset: 8, byteLength: values.length * 4 },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
        { bufferView: 1, componentType: 5126, count: 6, type: quaternion ? "VEC4" : "VEC3" },
      ],
      animations: [
        {
          name: "Cubic",
          samplers: [{ input: 0, output: 1, interpolation: "CUBICSPLINE" }],
          channels: [
            { sampler: 0, target: { node: 0, path: quaternion ? "rotation" : "translation" } },
          ],
        },
      ],
    },
    new Uint8Array(bin.buffer),
  );
}
test("typed animation wire preserves glTF cubic tangent interpolation and normalized quaternions", async () => {
  for (const quaternion of [false, true]) {
    const gltf = await new GLTFLoader().parseAsync(new Uint8Array(cubic(quaternion)).buffer, "");
    gltf.scene.animations = gltf.animations;
    const wire = encodeModel(gltf.scene);
    expect(wire.animations[0].tracks[0].cubic).toBe(true);
    expect(wire.json.animations).toEqual([]);
    expect(transfers(wire).includes(wire.animations[0].tracks[0].values.buffer)).toBe(true);
    const root = await decodeModel(wire, new AbortController().signal);
    type Track = KeyframeTrack & { createInterpolant: () => Interpolant };
    const source = (gltf.animations[0].tracks[0] as Track).createInterpolant(),
      restored = (root.animations[0].tracks[0] as Track).createInterpolant();
    for (const time of [-1, 0, 0.25, 0.5, 0.75, 1, 2]) {
      const a = Array.from(source.evaluate(time)),
        b = Array.from(restored.evaluate(time));
      expect(b.length).toBe(a.length);
      for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(1e-6);
    }
    if (!quaternion) expect(restored.evaluate(0.25)[0]).toBeCloseTo(0.71875, 6);
  }
});
test("large hierarchy reconstruction can be cancelled between host slices", async () => {
  const root = new Group();
  for (let i = 0; i < 2000; i++) root.add(new Object3D());
  const wire = encodeModel(root),
    controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 0);
  try {
    await expect(decodeModel(wire, controller.signal)).rejects.toThrow();
  } finally {
    clearTimeout(timer);
  }
});
test("incremental instance clone remaps bones without duplicating geometry or materials", async () => {
  const T = await import("three"),
    { cloneModel } = await import("../packages/assets/src/clone");
  const source = new T.Group(),
    bone = new T.Bone(),
    mesh = new T.SkinnedMesh(new T.BufferGeometry(), new T.MeshStandardMaterial());
  source.add(bone, mesh);
  mesh.bind(new T.Skeleton([bone]));
  const root = await cloneModel(source, new AbortController().signal),
    copy = root.children[1] as import("three").SkinnedMesh;
  expect(copy.geometry).toBe(mesh.geometry);
  expect(copy.material).toBe(mesh.material);
  expect(copy.skeleton).not.toBe(mesh.skeleton);
  expect(copy.skeleton.bones[0]).toBe(root.children[0] as import("three").Bone);
  copy.skeleton.bones[0].position.x = 5;
  expect(bone.position.x).toBe(0);
  const controller = new AbortController();
  controller.abort();
  await expect(cloneModel(source, controller.signal)).rejects.toThrow();
});

test("large instance cloning yields to cancellation before publication", async () => {
  const { cloneModel } = await import("../packages/assets/src/clone");
  const source = new Group();
  for (let i = 0; i < 2000; i++) source.add(new Object3D());
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 0);
  try {
    await expect(cloneModel(source, controller.signal)).rejects.toThrow();
  } finally {
    clearTimeout(timer);
  }
  expect(source.children.length).toBe(2000);
});
