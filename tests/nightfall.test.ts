import { test, expect } from "bun:test";
import { Combat, FlowField } from "../examples/nightfall/scripts/Rules";
import { nightfallScene } from "../examples/nightfall/generate";
import { HeadlessEngine } from "../packages/headless/src";
import { parseScene } from "../packages/runtime/src/schema";
import { DEFAULT_INPUT_OPTIONS, parseInputOptions } from "../packages/runtime/src/input-options";
test("FPS input options preserve legacy bindings and validate atomic patches", () => {
  expect(DEFAULT_INPUT_OPTIONS.recoverKey).toBe("KeyR");
  expect(parseInputOptions({ ...DEFAULT_INPUT_OPTIONS, recoverKey: null }).recoverKey).toBeNull();
  expect(() => parseInputOptions({ ...DEFAULT_INPUT_OPTIONS, sensitivity: NaN })).toThrow();
  expect(() => parseInputOptions({ ...DEFAULT_INPUT_OPTIONS, recoverKey: "Escape" })).toThrow();
});
test("Nightfall ammo, cadence, reload cancellation, supplies and terminal death", () => {
  const c = new Combat();
  expect(c.fire()).toBe(true);
  expect(c.fire()).toBe(false);
  c.tick(0.3);
  expect(c.fire()).toBe(true);
  expect(c.reload()).toBe(true);
  c.tick(2);
  expect(c.magazines[0]).toBe(15);
  expect(c.reserves[0]).toBe(118);
  c.tick(0.3);
  c.fire();
  c.reload();
  c.switchTo(1);
  c.tick(4);
  expect(c.magazines[0]).toBe(14);
  c.damage(100);
  expect(c.dead).toBe(true);
  expect(c.fire()).toBe(false);
  c.supply();
  expect(c.health).toBe(0);
});
test("Shared distance field routes through a doorway, rejects outside and unreachable cells", () => {
  const f = new FlowField();
  f.obstacle(0, -30, 2, 50);
  f.obstacle(0, 30, 2, 50);
  f.rebuild(10, 0);
  expect(f.direction(-10, 0, 10, 0)[0]).toBeGreaterThan(0);
  expect(f.index(81, 0)).toBe(-1);
  f.obstacle(-20, 0, 2, 160);
  f.rebuild(10, 0);
  expect(f.distance[f.index(-30, 0)]).toBe(-1);
});
test("Nightfall actual trusted scripts: assets, waves, movement, input, death and bounded restart", async () => {
  const scene = await nightfallScene();
  expect(scene.entities.length).toBeLessThan(500);
  expect(scene.assets).toHaveLength(4);
  expect(parseScene(scene).environment.ambient).toBe(0.7);
  const engine = await HeadlessEngine.create(scene);
  try {
    expect(() => engine.play()).toThrow("trusted-code permission");
    engine.allowSceneScripts = true;
    engine.play();
    engine.step(2);
    expect(engine.events.entries.filter((e) => e.type === "error")).toEqual([]);
    expect(engine.inputOptions.recoverKey).toBeNull();
    engine.input.add("KeyW");
    engine.step(60);
    engine.input.clear();
    expect(engine.objects.get("warden")!.position.z).toBeLessThan(18);
    engine.input.add("Mouse0");
    engine.step(30);
    engine.input.clear();
    expect(engine.ui.get("ammo")!.text).not.toContain("15 / 120");
    engine.step(60 * 80);
    expect(engine.events.entries.filter((e) => e.type === "error")).toEqual([]);
    expect(engine.events.entries.some((e) => e.type === "custom:nightfall-death")).toBe(true);
    expect(engine.ui.get("retry")!.visible).toBe(true);
    engine.input.add("Enter");
    engine.step(1);
    expect(engine.ui.get("retry")!.visible).toBe(false);
    expect(engine.ui.get("health")!.text).toContain("100");
    expect(engine.physics.bodies.get("warden")!.translation().z).toBeCloseTo(20, 1);
    expect(engine.document.entities).toHaveLength(scene.entities.length);
    expect(engine.physics.bodies.size).toBeLessThan(300);
  } finally {
    engine.dispose();
  }
}, 30000);

