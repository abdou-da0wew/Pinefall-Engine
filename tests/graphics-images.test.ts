import { test, expect } from "bun:test";
import { encodeChannelPNG, decodeChannelPNG } from "../packages/assets/src/png-channels";
import { inspectGraphicsImage } from "../packages/assets/src/graphics-images";
import {
  DEFAULT_SURFACE,
  parseSurface,
  emptyGraphics,
} from "../packages/runtime/src/graphics-definition";
import { textureBinding, parseGraphicsImage } from "../packages/runtime/src/image-definition";
import { createGame } from "../packages/project/src";
import { parseScene } from "../packages/runtime/src/schema";
import { toDataURI } from "../packages/assets/src/glb";
import { projectFiles, sealProjectFiles, sceneFromFiles } from "../packages/project/src/pif";
import {
  referenceScene,
  sceneReferences,
  materializeSceneAsync,
} from "../packages/assets/src/documents";
import { folderLayout, readFolder } from "../packages/project/src/folder-format";
import { blobs } from "../packages/assets/src/blobs";

test("raw channel PNG preserves hidden RGB and alpha exactly, rejects CRC and expansion", async () => {
  const pixels = new Uint8Array([
    12, 34, 56, 0, 130, 71, 19, 128, 10, 20, 30, 255, 254, 252, 250, 1,
  ]);
  const png = await encodeChannelPNG(2, 2, pixels);
  expect((await decodeChannelPNG(png)).pixels).toEqual(pixels);
  expect(inspectGraphicsImage(png)).toEqual({ format: "png", width: 2, height: 2 });
  const bad = png.slice();
  bad[20] ^= 1;
  await expect(decodeChannelPNG(bad)).rejects.toThrow("CRC");
  const header = png.slice();
  new DataView(header.buffer).setUint32(16, 99999);
  expect(() => inspectGraphicsImage(header)).toThrow("dimension");
  await expect(encodeChannelPNG(2049, 1, new Uint8Array())).rejects.toThrow("budget");
});
test("image/map schema validates roles, UV channels, resource references and slot identities", () => {
  expect(() =>
    parseSurface({ ...DEFAULT_SURFACE, maps: { normal: { ...textureBinding("x"), uv: 2 } } }),
  ).toThrow();
  expect(() =>
    parseSurface({ ...DEFAULT_SURFACE, family: "unlit", maps: { normal: textureBinding("x") } }),
  ).toThrow();
  expect(() => parseSurface({ ...DEFAULT_SURFACE, normalScale: [1] })).toThrow();
  expect(() =>
    parseGraphicsImage({ id: "x", name: "x", format: "png", width: 0, height: 1, data: "x" }),
  ).toThrow();
  const scene = createGame("Missing image");
  scene.entities[0].mesh!.surface = {
    ...DEFAULT_SURFACE,
    maps: { color: textureBinding("missing") },
  };
  expect(() => parseScene(scene)).toThrow("Missing/non-LDR");
  delete scene.entities[0].mesh!.surface;
  scene.entities[0].mesh!.slots = [
    { key: "0:0", source: "primitive:box", surface: { ...DEFAULT_SURFACE } },
  ];
  expect(parseScene(scene).entities[0].mesh!.slots![0].key).toBe("0:0");
  scene.entities[0].mesh!.slots.push(scene.entities[0].mesh!.slots[0]);
  expect(() => parseScene(scene)).toThrow("Duplicate material slot");
});
test("image resources and map/slot bindings roundtrip through PIF9, lazy blobs, folder files and portable JSON", async () => {
  const bytes = await encodeChannelPNG(1, 1, new Uint8Array([127, 90, 33, 255]));
  const scene = createGame("Image roundtrip");
  scene.graphics = emptyGraphics();
  scene.graphics.images = [
    {
      id: "image",
      name: "ORM.png",
      format: "png",
      width: 1,
      height: 1,
      data: toDataURI(bytes, "image/png"),
    },
  ];
  scene.entities[0].mesh!.slots = [
    {
      key: "0:0",
      source: "primitive:box",
      surface: {
        ...DEFAULT_SURFACE,
        maps: {
          roughness: textureBinding("image"),
          metalness: textureBinding("image"),
          ao: textureBinding("image"),
        },
        normalScale: [1, -1],
        displacementScale: 0.1,
      },
    },
  ];
  const files = projectFiles(scene);
  expect(JSON.parse(new TextDecoder().decode(files.get("project.json"))).version).toBe(9);
  expect(files.has("images/0.png")).toBe(true);
  const restored = await sceneFromFiles(await sealProjectFiles(files));
  expect(restored.entities[0].mesh!.slots).toEqual(scene.entities[0].mesh!.slots);
  const referenced = await referenceScene(restored);
  expect([...sceneReferences(referenced)]).toContain(referenced.graphics!.images![0].data);
  const layout = await folderLayout(referenced);
  const roundtrip = await readFolder({
    text: async (path) => {
      const value = layout.files.get(path);
      if (typeof value !== "string") throw Error("Expected text");
      return value;
    },
    binary: async (path) => {
      const value = layout.files.get(path);
      if (!value || typeof value === "string") throw Error("Expected binary");
      return { ref: value.ref, bytes: await blobs.sizeOf(value.ref) };
    },
  });
  expect(roundtrip.graphics?.images).toEqual(referenced.graphics?.images);
  const portable = await materializeSceneAsync(roundtrip);
  expect(portable.graphics!.images![0].data.startsWith("data:")).toBe(true);
  expect(parseScene(portable).entities[0].mesh!.slots).toEqual(scene.entities[0].mesh!.slots);
});

