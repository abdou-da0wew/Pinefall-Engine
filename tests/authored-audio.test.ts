import { test, expect } from "bun:test";
import { audioDefinition, audioScene } from "./authored-audio-fixtures";
import { parseAudio } from "../packages/audio/src/definition";
import { AudioService, AudioCatalog, AudioEpoch } from "../packages/audio/src/service";
import { NullAudioBackend } from "../packages/audio/src/null";
import { HeadlessEngine } from "../packages/headless/src";
import { assetMemory } from "../packages/assets/src/budget";
import {
  packProject,
  unpackProject,
  inspectProject,
  projectFiles,
  sceneFromFiles,
  sealProjectFiles,
} from "../packages/project/src/pif";
import { parseScene } from "../packages/runtime/src/schema";

test("strict authored cues and WAV resources survive PIF6; downgrade and unsafe data reject", async () => {
  const { scene } = await audioScene(),
    bytes = await packProject(scene);
  expect((await inspectProject(bytes)).formatVersion).toBe(6);
  expect((await unpackProject(bytes)).audio).toEqual(scene.audio);
  const files = projectFiles(scene);
  expect(files.has("audio/0.wav")).toBe(true);
  expect(new TextDecoder().decode(files.get("scene.json"))).not.toContain("data:audio/wav");
  const manifest = JSON.parse(new TextDecoder().decode(files.get("project.json")));
  manifest.version = 5;
  manifest.minimumReader = 5;
  files.set("project.json", new TextEncoder().encode(JSON.stringify(manifest)));
  const sealed = await sealProjectFiles(files);
  expect(() => sceneFromFiles(sealed)).toThrow("PIF v6");
  expect(() => parseScene({ ...scene, version: 1 })).toThrow();
  const bad = audioDefinition();
  bad.cues[0].asset = "missing";
  expect(() => parseAudio(bad)).toThrow();
  expect(() => parseAudio({ ...audioDefinition(), unexpected: true })).toThrow();
  const malformed = audioDefinition();
  malformed.assets[0].data = "data:audio/wav;base64,AAAA";
  const before = assetMemory.snapshot.used;
  await expect(AudioCatalog.prepare(malformed, new AbortController().signal)).rejects.toThrow();
  expect(assetMemory.snapshot.used).toBe(before);
});
test("marker cues emit one explicit null command; pause leaves UI voices responsive", async () => {
  const { scene, id } = await audioScene(),
    before = assetMemory.snapshot.used,
    engine = await HeadlessEngine.create(scene);
  try {
    engine.step(30);
    expect(
      engine.events.entries.filter(
        (e) => e.message === "Audio cue not-rendered" && e.data?.cue === "foot",
      ),
    ).toHaveLength(1);
    const loop = engine.audio.play("loop", "owner");
    expect(loop.status).toBe("not-rendered");
    engine.paused = true;
    expect(engine.audio.play("loop", "owner").status).toBe("blocked");
    const ui = engine.audio.play("interface", "owner");
    expect(ui.status).toBe("not-rendered");
    engine.step(60);
    expect(engine.ticks).toBe(30);
    expect(engine.audio.play("interface", "owner").status).toBe("not-rendered");
    if ("handle" in ui) expect(engine.audio.voices.has(ui.handle)).toBe(false);
    if ("handle" in loop) expect(engine.audio.voices.has(loop.handle)).toBe(true);
    engine.paused = false;
    engine.step(30);
    expect(
      engine.events.entries.filter(
        (e) => e.message === "Audio cue not-rendered" && e.data?.cue === "foot",
      ),
    ).toHaveLength(1);
    engine.destroy(id);
    engine.step();
    engine.audio.stopOwner("owner");
    expect(engine.audio.stats.active).toBe(0);
  } finally {
    engine.dispose();
  }
  expect(assetMemory.snapshot.used).toBe(before);
});
test("scoped script disposal releases its looping voices and cannot stop another owner", async () => {
  const { scene, id } = await audioScene();
  scene.scripts = [
    {
      id: "sound",
      name: "Sound",
      source: 'export default ctx=>({start(){ctx.audio.play("loop");}})',
    },
  ];
  scene.entities.find((e) => e.id === id)!.scripts = [
    { id: "scope", script: "sound", enabled: true, props: {} },
  ];
  const engine = await HeadlessEngine.create(scene);
  engine.allowSceneScripts = true;
  try {
    engine.step();
    expect(engine.audio.stats.active).toBe(1);
    const other = engine.audio.play("loop", "other");
    if ("handle" in other) engine.audio.stop(other.handle, "wrong-owner");
    expect(engine.audio.stats.active).toBe(2);
    engine.destroy(id);
    engine.step();
    expect(engine.audio.stats.active).toBe(1);
    engine.audio.stopOwner("other");
    expect(engine.audio.stats.active).toBe(0);
  } finally {
    engine.dispose();
  }
});
test("preview cleanup is separate from game voice ownership and failed catalog staging preserves live audio", async () => {
  const backend = new NullAudioBackend(),
    service = new AudioService(backend),
    before = assetMemory.snapshot.used;
  try {
    service.adopt(await AudioCatalog.prepare(audioDefinition(), new AbortController().signal));
    await service.settled();
    const result = service.play("loop", "game");
    service.preview("tone");
    expect(service.stats.active).toBe(2);
    service.stopPreviews();
    expect(service.stats.active).toBe(1);
    const bad = audioDefinition();
    bad.assets[0].data = "data:audio/wav;base64,AAAA";
    const accounted = assetMemory.snapshot.used;
    await expect(AudioCatalog.prepare(bad, new AbortController().signal)).rejects.toThrow();
    expect(assetMemory.snapshot.used).toBe(accounted);
    if ("handle" in result) expect(service.voices.has(result.handle)).toBe(true);
    const abort = new AbortController();
    abort.abort();
    await expect(AudioCatalog.prepare(audioDefinition(), abort.signal)).rejects.toThrow();
  } finally {
    await service.dispose();
  }
  expect(assetMemory.snapshot.used).toBe(before);
});
test("audio epoch bounds lookahead, drops late cues and resets across discontinuity", () => {
  const epoch = new AudioEpoch();
  expect(epoch.delay(10, 5, "drop")).toBeCloseTo(0.015);
  expect(epoch.delay(10, 5.1, "drop")).toBeUndefined();
  expect(epoch.delay(10, 5.1, "immediate")).toBe(0);
  epoch.boundary(10, 8);
  expect(epoch.delay(10, 8, "drop")).toBeCloseTo(0.015);
  epoch.reset();
  expect(epoch.delay(0, 9, "drop")).toBeCloseTo(0.015);
});

