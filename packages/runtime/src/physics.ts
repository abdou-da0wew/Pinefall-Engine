import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion, Euler, MathUtils } from "three";
import type { Entity } from "./schema";
let ready: Promise<void> | undefined;
export function initPhysics() {
  return (ready ??= RAPIER.init());
}
export { RAPIER };
export class PhysicsSystem {
  world: RAPIER.World;
  events = new RAPIER.EventQueue(true);
  bodies = new Map<string, RAPIER.RigidBody>();
  colliders = new Map<string, RAPIER.Collider>();
  ids = new Map<number, string>();
  controller: RAPIER.KinematicCharacterController;
  constructor(gravity = -9.81) {
    this.world = new RAPIER.World({ x: 0, y: gravity, z: 0 });
    this.world.timestep = 1 / 60;
    this.controller = this.world.createCharacterController(0.025);
    this.controller.enableAutostep(0.3, 0.2, true);
    this.controller.enableSnapToGround(0.25);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(75);
  }
  add(entity: Entity) {
    const p = entity.physics;
    if (!p || !entity.enabled) return;
    const t = entity.transform,
      q = new Quaternion().setFromEuler(
        new Euler(...(t.rotation.map(MathUtils.degToRad) as [number, number, number])),
      );
    const d =
      p.type === "dynamic"
        ? RAPIER.RigidBodyDesc.dynamic()
        : p.type === "kinematic"
          ? RAPIER.RigidBodyDesc.kinematicPositionBased()
          : RAPIER.RigidBodyDesc.fixed();
    d.setTranslation(...t.position)
      .setRotation(q)
      .setLinearDamping(0.2);
    if (p.type === "dynamic") d.setCcdEnabled(true);
    const body = this.world.createRigidBody(d);
    const [x, y, z] = t.scale;
    const shape =
      p.shape === "sphere"
        ? RAPIER.ColliderDesc.ball(Math.max(x, y, z) * 0.5)
        : p.shape === "capsule"
          ? RAPIER.ColliderDesc.capsule(y * 0.5, 0.35 * Math.max(x, z))
          : RAPIER.ColliderDesc.cuboid(x * 0.5, y * 0.5, z * 0.5);
    shape
      .setMass(p.mass)
      .setFriction(p.friction)
      .setRestitution(p.restitution)
      .setSensor(p.sensor)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    if (p.sensor) shape.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
    const collider = this.world.createCollider(shape, body);
    this.bodies.set(entity.id, body);
    this.colliders.set(entity.id, collider);
    this.ids.set(collider.handle, entity.id);
  }
  step(onCollision: (a: string, b: string, started: boolean) => void) {
    this.world.step(this.events);
    this.events.drainCollisionEvents((a, b, started) => {
      const x = this.ids.get(a),
        y = this.ids.get(b);
      if (x && y) onCollision(x, y, started);
    });
  }
  move(id: string, delta: { x: number; y: number; z: number }) {
    const body = this.bodies.get(id),
      collider = this.colliders.get(id);
    if (!body || !collider) return false;
    this.controller.computeColliderMovement(
      collider,
      delta,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    );
    const movement = this.controller.computedMovement(),
      p = body.translation();
    body.setNextKinematicTranslation({
      x: p.x + movement.x,
      y: p.y + movement.y,
      z: p.z + movement.z,
    });
    return this.controller.computedGrounded();
  }
  remove(id: string) {
    const body = this.bodies.get(id),
      collider = this.colliders.get(id);
    if (collider) this.ids.delete(collider.handle);
    if (body) this.world.removeRigidBody(body);
    this.bodies.delete(id);
    this.colliders.delete(id);
  }
  dispose() {
    this.events.free();
    this.world.free();
    this.bodies.clear();
    this.colliders.clear();
    this.ids.clear();
  }
}
