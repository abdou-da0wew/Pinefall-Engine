import { test, expect } from "bun:test";
import { AnimationGraph } from "../packages/animation/src/graph";
import { parseAnimator } from "../packages/animation/src/definition";
import { AnimationGraphPlayer } from "../packages/animation/src/graph-player";
import { HeadlessModels } from "../packages/animation/src/headless-models";
import { HeadlessEngine } from "../packages/headless/src";
import { animatorDefinition, animatedScene } from "./animator-fixtures";
import {
  packProject,
  unpackProject,
  inspectProject,
  projectFiles,
  sceneFromFiles,
  sealProjectFiles,
} from "../packages/project/src/pif";
import { serializeScene, parseScene } from "../packages/runtime/src/schema";
import { assetMemory } from "../packages/assets/src/budget";

test("graph references, immediate cycles, deterministic priority and single event ownership", () => {
  const definition = animatorDefinition("clip"),
    bad = structuredClone(definition);
  bad.transitions.push({ ...bad.transitions[0], from: "attack", to: "idle" });
  expect(() => parseAnimator(bad)).toThrow("Immediate");
  bad.transitions[1].minTime = 0.1;
  expect(parseAnimator(bad).transitions.length).toBe(2);
  const graph = new AnimationGraph(definition);
  graph.setParameter("attack", true);
  const events = [];
  for (let i = 0; i < 60; i++) events.push(...graph.advance(1 / 60).events);
  expect(graph.state).toBe("attack");
  expect(events.map((e) => e.id)).toEqual(["hit"]);
  expect(events[0].activation).toBe(2);
  expect(() => graph.setParameter("speed", true)).toThrow();
  expect(() => graph.play("missing")).toThrow();
  expect(graph.state).toBe("attack");
  const competing = structuredClone(definition);
  competing.transitions.push({ ...competing.transitions[0], to: "high", priority: 2 });
  const ranked = new AnimationGraph(competing);
  ranked.setParameter("attack", true);
  ranked.advance(1 / 60);
  expect(ranked.state).toBe("high");
});
test("1D blend phase and cadence use bounded normalized clip samples", () => {
  const graph = new AnimationGraph(animatorDefinition("clip"));
  graph.play("locomotion");
  graph.setParameter("speed", 0.5);
  graph.advance(0.375);
  const frame = graph.frame();
  expect(frame.samples.map((s) => s.weight)).toEqual([0.5, 0.5]);
  expect(frame.samples[0].time).toBeCloseTo(0.5);
  expect(frame.samples[1].time).toBeCloseTo(0.75);
  graph.seek(1);
  expect(graph.frame().samples.map((s) => s.time)).toEqual([1, 1]);
});
test("real skinned graph trim, frozen-source interruption and disposal preserve source data", async () => {
  const { asset, scene, id } = await animatedScene(),
    models = new HeadlessModels(),
    before = assetMemory.snapshot.used;
  await models.prepare(asset.id, asset.data);
  const root = models.acquire(asset.id);
  const player = new AnimationGraphPlayer(
    root,
    scene.entities.find((e) => e.id === id)!.animator!,
    asset.import!,
  );
  const bone = root.getObjectByName("Bone")!;
  player.seek(0.2);
  expect(bone.position.y).toBeCloseTo(0.2);
  player.graph.play("high", 1);
  player.advance(0.25);
  expect(bone.position.y).toBeCloseTo(0.3375, 5);
  const source = bone.position.y;
  player.graph.play("idle", 1);
  player.sample();
  expect(bone.position.y).toBeCloseTo(source, 5);
  player.advance(0.5);
  expect(bone.position.y).toBeCloseTo((source + 0.5) / 2, 5);
  expect(root.animations[0].tracks[0].values[4]).toBe(1);
  player.dispose();
  player.dispose();
  expect(bone.position.y).toBe(0);
  models.release(root);
  models.dispose();
  expect(assetMemory.snapshot.used).toBe(before);
});
test("authored animator PIF v5 and portable scene v3 roundtrip; downgrade fails before adoption", async () => {
  const { scene } = await animatedScene(),
    bytes = await packProject(scene);
  expect((await inspectProject(bytes)).formatVersion).toBe(5);
  expect((await unpackProject(bytes)).entities).toEqual(scene.entities);
  expect(parseScene(JSON.parse(serializeScene(scene))).version).toBe(3);
  expect(() => parseScene({ ...scene, version: 1 })).toThrow("scene v3");
  const files = projectFiles(scene),
    manifest = JSON.parse(new TextDecoder().decode(files.get("project.json")));
  manifest.version = 4;
  manifest.minimumReader = 4;
  files.set("project.json", new TextEncoder().encode(JSON.stringify(manifest)));
  const sealed = await sealProjectFiles(files);
  expect(() => sceneFromFiles(sealed)).toThrow("PIF v5");
});
test("headless uses real skeletal poses, scoped script controls and single gameplay markers", async () => {
  const { scene, id } = await animatedScene();
  scene.scripts = [
    {
      id: "control",
      name: "Control",
      source:
        'export default (ctx) => ({ start(){ctx.animation.setParameter("attack",true);ctx.animation.onEvent(e=>ctx.log("marker:"+e.message));} });',
    },
  ];
  scene.entities.find((e) => e.id === id)!.scripts = [
    { id: "attached", script: "control", enabled: true, props: {} },
  ];
  const before = assetMemory.snapshot.used,
    engine = await HeadlessEngine.create(scene);
  engine.allowSceneScripts = true;
  engine.step(30);
  expect(engine.animators.get(id)!.graph.state).toBe("attack");
  expect(engine.animators.get(id)!.root.getObjectByName("Bone")!.position.y).toBeCloseTo(0.5);
  expect(engine.events.entries.filter((e) => e.message === "marker:hit").length).toBe(1);
  engine.paused = true;
  engine.step(60);
  expect(engine.animators.get(id)!.graph.snapshot.normalized).toBeCloseTo(0.5);
  engine.paused = false;
  engine.step(60);
  expect(engine.events.entries.filter((e) => e.message === "marker:hit").length).toBe(1);
  engine.destroy(id);
  expect(engine.fixed.pendingDestroy.has(id)).toBe(true);
  engine.step();
  expect(engine.animators.size).toBe(0);
  engine.dispose();
  expect(assetMemory.snapshot.used).toBe(before);
});

