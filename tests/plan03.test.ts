import { test, expect } from "bun:test";
import { createGame } from "../packages/project/src";
import { entity, parseScene, cloneScene } from "../packages/runtime/src/schema";
import {
  emptyGraphics,
  DEFAULT_SURFACE,
  DEFAULT_POST,
  DEFAULT_SCATTERING,
  parsePost,
  parseSurface,
  parseGraphicsDefinition,
  parseLight,
} from "../packages/runtime/src/graphics-definition";
import {
  packProject,
  unpackProject,
  projectFiles,
  sceneFromFiles,
  sealProjectFiles,
} from "../packages/project/src/pif";
import { HeadlessEngine } from "../packages/headless/src";
test("graphics schemas bound scalar values and preserve legacy scene defaults", () => {
  const scene = createGame("Legacy");
  expect(parseScene(scene).graphics).toBeUndefined();
  expect(parsePost(DEFAULT_POST)).toEqual(DEFAULT_POST);
  expect(parseSurface(DEFAULT_SURFACE)).toEqual(DEFAULT_SURFACE);
  for (const patch of [
    { exposure: NaN },
    { strength: 99 },
    { fxaa: "yes" },
    { chromaticAberration: 0.5 },
    { arbitrary: true },
    { scattering: { ...DEFAULT_SCATTERING, steps: 1000 } },
    { scattering: { ...DEFAULT_SCATTERING, density: -1 } },
  ])
    expect(() => parsePost({ ...DEFAULT_POST, ...patch })).toThrow();
  expect(() =>
    parseGraphicsDefinition({
      ...emptyGraphics(),
      materials: [
        { ...DEFAULT_SURFACE, id: "a", name: "A" },
        { ...DEFAULT_SURFACE, id: "a", name: "B" },
      ],
    }),
  ).toThrow();
  expect(() =>
    parseLight({ type: "spot", color: "#ffffff", intensity: 1, range: 10, shadowSize: 4096 }),
  ).toThrow();
});
test("PIF7 persists authored materials, independent lights and post; old archives still load", async () => {
  const scene = createGame("Graphics reference");
  scene.graphics = emptyGraphics();
  scene.graphics.materials = [{ ...DEFAULT_SURFACE, id: "gold", name: "Gold", metalness: 0.8 }];
  scene.graphics.post = {
    ...DEFAULT_POST,
    enabled: true,
    bloom: true,
    fxaa: true,
    scattering: { ...DEFAULT_SCATTERING },
  };
  scene.graphics.environment = { sky: "#ffffff", ground: "#303030", intensity: 1, resolution: 128 };
  const item = entity("Surface");
  item.mesh!.material = "gold";
  item.mesh!.castShadow = false;
  scene.entities.push(item);
  const lamp = entity("Lamp");
  delete lamp.mesh;
  lamp.light = {
    type: "directional",
    color: "#ffffff",
    intensity: 2,
    range: 40,
    castShadow: true,
    shadowSize: 2048,
    normalBias: 0.1,
    shadowUpdate: "manual",
    shadowFrustum: "scene",
    shadowPadding: 2,
  };
  scene.entities.push(lamp);
  const files = projectFiles(scene);
  expect(JSON.parse(new TextDecoder().decode(files.get("project.json"))).version).toBe(7);
  const reopened = await unpackProject(await packProject(scene));
  expect(reopened.graphics).toEqual(scene.graphics);
  expect(reopened.entities.at(-1)?.light).toEqual(lamp.light);
  const manifest = JSON.parse(new TextDecoder().decode(files.get("project.json")));
  manifest.version = 6;
  manifest.minimumReader = 6;
  files.set("project.json", new TextEncoder().encode(JSON.stringify(manifest)));
  await expect(sceneFromFiles(await sealProjectFiles(files))).rejects.toThrow("PIF v7");
  const broken = cloneScene(scene);
  broken.entities.at(-2)!.mesh!.material = "missing";
  expect(() => parseScene(broken)).toThrow("Missing material");
});
test("headless graphics SDK validates intent without mutating authoring or allocating a GPU", async () => {
  const scene = createGame("Headless graphics");
  const item = entity("Box");
  scene.entities.push(item);
  const before = JSON.stringify(scene);
  const engine = await HeadlessEngine.create(scene);
  try {
    expect(engine.graphics.snapshot.available).toBe(false);
    engine.graphics.setPost({ enabled: true, bloom: true, exposure: 2 });
    engine.graphics.setMaterial(item.id, { metalness: 0.7 });
    expect(engine.graphics.snapshot.requested.exposure).toBe(2);
    expect(engine.graphics.snapshot.effective.enabled).toBe(false);
    expect(() => engine.graphics.setMaterial(item.id, { opacity: 4 })).toThrow();
    expect(engine.graphics.snapshot.postTargetBytes).toBe(0);
    expect(JSON.stringify(scene)).toBe(before);
    expect(engine.document.entities.find((e) => e.id === item.id)?.mesh?.surface).toBeUndefined();
  } finally {
    engine.dispose();
  }
});
