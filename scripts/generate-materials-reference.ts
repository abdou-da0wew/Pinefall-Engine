import { createGame } from "../packages/project/src";
import { entity } from "../packages/runtime/src/schema";
import {
  DEFAULT_POST,
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
    name: "Metallic surface (no environment map yet)",
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
await Bun.write("examples/projects/materials-post-reference.pif", await packProject(scene));
console.log("Generated original PIF7 scalar-material, light, post and SDK reference scene");