test("bounded UV layout inspection and PIF9 headless intent", async () => {
  const T = await import("three"),
    { inspectSlotUV } = await import("../packages/runtime/src/material-slots"),
    { unpackProject } = await import("../packages/project/src/pif"),
    { HeadlessEngine } = await import("../packages/headless/src");
  const root = new T.Group(),
    geometry = new T.PlaneGeometry(1, 1, 80, 80),
    material = new T.MeshBasicMaterial(),
    mesh = new T.Mesh(geometry, material);
  mesh.userData.entityId = "entity";
  root.add(mesh);
  const uv = inspectSlotUV(root, "entity", "0:0", 0);
  expect(uv.truncated).toBe(true);
  expect(uv.triangles.length).toBe(4096 * 6);
  expect(uv.totalTriangles).toBe(12800);
  expect(() => inspectSlotUV(root, "entity", "0:0", 1)).toThrow("does not exist");
  geometry.dispose();
  material.dispose();
  const scene = await unpackProject(
      await Bun.file("examples/projects/materials-post-reference.pif").bytes(),
    ),
    engine = await HeadlessEngine.create(scene);
  try {
    engine.allowSceneScripts = true;
    engine.step(30);
    expect(engine.graphics.snapshot.available).toBe(false);
    expect(engine.graphics.snapshot.requested.scattering?.temporal).toBe(true);
    expect(engine.graphics.snapshot.postTargetBytes).toBe(0);
    expect(engine.document.graphics?.images?.length).toBe(3);
  } finally {
    engine.dispose();
  }
});

test("extended scattering alone selects PIF9 and rejects forged downgrade", async () => {
  const { DEFAULT_POST, DEFAULT_SCATTERING } =
    await import("../packages/runtime/src/graphics-definition");
  const scene = createGame("Scattering format");
  scene.graphics = {
    ...emptyGraphics(),
    post: { ...DEFAULT_POST, scattering: { ...DEFAULT_SCATTERING, temporal: true } },
  };
  const files = projectFiles(scene);
  const manifest = JSON.parse(new TextDecoder().decode(files.get("project.json")));
  expect(manifest.version).toBe(9);
  manifest.version = manifest.minimumReader = 7;
  files.set("project.json", new TextEncoder().encode(JSON.stringify(manifest)));
  await expect(sceneFromFiles(await sealProjectFiles(files))).rejects.toThrow("PIF9");
});

test("prefab graphics remap images and material-slot bindings without mutating sources", async () => {
  const { mergePrefabGraphics } = await import("../packages/editor/src/prefab-graphics");
  const target = createGame("Target"),
    source = createGame("Source");
  const bytes = await encodeChannelPNG(1, 1, new Uint8Array([128, 255, 0, 255]));
  source.graphics = {
    ...emptyGraphics(),
    images: [
      {
        id: "image",
        name: "Map",
        format: "png",
        width: 1,
        height: 1,
        data: toDataURI(bytes, "image/png"),
      },
    ],
    materials: [
      {
        ...DEFAULT_SURFACE,
        id: "material",
        name: "Material",
        maps: { color: textureBinding("image") },
      },
    ],
  };
  source.entities[0].mesh!.slots = [{ key: "0:0", source: "primitive:box", material: "material" }];
  source.entities[0].mesh!.surface = {
    ...DEFAULT_SURFACE,
    maps: { normal: textureBinding("image") },
  };
  const before = JSON.stringify(source),
    remap = mergePrefabGraphics(target, source),
    entity = structuredClone(source.entities[0]);
  remap(entity);
  target.entities.push({ ...entity, id: crypto.randomUUID() });
  expect(parseScene(target).graphics?.images?.length).toBe(1);
  expect(entity.mesh?.slots?.[0].material).not.toBe("material");
  expect(entity.mesh?.surface?.maps?.normal?.image).toBe(target.graphics?.images?.[0].id);
  expect(target.graphics?.materials[0].maps?.color?.image).toBe(target.graphics?.images?.[0].id);
  mergePrefabGraphics(target, source);
  expect(target.graphics?.images?.length).toBe(1);
  expect(JSON.stringify(source)).toBe(before);
});
