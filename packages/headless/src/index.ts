import { Group, MathUtils } from "three";
import { initPhysics, PhysicsSystem } from "../../runtime/src/physics";
import { parseScene, cloneScene } from "../../runtime/src/schema";
import type { SceneDocument, Vec3 } from "../../runtime/src/schema";
import { Events } from "../../runtime/src/events";
import { registerBuiltins } from "../../runtime/src/behaviors";
import type { Behavior, BehaviorFactory, SimulationHost } from "../../runtime/src/behaviors";
import { safeBehavior } from "../../runtime/src/behavior-safety";
/** DOM-free simulation: same physics, scene schema and behaviors as the graphical engine. */
export class HeadlessEngine implements SimulationHost {
  readonly input = new Set<string>();
  readonly objects = new Map<string, Group>();
  readonly events = new Events();
  readonly registry = new Map<string, BehaviorFactory>();
  readonly behaviors = new Map<string, Behavior>();
  physics: PhysicsSystem;
  document: SceneDocument;
  look = { yaw: 0, pitch: 0 };
  jump = false;
  speed = 0;
  collected = new Set<string>();
  goalCount = 0;
  won = false;
  checkpoint: Vec3 = [0, 1, 0];
  ticks = 0;
  private playing = false;
  private dead = false;
  static async create(scene: SceneDocument) {
    await initPhysics();
    return new HeadlessEngine(parseScene(scene));
  }
  private constructor(scene: SceneDocument) {
    this.document = cloneScene(scene);
    this.physics = new PhysicsSystem(scene.environment.gravity);
    for (const e of scene.entities) {
      this.physics.add(e);
      const node = new Group();
      node.position.fromArray(e.transform.position);
      node.rotation.set(...(e.transform.rotation.map(MathUtils.degToRad) as Vec3));
      node.scale.fromArray(e.transform.scale);
      node.visible = e.enabled;
      this.objects.set(e.id, node);
    }
    for (const e of scene.entities)
      if (e.parent) this.objects.get(e.parent)?.add(this.objects.get(e.id)!);
    this.goalCount = scene.entities.filter((e) => e.enabled && e.behavior === "collectible").length;
    const player = scene.entities.find((e) => e.tag === "player");
    if (player) this.checkpoint = [...player.transform.position];
    registerBuiltins(this);
  }
  registerBehavior(name: string, factory: BehaviorFactory) {
    this.registry.set(name, factory);
  }
  play() {
    this.assertAlive();
    if (this.playing) return;
    this.playing = true;
    for (const e of this.document.entities) {
      if (!e.enabled || !e.behavior) continue;
      const factory = this.registry.get(e.behavior);
      if (!factory) {
        this.events.emit("warning", "Unregistered behavior", {
          entity: e.id,
          behavior: e.behavior,
        });
        continue;
      }
      const instance = safeBehavior(factory, { engine: this, entity: e }, (hook, error) =>
        this.events.emit("error", "Behavior disabled after exception", {
          entity: e.id,
          hook,
          error: String(error),
        }),
      );
      this.behaviors.set(e.id, instance);
      instance.start?.();
    }
  }
  step(ticks = 1) {
    this.assertAlive();
    if (!Number.isInteger(ticks) || ticks < 0 || ticks > 36000)
      throw Error("Ticks must be an integer between 0 and 36000");
    this.play();
    const entities = new Map(this.document.entities.map((e) => [e.id, e]));
    for (let i = 0; i < ticks; i++) {
      for (const b of this.behaviors.values()) b.fixedUpdate?.(1 / 60);
      this.physics.step((a, b, started) => {
        const ea = entities.get(a),
          eb = entities.get(b);
        if (ea && eb) {
          this.behaviors.get(a)?.trigger?.(eb, started);
          this.behaviors.get(b)?.trigger?.(ea, started);
        }
      });
      for (const [id, body] of this.physics.bodies) {
        const node = this.objects.get(id)!;
        const p = body.translation(),
          q = body.rotation();
        node.position.set(p.x, p.y, p.z);
        node.quaternion.set(q.x, q.y, q.z, q.w);
        if (entities.get(id)?.tag === "player" && p.y < -20) {
          body.setTranslation(
            { x: this.checkpoint[0], y: this.checkpoint[1], z: this.checkpoint[2] },
            true,
          );
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
      }
      for (const b of this.behaviors.values()) b.update?.(1 / 60);
      this.ticks++;
    }
  }
  snapshot() {
    this.assertAlive();
    const scene = cloneScene(this.document);
    for (const e of scene.entities) {
      const node = this.objects.get(e.id)!;
      e.transform.position = node.position.toArray() as Vec3;
      e.transform.rotation = [node.rotation.x, node.rotation.y, node.rotation.z].map(
        MathUtils.radToDeg,
      ) as Vec3;
      if (this.collected.has(e.id)) e.enabled = false;
    }
    return scene;
  }
  report() {
    return {
      ticks: this.ticks,
      seconds: this.ticks / 60,
      bodies: this.physics.bodies.size,
      collected: [...this.collected],
      goalCount: this.goalCount,
      won: this.won,
      events: this.events.entries,
      snapshot: this.snapshot(),
    };
  }
  private assertAlive() {
    if (this.dead) throw Error("Simulation disposed");
  }
  dispose() {
    if (this.dead) return;
    this.dead = true;
    for (const b of this.behaviors.values()) b.dispose?.();
    this.behaviors.clear();
    this.objects.clear();
    this.physics.dispose();
  }
}
