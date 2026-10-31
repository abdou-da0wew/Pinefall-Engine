import { decodeTrack } from "../packages/assets/src/animation-wire";
import { test, expect } from "bun:test";
import * as T from "three";
import {
  RootMotion,
  composeMotion,
  inverseMotion,
  motionPower,
} from "../packages/animation/src/root-motion";
import { AnimationGraphPlayer } from "../packages/animation/src/graph-player";
import { HeadlessEngine } from "../packages/headless/src";
import { animatedScene, rootMotionScene } from "./animator-fixtures";
import { parseScene } from "../packages/runtime/src/schema";
import { packProject, unpackProject } from "../packages/project/src/pif";
import { assetMemory } from "../packages/assets/src/budget";

test("planar motion composition handles turn loops and inverse cycles", () => {
  const stride = { x: 0, z: 2, yaw: Math.PI / 2 },
    closed = motionPower(stride, 4);
  expect(Math.hypot(closed.x, closed.z)).toBeLessThan(1e-12);
  expect(closed.yaw).toBeCloseTo(0, 10);
  const identity = composeMotion(motionPower(stride, 12345), motionPower(stride, -12345));
  expect(Math.hypot(identity.x, identity.z)).toBeLessThan(1e-10);
  expect(composeMotion(stride, inverseMotion(stride)).yaw).toBeCloseTo(0, 10);
});
test("original tracks yield loop-aware yaw/translation, preserve vertical bob and compensate visual travel", async () => {
  const { scene, id, asset } = await animatedScene(),
    definition = scene.entities.find((e) => e.id === id)!.animator!;
  definition.rootMotion = { node: "Bone" };
  const root = new T.Group(),
    bone = new T.Bone();
  bone.name = "Bone";
  root.add(bone);
  root.animations = [
    new T.AnimationClip("Lift", 1, [
      new T.VectorKeyframeTrack("Bone.position", [0, 1], [0, 0, 0, 0, 0.4, 2]),
      new T.QuaternionKeyframeTrack(
        "Bone.quaternion",
        [0, 1],
        [0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2],
      ),
    ]),
  ];
  const before = assetMemory.snapshot.used,
    player = new AnimationGraphPlayer(root, definition, asset.import!);
  try {
    const first = player.advance(0.25).rootDelta!;
    expect(first.z).toBeCloseTo(0.5);
    expect(first.yaw).toBeCloseTo(Math.PI / 8);
    expect(bone.position.z).toBe(0);
    expect(bone.position.y).toBeCloseTo(0.1);
    expect(bone.quaternion.y).toBeCloseTo(0);
    let total = first;
    for (let i = 1; i < 16; i++) total = composeMotion(total, player.advance(0.25).rootDelta!);
    expect(Math.hypot(total.x, total.z)).toBeLessThan(1e-5);
    expect(total.yaw).toBeCloseTo(0, 5);
    player.seek(0.8);
    const afterSeek = player.advance(0.1).rootDelta!;
    expect(Math.hypot(afterSeek.x, afterSeek.z)).toBeCloseTo(0.2, 5);
    player.graph.setPlaybackSpeed(-1);
    const reverse = player.advance(0.1).rootDelta!;
    expect(composeMotion(afterSeek, reverse).z).toBeCloseTo(0, 5);
    const pose = bone.position.clone(),
      snapshot = player.graph.snapshot;
    expect(player.rootMotion!.path("idle").length).toBe(61);
    expect(bone.position.equals(pose)).toBe(true);
    expect(player.graph.snapshot).toEqual(snapshot);
    player.graph.play("idle", 1);
    const fading = player.advance(0.1).rootDelta!;
    expect(Math.hypot(fading.x, fading.z)).toBeCloseTo(0.01, 5);
  } finally {
    player.dispose();
  }
  expect(assetMemory.snapshot.used).toBe(before);
});
test("actual imported root motion is collision corrected, gravity owned, seek-safe and serialized", async () => {
  const { scene, id } = await rootMotionScene(),
    copy = await unpackProject(await packProject(scene));
  expect(copy.entities.find((e) => e.id === id)!.animator!.rootMotion).toEqual({ node: "Bone" });
  const before = assetMemory.snapshot.used,
    engine = await HeadlessEngine.create(copy);
  try {
    engine.step(180);
    const body = engine.physics.bodies.get(id)!,
      p = body.translation();
    expect(p.z).toBeGreaterThan(2.2);
    expect(p.z).toBeLessThan(2.41);
    expect(p.y).toBeGreaterThan(0.8);
    expect(p.y).toBeLessThan(1);
    expect(engine.animators.get(id)!.root.getObjectByName("Bone")!.position.z).toBe(0);
    engine.animators.get(id)!.seek(0.9);
    engine.step();
    expect(body.translation().z).toBeCloseTo(p.z, 3);
    engine.animators.get(id)!.graph.paused = true;
    engine.input.add("KeyW");
    engine.step(60);
    expect(body.translation().z).toBeCloseTo(p.z, 3);
    expect(engine.events.entries.filter((e) => e.type === "error")).toEqual([]);
  } finally {
    engine.dispose();
  }
  expect(assetMemory.snapshot.used).toBe(before);
});
test("nonloop completion and resets do not reapply the whole root displacement", async () => {
  const { scene, id } = await rootMotionScene(false);
  const actor = scene.entities.find((e) => e.id === id)!;
  actor.animator!.states.idle.loop = false;
  scene.entities = [actor];
  scene.environment.gravity = 0;
  const engine = await HeadlessEngine.create(scene);
  try {
    engine.step(120);
    expect(engine.physics.bodies.get(id)!.translation().z).toBeCloseTo(2, 4);
    engine.animators.get(id)!.graph.reset();
    engine.step();
    expect(engine.physics.bodies.get(id)!.translation().z).toBeCloseTo(2 + 2 / 60, 4);
  } finally {
    engine.dispose();
  }
});
test("unsupported root physics and ambiguous/animated ancestor bindings fail explicitly", async () => {
  const { scene, id } = await rootMotionScene();
  scene.entities.find((e) => e.id === id)!.physics!.type = "dynamic";
  expect(() => parseScene(scene)).toThrow("kinematic capsule");
  const root = new T.Group(),
    parent = new T.Group(),
    bone = new T.Bone();
  parent.name = "Parent";
  bone.name = "Bone";
  parent.add(bone);
  root.add(parent);
  const definition = scene.entities.find((e) => e.id === id)!.animator!;
  expect(
    () =>
      new RootMotion(
        root,
        definition,
        new Map([
          [
            "idle",
            new T.AnimationClip("idle", 1, [
              new T.VectorKeyframeTrack("Parent.position", [0, 1], [0, 0, 0, 1, 0, 0]),
            ]),
          ],
        ]),
      ),
  ).toThrow("Animated");
  const second = bone.clone();
  root.add(second);
  expect(() => new RootMotion(root, definition, new Map())).toThrow("unique");
});

