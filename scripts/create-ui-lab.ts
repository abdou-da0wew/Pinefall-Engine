import { createGame } from "../packages/project/src";
import { entity, serializeScene } from "../packages/runtime/src/schema";
import { sampleHUD, UI_DEMO_SCRIPT } from "../packages/ui/src/presets";
const scene = createGame("UI Lab");
scene.ui = sampleHUD();
scene.scripts = [{ id: "hud-controller", name: "HUDController.ts", source: UI_DEMO_SCRIPT }];
scene.entities[1].scripts = [
  { id: "hud-attachment", script: "hud-controller", enabled: true, props: {} },
];
const hazard = entity("Hazard zone", "box", [0, 0.2, 2], [3, 0.4, 3]);
hazard.tag = "hazard";
hazard.mesh!.color = "#a95339";
hazard.physics = {
  type: "fixed",
  shape: "box",
  mass: 1,
  friction: 0,
  restitution: 0,
  sensor: true,
};
scene.entities.push(hazard);
await Bun.write("examples/projects/ui-lab.scene.json", serializeScene(scene));