test("Desktop capture permission never extends to arbitrary files, frames or devices", async () => {
  const { allowsGamePermission } = await import("../desktop/game-permissions");
  const allowed = new Set(["file:///app/dist/nightfall.html"]);
  expect(
    allowsGamePermission("pointerLock", "file:///app/dist/nightfall.html?x=1", true, allowed),
  ).toBe(true);
  for (const permission of ["media", "notifications", "geolocation", "openExternal"])
    expect(allowsGamePermission(permission, "file:///app/dist/nightfall.html", true, allowed)).toBe(
      false,
    );
  expect(allowsGamePermission("pointerLock", "file:///tmp/untrusted.html", true, allowed)).toBe(
    false,
  );
  expect(
    allowsGamePermission("pointerLock", "file:///app/dist/nightfall.html", false, allowed),
  ).toBe(false);
});
test("Mouse pulses survive a complete down/up between ticks and are consumed once", async () => {
  const scene = await nightfallScene();
  const engine = await HeadlessEngine.create(scene);
  try {
    engine.allowSceneScripts = true;
    engine.play();
    engine.inputPressed.add("Mouse0");
    engine.step(1);
    expect(engine.inputPressed.size).toBe(0);
    expect(engine.fixed.inputSnapshot.has("Mouse0")).toBe(true);
    engine.step(1);
    expect(engine.fixed.inputSnapshot.has("Mouse0")).toBe(false);
    engine.inputPressed.add("Mouse0");
    engine.paused = true;
    expect(engine.inputPressed.size).toBe(0);
  } finally {
    engine.dispose();
  }
});
test("Pooled projectiles hit an animated enemy through the real Rapier world", async () => {
  const engine = await HeadlessEngine.create(await nightfallScene());
  try {
    engine.allowSceneScripts = true;
    engine.step(340);
    const target = engine.physics.bodies.get("enemy-0")!;
    expect(target.isEnabled()).toBe(true);
    target.setTranslation({ x: 0, y: 0.9, z: 16 }, true);
    target.setNextKinematicTranslation({ x: 0, y: 0.9, z: 16 });
    engine.input.add("Mouse0");
    engine.step(100);
    expect(engine.ui.get("score")!.text).not.toMatch(/^0 KILLS/);
    expect(engine.events.entries.filter((e) => e.type === "error")).toEqual([]);
  } finally {
    engine.dispose();
  }
}, 30000);

test("Nightfall PIF9 and editable folder preserve atmosphere, scripts and animated resources", async () => {
  const { referenceScene } = await import("../packages/assets/src/documents");
  const { blobs } = await import("../packages/assets/src/blobs");
  const { folderLayout, readFolder } = await import("../packages/project/src/folder-format");
  const { packProject, unpackProject } = await import("../packages/project/src/pif");
  const scene = await referenceScene(await nightfallScene()),
    packed = await packProject(scene),
    loaded = await unpackProject(packed);
  expect(loaded.environment).toEqual(scene.environment);
  expect(loaded.scripts).toEqual(scene.scripts);
  expect(loaded.assets).toHaveLength(4);
  const layout = await folderLayout(scene);
  const folder = await readFolder({
    text: async (path) => {
      const value = layout.files.get(path);
      if (typeof value !== "string") throw Error("Missing text");
      return value;
    },
    binary: async (path) => {
      const value = layout.files.get(path);
      if (!value || typeof value === "string") throw Error("Missing binary");
      return { ...value, bytes: await blobs.sizeOf(value.ref) };
    },
  });
  expect(folder.environment).toEqual(scene.environment);
  expect(folder.scripts).toEqual(scene.scripts);
  expect(folder.entities).toHaveLength(365);
}, 30000);
