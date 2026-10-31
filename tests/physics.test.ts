import { test, expect } from "bun:test";
import { PhysicsSystem, initPhysics } from "../packages/runtime/src/physics";
import { entity } from "../packages/runtime/src/schema";
test("dynamic bodies fall and rest on real collider", async () => {
  await initPhysics();
  const p = new PhysicsSystem();
  const ground = entity("ground", "box", [0, -0.5, 0], [20, 1, 20]);
  ground.physics = {
    type: "fixed",
    shape: "box",
    mass: 1,
    friction: 0.7,
    restitution: 0,
    sensor: false,
  };
  const box = entity("box", "box", [0, 4, 0]);
  box.physics = { ...ground.physics, type: "dynamic" };
  p.add(ground);
  p.add(box);
  for (let i = 0; i < 240; i++) p.step(() => {});
  expect(p.bodies.get(box.id)!.translation().y).toBeCloseTo(0.5, 1);
  p.dispose();
});
test("kinematic characters activate fixed sensors", async () => {
  await initPhysics();
  const p = new PhysicsSystem();
  const sensor = entity("trigger", "box", [0, 1, 0], [4, 4, 4]);
  sensor.physics = {
    type: "fixed",
    shape: "box",
    mass: 1,
    friction: 0,
    restitution: 0,
    sensor: true,
  };
  const actor = entity("actor", "capsule", [0, 1, 0]);
  actor.physics = { ...sensor.physics, type: "kinematic", shape: "capsule", sensor: false };
  p.add(sensor);
  p.add(actor);
  let hit = false;
  for (let i = 0; i < 3; i++)
    p.step((_a, _b, start) => {
      if (start) hit = true;
    });
  expect(hit).toBe(true);
  p.dispose();
});
