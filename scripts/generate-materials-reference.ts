import { encodeChannelPNG } from "../packages/assets/src/png-channels";
import { toDataURI } from "../packages/assets/src/glb";
import { textureBinding } from "../packages/runtime/src/image-definition";
import { createGame } from "../packages/project/src";
import { entity } from "../packages/runtime/src/schema";
import {
  DEFAULT_POST,
  DEFAULT_SCATTERING,
  DEFAULT_SURFACE,
  emptyGraphics,
} from "../packages/runtime/src/graphics-definition";
import { newProjectMetadata } from "../packages/project/src/metadata";
import { packProject } from "../packages/project/src/pif";
const scene = createGame("Materials and post reference");
scene.project = newProjectMetadata(scene.name);
scene.graphics = emptyGraphics();
scene.graphics.post = {
  ...DEFAULT_POST,
  enabled: true,
  bloom: true,
  threshold: 1,
  strength: 0.3,
  radius: 0.3,
  fxaa: true,
  vignette: 0.15,
};
scene.graphics.materials = [
  {
    ...DEFAULT_SURFACE,
    id: "paint",
    name: "Rough painted surface",
    color: "#5598b8",
    roughness: 0.65,
  },
  {
    ...DEFAULT_SURFACE,
    id: "metal",
    name: "Metallic surface with external HDR",
    color: "#d4a657",
    roughness: 0.25,
    metalness: 0.85,
  },
  {
    ...DEFAULT_SURFACE,
    id: "emitter",
    name: "Visible emissive surface — not a light",
    color: "#201010",
    emissive: "#ff4820",
    emissiveIntensity: 3,
  },
  { ...DEFAULT_SURFACE, id: "flat", name: "Unlit surface", family: "unlit", color: "#b9dca4" },
];
for (const [i, material] of scene.graphics.materials.entries()) {
  const item = entity(material.name, "sphere", [-4.5 + i * 3, 1.2, -2], [2, 2, 2]);
  item.mesh!.material = material.id;
  scene.entities.push(item);
  if (material.id === "emitter")
    item.scripts = [{ id: "pulse-attachment", script: "pulse", enabled: true, props: {} }];
}
const lamp = entity("Authored spot light", "sphere", [0, 7, -2], [0.2, 0.2, 0.2], "#ffffff");
lamp.light = {
  type: "spot",
  color: "#fff1d5",
  intensity: 100,
  range: 30,
  angle: 50,
  penumbra: 0.5,
  castShadow: true,
  shadowSize: 1024,
  bias: -0.0005,
  normalBias: 0.02,
};
scene.entities.push(lamp);
scene.scripts = [
  {
    id: "pulse",
    name: "MaterialPulse.ts",
    source: `import {Script} from '@pinefall/sdk';
export default class MaterialPulse extends Script {
  update() {
    this.ctx.graphics.setMaterial(this.ctx.entity.id, {
      emissiveIntensity: 2.5 + Math.sin(this.ctx.time.elapsed * 2) * 0.5
    });
  }
}
`,
  },
];
const checker = new Uint8Array(4 * 4 * 4),
  normal = new Uint8Array(4 * 4 * 4);
for (let y = 0; y < 4; y++)
  for (let x = 0; x < 4; x++) {
    checker.set((x + y) % 2 ? [220, 175, 90, 255] : [35, 80, 125, 255], (y * 4 + x) * 4);
    normal.set([128, 160, 245, 255], (y * 4 + x) * 4);
  }
const hdrHeader = new TextEncoder().encode("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 4 +X 8\n"),
  hdr = new Uint8Array(hdrHeader.length + 128);
hdr.set(hdrHeader);
for (let y = 0; y < 4; y++)
  for (let x = 0; x < 8; x++)
    hdr.set(y < 2 ? [100, 125, 160, 130] : [85, 60, 40, 128], hdrHeader.length + (y * 8 + x) * 4);
scene.graphics.images = [
  {
    id: "checker",
    name: "Original checker.png",
    format: "png",
    width: 4,
    height: 4,
    data: toDataURI(await encodeChannelPNG(4, 4, checker), "image/png"),
  },
  {
    id: "normal",
    name: "Original tangent normal.png",
    format: "png",
    width: 4,
    height: 4,
    data: toDataURI(await encodeChannelPNG(4, 4, normal), "image/png"),
  },
  {
    id: "environment",
    name: "Original sky.hdr",
    format: "hdr",
    width: 8,
    height: 4,
    data: toDataURI(hdr, "application/octet-stream"),
  },
];
scene.graphics.materials[0].maps = {
  color: { ...textureBinding("checker"), repeat: [4, 2] },
  normal: textureBinding("normal"),
};
scene.graphics.materials[0].normalScale = [1, -1];
scene.graphics.environment = {
  sky: "#9fbad0",
  ground: "#3c3020",
  intensity: 1,
  resolution: 128,
  image: "environment",
};
scene.graphics.post.scattering = {
  ...DEFAULT_SCATTERING,
  color: "#b0c5db",
  density: 0.01,
  baseHeight: 0,
  heightFalloff: 0.1,
  maxDistance: 45,
  intensity: 0.4,
  steps: 8,
  resolution: "half",
  lighting: "directional-shadow",
  transparentDepth: "nearest",
  temporal: true,
  historyWeight: 0.8,
};
const mapped = entity("Per-slot displaced checker", "sphere", [0, 1.2, -6], [2, 2, 2]);
mapped.mesh!.slots = [
  {
    key: "0:0",
    source: "primitive:sphere",
    surface: {
      ...DEFAULT_SURFACE,
      maps: { color: textureBinding("checker"), displacement: textureBinding("checker") },
      displacementScale: 0.08,
    },
  },
];
scene.entities.push(mapped);
await Bun.write("examples/projects/materials-post-reference.pif", await packProject(scene));
console.log(
  "Generated original PIF9 maps/UV, per-slot displacement, HDR, scattering, light, post and SDK reference scene",
);
