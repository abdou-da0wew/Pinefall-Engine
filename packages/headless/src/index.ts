import { UIStore } from "../../ui/src/store";
import { Group, MathUtils } from "three";
import { initPhysics, PhysicsSystem } from "../../runtime/src/physics";
import { parseScene, cloneScene } from "../../runtime/src/schema";
import type { SceneDocument, Vec3, Entity } from "../../runtime/src/schema";
import { Events } from "../../runtime/src/events";
import { registerBuiltins } from "../../runtime/src/behaviors";
import type { Behavior, BehaviorFactory, SimulationHost } from "../../runtime/src/behaviors";
import { createBehaviorSession } from "../../scripting/src/runtime";
/** DOM-free simulation: same physics, scene schema and behaviors as the graphical engine. */
export class HeadlessEngine implements SimulationHost {
  allowSceneScripts = false;
  paused = false;
  readonly ui = new UIStore((error) =>
    this.events.emit("error", "UI callback failed", { error: String(error) }),
  );
  private behaviorBuilder?: (entity: Entity) => Behavior;
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
    this.ui.load(scene.ui);
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
    const createBehavior = createBehaviorSession(this, this.registry, this.allowSceneScripts);
    this.behaviorBuilder = createBehavior;
    this.playing = true;
    this.ui.interactive = true;
    for (const e of [...this.document.entities]) {
      if (!e.enabled) continue;
      const instance = createBehavior(e);
      this.behaviors.set(e.id, instance);
      instance.start?.();
    }
  }

  spawn(input: Entity) {
    this.assertAlive();
    if (!this.playing) throw Error("Runtime spawning requires Play");
    if (input.parent) throw Error("Spawn a root entity");
    const next = parseScene({ ...this.document, entities: [...this.document.entities, input] });
    const e = next.entities.at(-1)!;
    this.document.entities.push(e);
    this.physics.add(e);
    const node = new Group();
    node.position.fromArray(e.transform.position);
    node.rotation.set(...(e.transform.rotation.map(MathUtils.degToRad) as Vec3));
    node.scale.fromArray(e.transform.scale);
    node.visible = e.enabled;
    this.objects.set(e.id, node);
    if (e.enabled && this.behaviorBuilder) {
      const b = this.behaviorBuilder(e);
      this.behaviors.set(e.id, b);
      b.start?.();
    }
    return e;
  }
  destroy(id: string) {
    this.assertAlive();
    const ids = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of this.document.entities)
        if (e.parent && ids.has(e.parent) && !ids.has(e.id)) {
          ids.add(e.id);
          changed = true;
        }
    }
    for (const key of ids) {
      const b = this.behaviors.get(key);
      this.behaviors.delete(key);
      b?.dispose?.();
      this.physics.remove(key);
      this.objects.get(key)?.removeFromParent();
      this.objects.delete(key);
    }
    this.document.entities = this.document.entities.filter((e) => !ids.has(e.id));
  }
  step(ticks = 1) {
    this.assertAlive();
    if (!Number.isInteger(ticks) || ticks < 0 || ticks > 36000)
      throw Error("Ticks must be an integer between 0 and 36000");
    this.play();

    for (let i = 0; i < ticks; i++) {
      if (this.paused) break;
      for (const b of this.behaviors.values()) b.fixedUpdate?.(1 / 60);
      this.physics.step((a, b, started) => {
        const ea = this.document.entities.find((e) => e.id === a),
          eb = this.document.entities.find((e) => e.id === b);
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
        if (this.document.entities.find((e) => e.id === id)?.tag === "player" && p.y < -20) {
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
      ui: this.ui.snapshot(),
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
    this.ui.dispose();
  }
}
