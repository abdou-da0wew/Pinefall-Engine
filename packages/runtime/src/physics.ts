import type { RootDelta } from "../../animation/src/root-motion";
import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion, Euler, MathUtils, Vector3 } from "three";
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
  private collecting = false;
  deferredMotion = false;
  private proposals = new Map<string, { x: number; y: number; z: number }>();
  private grounded = new Map<string, boolean>();
  private newColliders = new Set<string>();
  private radii = new Map<string, number>();
  beginMotion() {
    this.collecting = true;
  }
  isGrounded(id: string) {
    return this.grounded.get(id) ?? false;
  }
  proposeRoot(id: string, delta: RootDelta, scale: number) {
    const body = this.bodies.get(id);
    if (!body) return;
    if (
      !body.isKinematic() ||
      !Number.isFinite(scale) ||
      scale <= 0 ||
      scale > 100 ||
      !Object.values(delta).every(Number.isFinite) ||
      Math.hypot(delta.x, delta.z) * scale > 50
    )
      throw Error("Root-motion controller displacement budget/type");
    const current = body.rotation(),
      q = new Quaternion(current.x, current.y, current.z, current.w);
    const displacement = new Vector3(delta.x * scale, 0, delta.z * scale).applyQuaternion(q);
    this.proposals.set(id, {
      x: displacement.x,
      y: this.proposals.get(id)?.y ?? 0,
      z: displacement.z,
    });
    body.setNextKinematicRotation(
      q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), delta.yaw)),
    );
  }
  resolveMotion(active: (id: string) => boolean = () => true) {
    const pending = this.proposals;
    this.proposals = new Map();
    for (const [id, delta] of [...pending].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      if (active(id)) this.grounded.set(id, this.resolveMove(id, delta));
  }
  endMotion() {
    this.collecting = false;
    this.proposals.clear();
  }

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
    this.newColliders.add(entity.id);
    this.radii.set(
      entity.id,
      p.shape === "sphere"
        ? Math.max(x, y, z) * 0.5
        : p.shape === "capsule"
          ? y * 0.5 + 0.35 * Math.max(x, z)
          : Math.hypot(x, y, z) * 0.5,
    );
  }
  step(onCollision: (a: string, b: string, started: boolean) => void) {
    this.world.step(this.events);
    this.newColliders.clear();
    this.events.drainCollisionEvents((a, b, started) => {
      const x = this.ids.get(a),
        y = this.ids.get(b);
      if (x && y) onCollision(x, y, started);
    });
  }
  move(id: string, delta: { x: number; y: number; z: number }) {
    if (!Object.values(delta).every(Number.isFinite) || Math.hypot(delta.x, delta.y, delta.z) > 100)
      throw Error("Invalid controller displacement");
    if (this.collecting || this.deferredMotion) {
      this.proposals.set(id, { ...delta });
      return this.isGrounded(id);
    }
    const grounded = this.resolveMove(id, delta);
    this.grounded.set(id, grounded);
    return grounded;
  }
  private resolveMove(id: string, delta: { x: number; y: number; z: number }) {
    const body = this.bodies.get(id),
      collider = this.colliders.get(id);
    if (!body || !collider) return false;
    // Rapier 0.19 refreshes the broad phase only during step(). Newly admitted obstacles
    // therefore need a conservative direct shape sweep before their first physics step.
    // This does not integrate another world step; full sliding/autostep resumes next tick.
    if (this.newColliders.size) {
      this.world.propagateModifiedBodyPositionsToColliders();
      const start = collider.translation(),
        length2 = delta.x * delta.x + delta.y * delta.y + delta.z * delta.z;
      let fraction = 1;
      for (const key of this.newColliders) {
        if (key === id) continue;
        const other = this.colliders.get(key);
        if (!other || other.isSensor() || !other.isEnabled()) continue;
        const a = collider.collisionGroups(),
          b = other.collisionGroups();
        if (!((a >>> 16) & (b & 65535)) || !((b >>> 16) & (a & 65535))) continue;
        const p = other.translation(),
          x = p.x - start.x,
          y = p.y - start.y,
          z = p.z - start.z,
          t = length2
            ? Math.max(0, Math.min(1, (x * delta.x + y * delta.y + z * delta.z) / length2))
            : 0;
        const r = (this.radii.get(id) ?? 0) + (this.radii.get(key) ?? 0) + 0.025;
        if ((x - t * delta.x) ** 2 + (y - t * delta.y) ** 2 + (z - t * delta.z) ** 2 > r * r)
          continue;
        const hit = collider.castCollider(delta, other, { x: 0, y: 0, z: 0 }, 0.025, 1, true);
        if (hit) fraction = Math.min(fraction, Math.max(0, hit.time_of_impact));
      }
      if (fraction < 1)
        delta = { x: delta.x * fraction, y: delta.y * fraction, z: delta.z * fraction };
    }
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
    this.newColliders.delete(id);
    this.radii.delete(id);
    this.proposals.delete(id);
    this.grounded.delete(id);
    this.bodies.delete(id);
    this.colliders.delete(id);
  }
  dispose() {
    this.endMotion();
    this.grounded.clear();
    this.newColliders.clear();
    this.radii.clear();
    this.events.free();
    this.world.free();
    this.bodies.clear();
    this.colliders.clear();
    this.ids.clear();
  }
}