test("owned workshop combines independent rigs, a wall, one attack hit, turning and UI audio", async () => {
  const { animationAudioTutorial } = await import("../examples/animation-audio-lab");
  const scene = await animationAudioTutorial(),
    player = scene.entities.find((e) => e.tag === "player")!,
    twin = scene.entities.find((e) => e.name === "Independent rig")!,
    engine = await HeadlessEngine.create(scene);
  engine.allowSceneScripts = true;
  try {
    engine.step();
    engine.input.add("KeyW");
    engine.step(300);
    const p = engine.physics.bodies.get(player.id)!.translation();
    expect(p.z).toBeGreaterThan(2.3);
    expect(p.z).toBeLessThan(2.41);
    expect(engine.animators.get(player.id)!.graph.snapshot.normalized).not.toBeCloseTo(
      engine.animators.get(twin.id)!.graph.snapshot.normalized,
      2,
    );
    expect(
      engine.events.entries.some(
        (e) => e.message === "Audio cue not-rendered" && e.data?.cue === "step",
      ),
    ).toBe(true);
    engine.input.clear();
    engine.step(10);
    engine.input.add("KeyF");
    engine.step();
    engine.input.clear();
    engine.step(90);
    expect(engine.ui.get("hits")!.text).toBe("Attack hits: 1");
    expect(engine.animators.get(player.id)!.graph.state).toBe("idle");
    const before = engine.physics.bodies.get(player.id)!.rotation().y;
    engine.input.add("KeyE");
    engine.step();
    engine.input.clear();
    engine.step(40);
    expect(engine.physics.bodies.get(player.id)!.rotation().y).toBeGreaterThan(before + 0.5);
    engine.paused = true;
    engine.step(120);
    engine.ui.dispatch("ui-sound", "click");
    expect(
      engine.events.entries.some(
        (e) => e.message === "Audio cue not-rendered" && e.data?.cue === "interface",
      ),
    ).toBe(true);
    expect(engine.events.entries.filter((e) => e.type === "error")).toEqual([]);
  } finally {
    engine.dispose();
  }
});

