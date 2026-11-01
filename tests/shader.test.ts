import { test, expect } from "bun:test";
import {
  DEFAULT_SHADER,
  parseShader,
  parseShaderAsset,
} from "../packages/runtime/src/shader-definition";
import { createGame } from "../packages/project/src";
import { entity, parseScene } from "../packages/runtime/src/schema";
import { emptyGraphics } from "../packages/runtime/src/graphics-definition";
import {
  projectFiles,
  packProject,
  unpackProject,
  sceneFromFiles,
  sealProjectFiles,
} from "../packages/project/src/pif";
import { HeadlessEngine } from "../packages/headless/src";

function fixture() {
  const scene = createGame("Shader persistence");
  scene.graphics = emptyGraphics();
  scene.graphics.shaders = [
    {
      ...DEFAULT_SHADER,
      id: "custom",
      name: "Custom",
      draft: "invalid unfinished draft",
      draftUniforms: "{ unfinished JSON",
    },
  ];
  const box = entity("Shader cube");
  box.mesh!.shader = "custom";
  scene.entities.push(box);
  return { scene, box };
}
test("shader schemas bound source, typed uniform shapes, references and inventory", () => {
  expect(parseShader(DEFAULT_SHADER)).toEqual(DEFAULT_SHADER);
  expect(() => parseShader({ ...DEFAULT_SHADER, samplers: {} })).toThrow();
  expect(() =>
    parseShader({
      ...DEFAULT_SHADER,
      uniforms: { uValue: { type: "float", value: 0, unknown: true } },
    }),
  ).toThrow();
  for (const uniforms of [
    { uTime: { type: "float", value: 0 } },
    { uBad: { type: "float", value: [0] } },
    { uBad: { type: "vec3", value: [1, 2] } },
    { uBad: { type: "float", value: Infinity } },
    { uBad: { type: "sampler2D", value: 0 } },
    Object.fromEntries(
      Array.from({ length: 17 }, (_, i) => ["uValue" + i, { type: "float", value: 0 }]),
    ),
  ])
    expect(() => parseShader({ ...DEFAULT_SHADER, uniforms })).toThrow();
  expect(() => parseShader({ ...DEFAULT_SHADER, fragment: "x".repeat(16385) })).toThrow();
  expect(() =>
    parseShaderAsset({ ...DEFAULT_SHADER, id: "x", name: "X", draft: "x".repeat(16385) }),
  ).toThrow();
  const { scene, box } = fixture();
  expect(parseScene(scene).graphics?.shaders).toEqual(scene.graphics!.shaders);
  box.mesh!.shader = "missing";
  expect(() => parseScene(scene)).toThrow();
  box.mesh!.shader = "custom";
  scene.graphics!.shaders!.push({ ...scene.graphics!.shaders![0] });
  expect(() => parseScene(scene)).toThrow();
});
test("PIF keeps applied shader and uncompiled draft in independent authenticated entries", async () => {
  const { scene } = fixture();
  const files = projectFiles(scene);
  expect(new TextDecoder().decode(files.get("shaders/0.glsl"))).toBe(DEFAULT_SHADER.fragment);
  expect(new TextDecoder().decode(files.get("shaders/0-draft.glsl"))).toBe(
    "invalid unfinished draft",
  );
  const loaded = await unpackProject(await packProject(scene));
  expect(loaded.graphics?.shaders).toEqual(scene.graphics?.shaders);
  for (const invalid of [
    null,
    { file: "../escape.glsl" },
    { file: "shaders/0.glsl", fragment: "inline code" },
  ]) {
    const tampered = new Map(files);
    const metadata = JSON.parse(new TextDecoder().decode(files.get("scene.json")));
    metadata.graphics.shaders = [invalid];
    tampered.set("scene.json", new TextEncoder().encode(JSON.stringify(metadata)));
    await expect(sceneFromFiles(await sealProjectFiles(tampered))).rejects.toThrow();
  }
});
test("headless custom shader calls reject explicitly without mutating authored sources", async () => {
  const { scene, box } = fixture();
  const before = JSON.stringify(scene);
  const engine = await HeadlessEngine.create(scene);
  try {
    await expect(engine.graphics.compileShader(box.id, DEFAULT_SHADER)).rejects.toThrow("Headless");
    expect(() => engine.graphics.setUniform(box.id, "uTint", [1, 0, 0])).toThrow("Headless");
    expect(JSON.stringify(scene)).toBe(before);
  } finally {
    engine.dispose();
  }
});
