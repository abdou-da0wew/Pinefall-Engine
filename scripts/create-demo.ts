import { createGame, importModel, placeModel } from "../packages/project/src";
import { entity, serializeScene } from "../packages/runtime/src/schema";
// Small original GLB model exercises the exact same importer as user assets.
const vertices = new Float32Array([
  0, 1, 0, -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0, 0.5, 0, 0.5, 0.5, 0, -0.5, 0, 1, 0, 0.5, 0, -0.5,
  -0.5, 0, -0.5, 0, 1, 0, -0.5, 0, -0.5, -0.5, 0, 0.5,
]);
const doc = {
  asset: { version: "2.0", generator: "Pinefall demo" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
  materials: [
    {
      pbrMetallicRoughness: {
        baseColorFactor: [1, 0.7, 0.15, 1],
        metallicFactor: 0.2,
        roughnessFactor: 0.6,
      },
      doubleSided: true,
    },
  ],
  buffers: [{ byteLength: vertices.byteLength }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: vertices.byteLength, target: 34962 }],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 12,
      type: "VEC3",
      min: [-0.5, 0, -0.5],
      max: [0.5, 1, 0.5],
    },
  ],
};
const json = new TextEncoder().encode(JSON.stringify(doc)),
  len = Math.ceil(json.length / 4) * 4,
  bytes = new Uint8Array(28 + len + vertices.byteLength),
  v = new DataView(bytes.buffer);
v.setUint32(0, 0x46546c67, true);
v.setUint32(4, 2, true);
v.setUint32(8, bytes.length, true);
v.setUint32(12, len, true);
v.setUint32(16, 0x4e4f534a, true);
bytes.fill(32, 20, 20 + len);
bytes.set(json, 20);
v.setUint32(20 + len, vertices.byteLength, true);
v.setUint32(24 + len, 0x004e4942, true);
bytes.set(new Uint8Array(vertices.buffer), 28 + len);
await Bun.write("examples/projects/signal-crystal.glb", bytes);
let scene = createGame("Beacon Run");
const imported = importModel(scene, "signal-crystal.glb", bytes);
scene = imported.scene;
for (let i = 0; i < 3; i++) {
  const placed = placeModel(scene, imported.asset.id, "Crystal " + (i + 1));
  scene = placed.scene;
  const e = scene.entities.at(-1)!;
  e.transform.position = [(i - 1) * 4, 1, -2 - i * 4];
  e.behavior = "collectible";
  e.physics = {
    type: "fixed",
    shape: "sphere",
    mass: 1,
    friction: 0,
    restitution: 0,
    sensor: true,
  };
}
const goal = entity("Return beacon", "cylinder", [0, 0.5, 10], [3, 1, 3], "#6ac3a1");
goal.behavior = "finish";
goal.physics = { type: "fixed", shape: "box", mass: 1, friction: 0, restitution: 0, sensor: true };
scene.entities.push(goal);
for (let i = 0; i < 4; i++) {
  const wall = entity("Stone barrier " + i, "box", [-9 + i * 6, 1, -7], [2, 2, 2], "#829580");
  wall.physics = {
    type: "fixed",
    shape: "box",
    mass: 1,
    friction: 0.7,
    restitution: 0,
    sensor: false,
  };
  scene.entities.push(wall);
}
await Bun.write("examples/projects/beacon-run.scene.json", serializeScene(scene));
console.log("Created Beacon Run and original GLB crystal asset");