test("audio working documents use verified blobs while PIF and portable JSON materialize bytes", async () => {
  const { referenceScene, materializeScene, sceneReferences } =
      await import("../packages/assets/src/documents"),
    { isBlobRef } = await import("../packages/assets/src/blobs");
  const { scene } = await audioScene(),
    working = await referenceScene(scene);
  expect(isBlobRef(working.audio!.assets[0].data)).toBe(true);
  expect(sceneReferences(working).has(working.audio!.assets[0].data)).toBe(true);
  expect(materializeScene(working).audio).toEqual(scene.audio);
  expect((await unpackProject(await packProject(working))).audio).toEqual(scene.audio);
  const engine = await HeadlessEngine.create(working);
  try {
    engine.step(30);
    expect(engine.events.entries.some((e) => e.message === "Audio cue not-rendered")).toBe(true);
  } finally {
    engine.dispose();
  }
});

test("script callback faults immediately release scope-owned audio", async () => {
  const { scene, id } = await audioScene();
  scene.scripts = [
    {
      id: "fault",
      name: "Fault",
      source:
        'export default ctx=>({start(){ctx.audio.play("loop");},fixedUpdate(){throw Error("intentional callback fault");}})',
    },
  ];
  scene.entities.find((e) => e.id === id)!.scripts = [
    { id: "scope", script: "fault", enabled: true, props: {} },
  ];
  const engine = await HeadlessEngine.create(scene);
  engine.allowSceneScripts = true;
  try {
    engine.step();
    expect(engine.audio.stats.active).toBe(0);
    expect(engine.events.entries.some((e) => e.type === "error")).toBe(true);
  } finally {
    engine.dispose();
  }
});

test("pending audio decode retains sources until cancellation settles on replacement and disposal", async () => {
  for (const replacing of [true, false]) {
    const before = assetMemory.snapshot.used,
      backend = new NullAudioBackend(),
      load = backend.loadWave.bind(backend);
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      begun = new Promise<void>((r) => (started = r));
    let calls = 0;
    backend.loadWave = async (id: string, bytes: Uint8Array, signal?: AbortSignal) => {
      if (++calls === 1) {
        started();
        await gate;
      }
      signal?.throwIfAborted();
      load(id, bytes);
    };
    const service = new AudioService(backend),
      first = await AudioCatalog.prepare(audioDefinition(), new AbortController().signal);
    service.adopt(first);
    await begun;
    let disposing: Promise<void> | undefined;
    if (replacing)
      service.adopt(await AudioCatalog.prepare(audioDefinition(), new AbortController().signal));
    else disposing = service.dispose();
    expect(first.waves.size).toBe(1);
    release();
    await (disposing ?? service.settled());
    expect(first.waves.size).toBe(0);
    if (replacing) {
      expect(service.stats.state).toBe("ready");
      expect(service.play("loop").status).toBe("not-rendered");
      await service.dispose();
    }
    expect(assetMemory.snapshot.used).toBe(before);
  }
});
