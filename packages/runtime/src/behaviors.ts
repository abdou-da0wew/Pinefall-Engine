import { Quaternion, Euler } from "three";
import type { Engine } from "./engine";
import type { Entity } from "./schema";
export interface Behavior {
  start?(): void;
  fixedUpdate?(dt: number): void;
  update?(dt: number): void;
  trigger?(other: Entity, started: boolean): void;
  dispose?(): void;
}
export type SimulationHost = Pick<
  Engine,
  | "ui"
  | "paused"
  | "input"
  | "look"
  | "jump"
  | "document"
  | "physics"
  | "objects"
  | "speed"
  | "collected"
  | "goalCount"
  | "won"
  | "checkpoint"
  | "events"
  | "registerBehavior"
  | "spawn"
  | "destroy"
>;
export interface BehaviorContext {
  engine: SimulationHost;
  entity: Entity;
}
export type BehaviorFactory = (context: BehaviorContext) => Behavior;
export function registerBuiltins(engine: SimulationHost) {
  engine.registerBehavior("character", ({ engine, entity }) => {
    let vertical = 0,
      grounded = false;
    return {
      fixedUpdate(dt) {
        const speed = engine.input.has("Shift") ? 7 : 4;
        let x = (engine.input.has("KeyD") ? 1 : 0) - (engine.input.has("KeyA") ? 1 : 0),
          z = (engine.input.has("KeyS") ? 1 : 0) - (engine.input.has("KeyW") ? 1 : 0);
        const length = Math.hypot(x, z) || 1;
        x /= length;
        z /= length;
        const a = engine.look.yaw,
          dx = x * Math.cos(a) + z * Math.sin(a),
          dz = -x * Math.sin(a) + z * Math.cos(a);
        if (engine.jump && grounded) vertical = 5.8;
        engine.jump = false;
        vertical = Math.max(-20, vertical + engine.document.environment.gravity * dt);
        grounded = engine.physics.move(entity.id, {
          x: dx * speed * dt,
          y: vertical * dt,
          z: dz * speed * dt,
        });
        if (grounded && vertical < 0) vertical = 0;
        const body = engine.physics.bodies.get(entity.id);
        if (body && Math.hypot(dx, dz) > 0.1) {
          const yaw = Math.atan2(-dx, -dz);
          body.setNextKinematicRotation(new Quaternion().setFromEuler(new Euler(0, yaw, 0)));
        }
      },
    };
  });
  engine.registerBehavior("vehicle", ({ engine, entity }) => {
    let speed = 0,
      yaw = 0,
      fall = 0;
    return {
      fixedUpdate(dt) {
        const throttle = (engine.input.has("KeyW") ? 1 : 0) - (engine.input.has("KeyS") ? 1 : 0),
          steer = (engine.input.has("KeyA") ? 1 : 0) - (engine.input.has("KeyD") ? 1 : 0);
        speed += throttle * 12 * dt;
        speed *= Math.exp(-(engine.input.has("Space") ? 7 : throttle ? 0.25 : 1.4) * dt);
        speed = Math.max(-7, Math.min(18, speed));
        yaw += steer * speed * 0.07 * dt;
        fall = Math.max(-20, fall + engine.document.environment.gravity * dt);
        const grounded = engine.physics.move(entity.id, {
          x: -Math.sin(yaw) * speed * dt,
          y: fall * dt,
          z: -Math.cos(yaw) * speed * dt,
        });
        if (grounded) fall = 0;
        engine.physics.bodies
          .get(entity.id)
          ?.setNextKinematicRotation(new Quaternion().setFromEuler(new Euler(0, yaw, 0)));
        engine.speed = Math.abs(speed) * 3.6;
      },
    };
  });
  engine.registerBehavior("spin", ({ engine, entity }) => ({
    update(dt) {
      const object = engine.objects.get(entity.id);
      if (object) object.rotation.y += dt;
    },
  }));
  engine.registerBehavior("collectible", ({ engine, entity }) => {
    let collected = false;
    return {
      update(dt) {
        const object = engine.objects.get(entity.id);
        if (object && !collected) object.rotation.y += dt;
      },
      trigger(other, started) {
        if (!started || other.tag !== "player" || collected) return;
        collected = true;
        engine.collected.add(entity.id);
        const object = engine.objects.get(entity.id);
        if (object) object.visible = false;
        engine.physics.colliders.get(entity.id)?.setEnabled(false);
        engine.events.emit("gameplay", "Signal recovered", {
          collected: engine.collected.size,
          total: engine.goalCount,
        });
      },
    };
  });
  engine.registerBehavior("checkpoint", ({ engine, entity }) => ({
    trigger(other, started) {
      if (started && other.tag === "player") {
        engine.checkpoint = [...entity.transform.position];
        engine.checkpoint[1] += 1.4;
        engine.events.emit("gameplay", "Checkpoint reached");
      }
    },
  }));
  engine.registerBehavior("finish", ({ engine }) => ({
    trigger(other, started) {
      if (started && other.tag === "player") {
        if (engine.collected.size >= engine.goalCount) {
          engine.won = true;
          engine.events.emit("gameplay", "All signals restored. Route complete.");
        } else
          engine.events.emit(
            "gameplay",
            `Recover all ${engine.goalCount} signals before activating the beacon.`,
          );
      }
    },
  }));
}