test("a newly loaded nearby wall blocks the very first root-motion proposal without a warm-up step", async () => {
  const { scene, id } = await rootMotionScene(),
    actor = scene.entities.find((e) => e.id === id)!;
  actor.transform.position[2] = 2.37;
  actor.animator!.states.idle.speed = 8;
  const engine = await HeadlessEngine.create(scene);
  try {
    let steps = 0;
    const step = engine.physics.world.step.bind(engine.physics.world);
    engine.physics.world.step = (...args) => {
      steps++;
      return step(...args);
    };
    engine.step();
    expect(steps).toBe(1);
    expect(engine.physics.bodies.get(id)!.translation().z).toBeLessThan(2.376);
  } finally {
    engine.dispose();
  }
});

test("root trims preserve cubic tangents rather than resampling a linear endpoint chord", async () => {
  const { scene, id, asset } = await animatedScene(),
    definition = scene.entities.find((e) => e.id === id)!.animator!;
  definition.rootMotion = { node: "Bone" };
  definition.clips.idle.start = 0.25;
  definition.clips.idle.end = 0.75;
  const root = new T.Group(),
    bone = new T.Bone();
  bone.name = "Bone";
  root.add(bone);
  const track = decodeTrack({
    name: "Bone.position",
    type: "vector",
    times: new Float32Array([0, 1]),
    values: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 2, 0, 0, 0]),
    interpolation: T.InterpolateLinear,
    cubic: true,
  });
  root.animations = [new T.AnimationClip("Lift", 1, [track])];
  const player = new AnimationGraphPlayer(root, definition, asset.import!);
  try {
    expect(player.advance(0.25).rootDelta!.z).toBeCloseTo(0.625, 6);
    expect(bone.position.z).toBe(0);
  } finally {
    player.dispose();
  }
});
test("a wall spawned during Play blocks movement on its admission tick", async () => {
  const { scene, id } = await rootMotionScene(false),
    actor = scene.entities.find((e) => e.id === id)!;
  actor.animator!.states.idle.speed = 8;
  const engine = await HeadlessEngine.create(scene);
  try {
    engine.step();
    const before = engine.physics.bodies.get(id)!.translation().z;
    engine.spawn({
      id: "new-wall",
      name: "New wall",
      enabled: true,
      transform: { position: [0, 1.5, before + 0.65], rotation: [0, 0, 0], scale: [10, 3, 0.5] },
      physics: {
        type: "fixed",
        shape: "box",
        mass: 1,
        friction: 0.5,
        restitution: 0,
        sensor: false,
      },
    });
    engine.step();
    expect(engine.physics.bodies.get(id)!.translation().z - before).toBeLessThan(0.026);
  } finally {
    engine.dispose();
  }
});

test("blended root velocities and interrupted fades stay bounded without source-pose teleports", async () => {
  const { scene, id, asset } = await animatedScene(),
    definition = scene.entities.find((e) => e.id === id)!.animator!;
  definition.rootMotion = { node: "Bone" };
  definition.clips.high = { subasset: "fast", start: 0, end: 1 };
  asset.import!.subassets.push({ id: "fast", key: "name:Fast", kind: "clip" });
  asset.import!.report.clips.push("Fast");
  const root = new T.Group(),
    bone = new T.Bone();
  bone.name = "Bone";
  root.add(bone);
  root.animations = [
    new T.AnimationClip("Lift", 1, [
      new T.VectorKeyframeTrack("Bone.position", [0, 1], [0, 0, 0, 0, 0, 2]),
    ]),
    new T.AnimationClip("Fast", 1, [
      new T.VectorKeyframeTrack("Bone.position", [0, 1], [0, 0, 0, 0, 0, 4]),
    ]),
  ];
  const player = new AnimationGraphPlayer(root, definition, asset.import!);
  try {
    player.graph.play("locomotion");
    player.graph.setParameter("speed", 0.5);
    expect(player.advance(0.1).rootDelta!.z).toBeCloseTo(0.3, 6);
    player.graph.play("high", 1);
    expect(player.advance(0.25).rootDelta!.z).toBeCloseTo(0.125, 6);
    player.graph.play("idle", 0.5);
    expect(player.advance(0.25).rootDelta!.z).toBeCloseTo(0.125, 6);
    expect(bone.position.z).toBe(0);
    expect(root.animations[0].tracks[0].values[5]).toBe(2);
  } finally {
    player.dispose();
  }
});
