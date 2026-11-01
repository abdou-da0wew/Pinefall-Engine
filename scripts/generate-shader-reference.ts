import { createGame } from "../packages/project/src";
import { entity } from "../packages/runtime/src/schema";
import { DEFAULT_SHADER } from "../packages/runtime/src/shader-definition";
import { emptyGraphics } from "../packages/runtime/src/graphics-definition";
import { packProject } from "../packages/project/src/pif";
const scene = createGame("Custom shader reference");
scene.entities = [];
scene.graphics = emptyGraphics();
scene.graphics.shaders = [
  {
    ...DEFAULT_SHADER,
    id: "checker",
    name: "Linear UV checker",
    fragment: `vec4 shade(vec2 uv, vec3 worldPosition) {
  float checker = mod(floor(uv.x * 8.0) + floor(uv.y * 8.0), 2.0);
  float pulse = 0.8 + 0.2 * sin(uTime);
  return vec4(mix(uTint * 0.2, uTint, checker) * pulse, 1.0);
}`,
    draft: "vec4 shade(vec2 uv, vec3 worldPosition) { unfinished draft; }",
  },
];
scene.entities.push(entity("Floor", "box", [0, -0.5, 0], [20, 1, 20], "#59685f"));
for (const [i, primitive] of (["box", "sphere", "capsule"] as const).entries()) {
  const object = entity("Shader " + primitive, primitive, [-3 + i * 3, 1.5, 0], [2, 2, 2]);
  object.mesh!.shader = "checker";
  scene.entities.push(object);
}
await Bun.write("examples/projects/shader-reference.pif", await packProject(scene));
console.log(
  "Generated shader reference: applied GLSL, separate invalid draft, typed uniforms, explicit trust required",
);
