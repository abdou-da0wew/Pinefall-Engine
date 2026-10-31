import { createGame } from "../packages/project/src";
import { entity, serializeScene } from "../packages/runtime/src/schema";
const scene = createGame("Script Lab");
scene.scripts = [];
for (const name of ["Boost", "BouncePad", "Spawner"])
  scene.scripts.push({
    id: name,
    name: name + ".ts",
    source: await Bun.file("examples/scripts/" + name + ".ts").text(),
  });
scene.entities[1].scripts = [
  { id: "boost-instance", script: "Boost", enabled: true, props: { dashSpeed: 12 } },
];
scene.entities[0].scripts = [
  {
    id: "spawner-instance",
    script: "Spawner",
    enabled: true,
    props: { interval: 2, maxCrates: 6 },
  },
];
const pad = entity("Scripted bounce pad", "box", [4, 0.15, 0], [3, 0.3, 3], "#79ceb5");
pad.physics = { type: "fixed", shape: "box", mass: 1, friction: 0, restitution: 0, sensor: true };
pad.scripts = [{ id: "bounce-instance", script: "BouncePad", enabled: true, props: { height: 4 } }];
scene.entities.push(pad);
await Bun.write("examples/projects/script-lab.scene.json", serializeScene(scene));
console.log("Created Script Lab: E dash, bounce pad, and scripted crate spawner");