test("failed animator sampling releases its reservation and queued spawn rolls back completely", async () => {
  const { scene, id, asset } = await animatedScene(),
    models = new HeadlessModels();
  await models.prepare(asset.id, asset.data);
  const root = models.acquire(asset.id),
    original = root.updateMatrixWorld,
    before = assetMemory.snapshot.used;
  root.updateMatrixWorld = () => {
    throw Error("injected pose failure");
  };
  try {
    expect(
      () =>
        new AnimationGraphPlayer(
          root,
          scene.entities.find((e) => e.id === id)!.animator!,
          asset.import!,
        ),
    ).toThrow("injected pose failure");
    expect(assetMemory.snapshot.used).toBe(before);
  } finally {
    root.updateMatrixWorld = original;
    models.release(root);
    models.dispose();
  }
  const engine = await HeadlessEngine.create(scene);
  try {
    engine.play();
    const bytes = assetMemory.snapshot.used,
      copy = structuredClone(scene.entities.find((e) => e.id === id)!);
    copy.id = "bad-spawn";
    copy.animator!.clips.idle.end = 2;
    engine.spawn(copy);
    engine.step();
    expect(engine.document.entities.some((e) => e.id === copy.id)).toBe(false);
    expect(engine.objects.has(copy.id)).toBe(false);
    expect(engine.animators.has(copy.id)).toBe(false);
    expect(engine.physics.bodies.has(copy.id)).toBe(false);
    expect(assetMemory.snapshot.used).toBe(bytes);
    expect(
      engine.events.entries.filter((e) => e.message === "Structural command rejected").length,
    ).toBe(1);
  } finally {
    engine.dispose();
  }
});

test("extreme valid blend durations preserve normalized cadence without exceeding the wall-delta guard", () => {
  const definition = animatorDefinition("clip");
  definition.clips.idle.end = 86400;
  definition.clips.idle.markers = [{ id: "beat", time: 43200, kind: "gameplay", repeat: true }];
  definition.clips.high.start = 0;
  definition.clips.high.end = 0.001;
  const graph = new AnimationGraph(definition);
  graph.play("locomotion");
  graph.setParameter("speed", 1);
  const result = graph.advance(1 / 60);
  expect(result.overflow).toBe(false);
  expect(result.events.length).toBe(17);
  expect(result.events[0].offset).toBeCloseTo(0.0005, 9);
  expect(result.events.at(-1)!.offset).toBeCloseTo(0.0165, 9);
  expect(graph.snapshot.normalized).toBeCloseTo(2 / 3, 8);
});
