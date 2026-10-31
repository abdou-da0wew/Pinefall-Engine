import { test, expect } from "bun:test";
import { HeadlessEngine } from "../packages/headless/src";
import { PhysicsSystem } from "../packages/runtime/src/physics";
import { entity } from "../packages/runtime/src/schema";
import { animatedScene } from "./animator-fixtures";
import { createGame } from "../packages/project/src";

test("structural commands admit once at the next boundary; pending destroy suppresses fixed callbacks", async () => {
  const scene = createGame("Boundaries");
  scene.entities[0].id = "a";
  scene.entities[0].behavior = "parent";
  delete scene.entities[1].behavior;
  const engine = await HeadlessEngine.create(scene),
    trace: string[] = [];
  engine.registerBehavior("parent", () => ({
    fixedUpdate() {
      trace.push("a:" + engine.fixed.ticks);
      if (engine.fixed.ticks === 0) {
        const child = entity("child", "box", [0, 2, 0]);
        child.id = "c";
        child.behavior = "child";
        engine.spawn(child);
        expect(engine.objects.has("c")).toBe(false);
      }
      if (engine.fixed.ticks === 1) {
        engine.destroy("c");
        expect(engine.objects.has("c")).toBe(true);
      }
    },
  }));
  engine.registerBehavior("child", () => ({
    start() {
      trace.push("c:start");
    },
    fixedUpdate() {
      trace.push("c:fixed");
    },
    dispose() {
      trace.push("c:dispose");
    },
  }));
  try {
    engine.step();
    expect(trace).toEqual(["a:0"]);
    engine.step();
    expect(trace).toEqual(["a:0", "c:start", "a:1"]);
    expect(engine.fixed.pendingDestroy.has("c")).toBe(true);
    engine.step();
    expect(trace).toEqual(["a:0", "c:start", "a:1", "c:dispose", "a:2"]);
    expect(engine.objects.has("c")).toBe(false);
    expect(engine.fixed.trace).toEqual([
      "admit",
      "fixed",
      "animation",
      "physics",
      "sync",
      "physics-events",
      "animation-events",
    ]);
  } finally {
    engine.dispose();
  }
});
test("terminal marker destruction suppresses same-dispatch listeners and later markers before disposal", async () => {
  const { scene, id } = await animatedScene(),
    actor = scene.entities.find((e) => e.id === id)!;
  actor.animator!.initial = "attack";
  actor.animator!.clips.attack.markers = [
    { id: "destroy", time: 0.1, kind: "gameplay" },
    { id: "later", time: 0.1, kind: "gameplay" },
  ];
  scene.scripts = [
    {
      id: "first",
      name: "First",
      source:
        'export default ctx=>({start(){ctx.animation.onEvent(e=>{ctx.log("first:"+e.message);ctx.destroy();});}})',
    },
    {
      id: "second",
      name: "Second",
      source:
        'export default ctx=>({start(){ctx.animation.onEvent(e=>ctx.log("second:"+e.message));}})',
    },
  ];
  actor.scripts = scene.scripts.map((s) => ({ id: s.id, script: s.id, enabled: true, props: {} }));
  const engine = await HeadlessEngine.create(scene);
  engine.allowSceneScripts = true;
  try {
    engine.step(6);
    expect(engine.animators.has(id)).toBe(true);
    expect(engine.fixed.pendingDestroy.has(id)).toBe(true);
    expect(engine.events.entries.filter((e) => e.type === "script").map((e) => e.message)).toEqual([
      "first:destroy",
    ]);
    expect(
      engine.events.entries.filter((e) => e.type === "animation").map((e) => e.message),
    ).toEqual(["destroy"]);
    engine.step();
    expect(engine.animators.has(id)).toBe(false);
  } finally {
    engine.dispose();
  }
});
test("single physics step synchronizes transforms before contact callbacks and markers", async () => {
  const { scene, id } = await animatedScene(),
    actor = scene.entities.find((e) => e.id === id)!;
  actor.transform.position = [0, 0.25, 0];
  actor.physics = {
    type: "dynamic",
    shape: "box",
    mass: 1,
    friction: 0.5,
    restitution: 0,
    sensor: false,
  };
  actor.behavior = "watch";
  scene.entities[0].physics!.sensor = true;
  actor.animator!.initial = "attack";
  actor.animator!.clips.attack.markers = [{ id: "entry", time: 0, entry: true, kind: "gameplay" }];
  const engine = await HeadlessEngine.create(scene),
    order: string[] = [];
  let steps = 0;
  const original = engine.physics.step.bind(engine.physics);
  engine.physics.step = (callback) => {
    steps++;
    original(callback);
  };
  engine.registerBehavior("watch", () => ({
    trigger() {
      expect(engine.objects.get(id)!.position.y).toBe(
        engine.physics.bodies.get(id)!.translation().y,
      );
      order.push("physics");
    },
  }));
  engine.events.subscribe((event) => {
    if (event.type === "animation") order.push("animation");
  });
  try {
    engine.step();
    expect(steps).toBe(1);
    expect(order).toContain("physics");
    expect(order.at(-1)).toBe("animation");
    expect(engine.objects.get(id)!.position.y).toBeLessThan(0.25);
  } finally {
    engine.dispose();
  }
});
test("failed headless construction disposes the partially allocated physics world", async () => {
  const add = PhysicsSystem.prototype.add,
    dispose = PhysicsSystem.prototype.dispose;
  let calls = 0,
    disposed = 0;
  PhysicsSystem.prototype.add = function (e) {
    if (++calls === 2) throw Error("injected admission failure");
    return add.call(this, e);
  };
  PhysicsSystem.prototype.dispose = function () {
    disposed++;
    dispose.call(this);
  };
  try {
    await expect(HeadlessEngine.create(createGame("fail"))).rejects.toThrow("injected");
    expect(disposed).toBe(1);
  } finally {
    PhysicsSystem.prototype.add = add;
    PhysicsSystem.prototype.dispose = dispose;
  }
});
