import { FixedSimulation } from "../../runtime/src/fixed";
import { AnimationGraphPlayer } from "../../animation/src/graph-player";
import { HeadlessModels } from "../../animation/src/headless-models";
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
  readonly fixed = new FixedSimulation();
  readonly animators = new Map<string, AnimationGraphPlayer>();
  private models = new HeadlessModels();
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
    const engine = new HeadlessEngine(parseScene(scene));
    try {
      for (const asset of engine.document.assets)
        if (asset.import?.report.clips.length) await engine.models.prepare(asset.id, asset.data);
      for (const e of engine.document.entities) engine.attachAnimator(e);
      return engine;
    } catch (error) {
      engine.dispose();
      throw error;
    }
  }
  private constructor(scene: SceneDocument) {
    this.document = cloneScene(scene);
    this.ui.load(scene.ui);
    this.physics = new PhysicsSystem(scene.environment.gravity);
    try {
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
      this.goalCount = scene.entities.filter(
        (e) => e.enabled && e.behavior === "collectible",
      ).length;
      const player = scene.entities.find((e) => e.tag === "player");
      if (player) this.checkpoint = [...player.transform.position];
    } catch (error) {
      this.physics.dispose();
      this.objects.clear();
      this.ui.dispose();
      throw error;
    }
    registerBuiltins(this);
  }
  private attachAnimator(entity: Entity) {
    if (!entity.animator) return;
    const asset = this.document.assets.find((a) => a.id === entity.mesh?.asset)!;
    const root = this.models.acquire(asset.id);
    try {
      this.animators.set(entity.id, new AnimationGraphPlayer(root, entity.animator, asset.import!));
      this.objects.get(entity.id)!.add(root);
    } catch (error) {
      this.models.release(root);
      throw error;
    }
  }
  registerBehavior(name: string, factory: BehaviorFactory) {
    this.registry.set(name, factory);
  }
  play() {
    this.assertAlive();
    if (this.playing) return;
    const createBehavior = createBehaviorSession(this, this.registry, this.allowSceneScripts);
    this.behaviorBuilder = createBehavior;
    this.fixed.clear();
    this.playing = true;
    this.physics.deferredMotion = true;
    this.ui.interactive = true;
    for (const animator of this.animators.values()) {
      animator.graph.reset();
      animator.sample();
    }
    for (const e of [...this.document.entities]) {
      if (!e.enabled || this.fixed.pendingDestroy.has(e.id)) continue;
      const instance = createBehavior(e);
      this.behaviors.set(e.id, instance);
      instance.start?.();
    }
  }

  spawn(input: Entity) {
    this.assertAlive();
    if (!this.playing) throw Error("Runtime spawning requires Play");
    if (input.parent) throw Error("Spawn a root entity");
    const next = parseScene({
      ...this.document,
      entities: [...this.document.entities, ...this.fixed.pendingSpawns.values(), input],
    });
    const entity = next.entities.at(-1)!;
    this.fixed.spawn(entity, (value) => this.admitSpawn(value));
    return entity;
  }
  private admitSpawn(input: Entity) {
    this.assertAlive();
    if (!this.playing) throw Error("Runtime spawning requires Play");
    if (input.parent) throw Error("Spawn a root entity");
    const next = parseScene({ ...this.document, entities: [...this.document.entities, input] });
    const e = next.entities.at(-1)!;
    try {
      this.document.entities.push(e);
      this.physics.add(e);
      const node = new Group();
      node.position.fromArray(e.transform.position);
      node.rotation.set(...(e.transform.rotation.map(MathUtils.degToRad) as Vec3));
      node.scale.fromArray(e.transform.scale);
      node.visible = e.enabled;
      this.objects.set(e.id, node);
      this.attachAnimator(e);
      if (e.enabled && this.behaviorBuilder) {
        const b = this.behaviorBuilder(e);
        this.behaviors.set(e.id, b);
        b.start?.();
      }
    } catch (error) {
      const animator = this.animators.get(e.id);
      if (animator) {
        animator.dispose();
        this.models.release(animator.root);
        this.animators.delete(e.id);
      }
      this.behaviors.get(e.id)?.dispose?.();
      this.behaviors.delete(e.id);
      this.physics.remove(e.id);
      this.objects.get(e.id)?.removeFromParent();
      this.objects.delete(e.id);
      this.document.entities = this.document.entities.filter((entity) => entity.id !== e.id);
      throw error;
    }
    return e;
  }
  destroy(id: string) {
    this.assertAlive();
    if (!this.playing) {
      this.destroyNow(id);
      return;
    }
    const entities = [...this.document.entities, ...this.fixed.pendingSpawns.values()];
    if (!entities.some((e) => e.id === id)) return;
    const ids = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of entities)
        if (e.parent && ids.has(e.parent) && !ids.has(e.id)) {
          ids.add(e.id);
          changed = true;
        }
    }
    this.fixed.destroy([...ids], () => this.destroyNow(id));
  }
  private destroyNow(id: string) {
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
      const animator = this.animators.get(key);
      if (animator) {
        animator.dispose();
        this.models.release(animator.root);
        this.animators.delete(key);
      }
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
      this.fixed.run(this);
      for (const entity of this.document.entities) {
        if (entity.tag !== "player") continue;
        const body = this.physics.bodies.get(entity.id);
        if (body && body.translation().y < -20) {
          body.setTranslation(
            { x: this.checkpoint[0], y: this.checkpoint[1], z: this.checkpoint[2] },
            true,
          );
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
      }
      if (!this.paused)
        for (const [id, b] of this.behaviors)
          if (!this.fixed.pendingDestroy.has(id)) b.update?.(1 / 60);
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
    this.fixed.clear();
    for (const animator of this.animators.values()) animator.dispose();
    this.animators.clear();
    this.models.dispose();
    this.objects.clear();
    this.physics.dispose();
    this.ui.dispose();
  }
}
