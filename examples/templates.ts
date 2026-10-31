import { entity } from "../packages/runtime/src/schema";
import type { Entity, SceneDocument, Template, Vec3 } from "../packages/runtime/src/schema";
function solid(name: string, p: Vec3, s: Vec3, color: string, dynamic = false) {
  const e = entity(name, "box", p, s, color);
  e.physics = {
    type: dynamic ? "dynamic" : "fixed",
    shape: "box",
    mass: dynamic ? 2 : 1,
    friction: 0.7,
    restitution: 0.15,
    sensor: false,
  };
  return e;
}
export function createTemplate(kind: Template): SceneDocument {
  const entities: Entity[] = [];
  const add = (e: Entity) => {
    entities.push(e);
    return e;
  };
  add(solid("Valley floor", [0, -0.5, 0], [64, 1, 64], "#536b61")).tag = "ground";
  add(solid("Raised stone terrace", [0, 0.2, -9], [18, 0.4, 14], "#89998b"));
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 4;
    add(solid("Old colonnade " + (i + 1), [x, 2.5, -14], [0.9, 5, 0.9], "#a7b3a0"));
  }
  add(solid("Temple lintel", [0, 5.3, -14], [22, 0.7, 1.4], "#c5c8ad"));
  for (let i = 0; i < 20; i++) {
    const angle = i * 2.399,
      x = Math.cos(angle) * (18 + (i % 4) * 3),
      z = Math.sin(angle) * (18 + (i % 4) * 3);
    add(
      entity(
        "Pine canopy " + (i + 1),
        "cone",
        [x, 3, z],
        [3.5, 6, 3.5],
        i % 2 ? "#264d43" : "#3c6250",
      ),
    );
    add(entity("Pine trunk " + (i + 1), "cylinder", [x, 1, z], [0.4, 2, 0.4], "#786b55"));
  }
  for (let i = 0; i < 8; i++)
    add(
      solid(
        "Supply crate " + (i + 1),
        [-5 + (i % 4) * 1.3, 1.2 + Math.floor(i / 4) * 1.5, -2],
        [1, 1, 1],
        i % 2 ? "#b9905c" : "#8b7356",
        true,
      ),
    );
  const lamp = add(entity("Lantern — west", "sphere", [-7, 4, -8], [0.3, 0.3, 0.3], "#ffe2a3"));
  lamp.light = { type: "spot", color: "#ffcf8d", intensity: 65, range: 15 };
  const lamp2 = add(entity("Lantern — east", "sphere", [7, 4, -8], [0.3, 0.3, 0.3], "#ffe2a3"));
  lamp2.light = { type: "spot", color: "#9cd2c5", intensity: 50, range: 15 };
  if (kind !== "sandbox") {
    const vehicle = kind === "driving";
    const player = add(
      entity(
        vehicle ? "Courier buggy" : "Explorer",
        vehicle ? "box" : "capsule",
        [0, 1.2, 8],
        vehicle ? [1.6, 0.7, 2.8] : [1, 1, 1],
        vehicle ? "#e5b970" : "#c4e1cc",
      ),
    );
    player.tag = "player";
    player.behavior = vehicle ? "vehicle" : "character";
    player.physics = {
      type: "kinematic",
      shape: vehicle ? "box" : "capsule",
      mass: 75,
      friction: 0.5,
      restitution: 0,
      sensor: false,
    };
    if (vehicle)
      for (const x of [-0.55, 0.55])
        for (const z of [-0.32, 0.32]) {
          const wheel = add(
            entity("Wheel", "cylinder", [x, -0.45, z], [0.35, 0.3, 0.3], "#263533"),
          );
          wheel.parent = player.id;
          wheel.transform.rotation = [0, 0, 90];
        }
    const checkpoint = add(
      entity("Checkpoint lantern", "cylinder", [0, 0.25, 1], [2, 0.5, 2], "#76cbb7"),
    );
    checkpoint.behavior = "checkpoint";
    checkpoint.physics = {
      type: "fixed",
      shape: "box",
      mass: 1,
      friction: 0,
      restitution: 0,
      sensor: true,
    };
    for (let i = 0; i < 5; i++) {
      const orb = add(
        entity(
          "Signal shard " + (i + 1),
          "sphere",
          [Math.sin(i * 1.7) * 8, 1.2, -2 - i * 3],
          [0.7, 0.7, 0.7],
          "#f3cf87",
        ),
      );
      orb.behavior = "collectible";
      orb.physics = {
        type: "fixed",
        shape: "sphere",
        mass: 1,
        friction: 0,
        restitution: 0,
        sensor: true,
      };
    }
    const goal = add(entity("Signal beacon", "cylinder", [0, 1, -18], [2, 2, 2], "#72b8a1"));
    goal.behavior = "finish";
    goal.physics = {
      type: "fixed",
      shape: "box",
      mass: 1,
      friction: 0,
      restitution: 0,
      sensor: true,
    };
    if (kind === "first-person") {
      add(solid("Gallery wall left", [-5, 1.5, 4], [1, 3, 9], "#7b9181"));
      add(solid("Gallery wall right", [5, 1.5, 4], [1, 3, 9], "#7b9181"));
    }
    if (vehicle) {
      for (let i = 0; i < 4; i++)
        add(solid("Road barrier " + i, [-12 + i * 8, 0.5, 15], [4, 1, 0.6], "#8d9b88"));
    }
  } else {
    for (let i = 0; i < 14; i++)
      add(
        solid(
          "Physics tower " + i,
          [8 + (i % 2) * 1.1, 0.6 + Math.floor(i / 2) * 1.1, 1],
          [1, 1, 1],
          i % 2 ? "#dfba79" : "#82a498",
          true,
        ),
      );
  }
  return {
    version: 1,
    name:
      kind === "adventure"
        ? "The Last Signal"
        : kind === "first-person"
          ? "Lantern Gallery"
          : kind === "driving"
            ? "Valley Courier"
            : "Gravity Garden",
    template: kind,
    entities,
    assets: [],
    environment: {
      background: "#263d44",
      fog: "#314f50",
      fogNear: 30,
      fogFar: 100,
      sun: 2.2,
      gravity: -9.81,
    },
  };
}
