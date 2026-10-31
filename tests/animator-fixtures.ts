import type { AnimatorDefinition } from "../packages/animation/src/definition";
import { prepareGlbRecord } from "../packages/assets/src/record";
import { adoptImport } from "../packages/assets/src/import";
import { createGame, placeModel } from "../packages/project/src";
import { skinnedTriangle } from "./asset-fixtures";
export function animatorDefinition(subasset: string): AnimatorDefinition {
  return {
    version: 1,
    initial: "idle",
    parameters: { attack: false, speed: 0 },
    clips: {
      idle: { subasset, start: 0, end: 1 },
      attack: { subasset, start: 0, end: 1, markers: [{ id: "hit", time: 0.5, kind: "gameplay" }] },
      high: { subasset, start: 0.5, end: 1 },
    },
    states: {
      idle: { clip: "idle", loop: true, speed: 1 },
      attack: { clip: "attack", loop: false, speed: 1 },
      high: { clip: "high", loop: true, speed: 1 },
      locomotion: {
        clip: "idle",
        loop: true,
        speed: 1,
        blend: {
          parameter: "speed",
          points: [
            { value: 0, clip: "idle" },
            { value: 1, clip: "high" },
          ],
        },
      },
    },
    transitions: [
      {
        from: "idle",
        to: "attack",
        parameter: "attack",
        operator: "eq",
        value: true,
        fade: 0.2,
        priority: 1,
        minTime: 0,
      },
    ],
  };
}
export async function animatedScene() {
  const imported = adoptImport(
      createGame("Animated fixture"),
      await prepareGlbRecord("rig.glb", skinnedTriangle()),
    ),
    placed = placeModel(imported.scene, imported.asset.id);
  const subasset = imported.asset.import!.subassets.find((s) => s.kind === "clip")!;
  placed.scene.version = 3;
  placed.scene.entities.find((e) => e.id === placed.entity.id)!.animator = animatorDefinition(
    subasset.id,
  );
  return { scene: placed.scene, id: placed.entity.id, asset: imported.asset };
}
