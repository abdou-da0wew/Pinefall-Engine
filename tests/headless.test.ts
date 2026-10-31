import { test, expect } from "bun:test";
import { HeadlessEngine } from "../packages/headless/src";
import { createGame, importModel, placeModel, validateGlb } from "../packages/project/src";
import { entity } from "../packages/runtime/src/schema";
import { createTemplate } from "../examples/templates";
function glb(doc: object) {
  const text = new TextEncoder().encode(JSON.stringify(doc));
  const n = Math.ceil(text.length / 4) * 4;
  const bytes = new Uint8Array(20 + n);
  const v = new DataView(bytes.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, bytes.length, true);
  v.setUint32(12, n, true);
  v.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20);
  bytes.set(text, 20);
  return bytes;
}
test("headless runs all templates without browser globals", async () => {
  expect(typeof document).toBe("undefined");
  for (const type of ["adventure", "first-person", "driving", "sandbox"] as const) {
    const e = await HeadlessEngine.create(createTemplate(type));
    try {
      e.step(120);
      expect(e.report().ticks).toBe(120);
      expect(e.physics.bodies.size).toBeGreaterThan(0);
    } finally {
      e.dispose();
    }
  }
});
test("headless shared character moves and authored document remains unchanged", async () => {
  const game = createGame("Test");
  const e = await HeadlessEngine.create(game);
  try {
    e.input.add("KeyW");
    e.step(120);
    expect(e.snapshot().entities[1].transform.position[2]).toBeLessThan(5);
    expect(game.entities[1].transform.position[2]).toBe(6);
    expect(e.document.entities[1].transform.position[2]).toBe(6);
  } finally {
    e.dispose();
  }
  expect(() => e.step()).toThrow();
});
test("headless real sensor collision collects a signal", async () => {
  const game = createGame("Signals");
  const sensor = entity("Signal", "sphere", [0, 1, 6], [2, 2, 2]);
  sensor.behavior = "collectible";
  sensor.physics = {
    type: "fixed",
    shape: "sphere",
    mass: 1,
    friction: 0,
    restitution: 0,
    sensor: true,
  };
  game.entities.push(sensor);
  const e = await HeadlessEngine.create(game);
  try {
    e.step(3);
    expect(e.collected.has(sensor.id)).toBe(true);
    expect(e.snapshot().entities[2].enabled).toBe(false);
  } finally {
    e.dispose();
  }
});
test("headless custom scripts execute and errors are isolated", async () => {
  const game = createGame("Scripts");
  game.entities[0].behavior = "test";
  const e = await HeadlessEngine.create(game);
  let n = 0;
  e.registerBehavior("test", () => ({
    fixedUpdate() {
      n++;
      throw Error("intentional");
    },
  }));
  try {
    e.step(10);
    expect(n).toBe(1);
    expect(e.events.entries.filter((e) => e.type === "error").length).toBe(1);
  } finally {
    e.dispose();
  }
});
test("model import deduplicates, places instances, rejects malformed and external GLBs", () => {
  const bytes = glb({ asset: { version: "2.0" }, scenes: [{ nodes: [] }], scene: 0 });
  const first = importModel(createGame("Art"), "sample.glb", bytes);
  const second = importModel(first.scene, "same.glb", bytes);
  expect(second.scene.assets.length).toBe(1);
  expect(placeModel(first.scene, first.asset.id).scene.entities.length).toBe(3);
  expect(() => validateGlb(new Uint8Array(30))).toThrow();
  expect(() =>
    validateGlb(
      glb({ asset: { version: "2.0" }, buffers: [{ uri: "https://example.com/remote.bin" }] }),
    ),
  ).toThrow();
});

test("Beacon Run imported-model quest can collect all signals and finish", async () => {
  const scene = await Bun.file("examples/projects/beacon-run.scene.json").json();
  const sim = await HeadlessEngine.create(scene);
  try {
    const player = scene.entities.find((e: { tag?: string }) => e.tag === "player");
    const body = sim.physics.bodies.get(player.id)!;
    for (const signal of scene.entities.filter(
      (e: { behavior?: string }) => e.behavior === "collectible",
    )) {
      const [x, y, z] = signal.transform.position;
      body.setTranslation({ x, y, z }, true);
      sim.step(3);
    }
    expect(sim.collected.size).toBe(3);
    const goal = scene.entities.find((e: { behavior?: string }) => e.behavior === "finish");
    const [x, y, z] = goal.transform.position;
    body.setTranslation({ x, y: y + 0.5, z }, true);
    sim.step(3);
    expect(sim.won).toBe(true);
  } finally {
    sim.dispose();
  }
});
