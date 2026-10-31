import { referenceScene } from "../../assets/src/documents";
import { UIStore } from "../../ui/src/store";
import { UIRenderer } from "../../ui/src/renderer";
import { ModelCache, type ModelLease } from "../../assets/src/cache";
import { createBehaviorSession } from "../../scripting/src/runtime";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { PhysicsSystem, initPhysics } from "./physics";
import { Effects, beam } from "./effects";
import { Events } from "./events";
import { LOW, cloneScene, entity, parseScene } from "./schema";
import type { SceneDocument, Entity, RenderSettings, Primitive, Vec3 } from "./schema";
import { registerBuiltins } from "./behaviors";
import type { BehaviorFactory, Behavior } from "./behaviors";
export interface Stats {
  fps: number;
  drawCalls: number;
  triangles: number;
  visible: number;
  entities: number;
  bodies: number;
  frameMs: number;
  adapter: string;
  width: number;
  height: number;
}
export interface EngineOptions {
  onUISelect?: (id: string) => void;
  onUITransform?: (
    id: string,
    patch: Pick<import("../../ui/src/schema").UIElement, "x" | "y" | "width" | "height">,
  ) => void;
  onSelect?: (id: string | null) => void;
  onTransform?: (id: string, transform: Entity["transform"]) => void;
  onStats?: (stats: Stats) => void;
}
export type CameraRig = "auto" | "orbit" | "first-person" | "follow" | "vehicle";
export class Engine {
  readonly ui = new UIStore((error) =>
    this.events.emit("error", "UI callback failed", { error: String(error) }),
  );
  private uiRenderer: UIRenderer;
  allowSceneScripts = false;
  private behaviorBuilder?: (entity: Entity) => Behavior;
  private requestedRig: CameraRig = "auto";
  get cameraRig(): Exclude<CameraRig, "auto"> {
    if (this.requestedRig !== "auto") return this.requestedRig;
    const mode = this.document?.template;
    return mode === "sandbox"
      ? "orbit"
      : mode === "driving"
        ? "vehicle"
        : mode === "first-person"
          ? "first-person"
          : "follow";
  }
  setCameraRig(rig: CameraRig) {
    this.requestedRig = rig;
    this.orbit.enabled = !this.playing || this.cameraRig === "orbit";
    this.events.emit("camera", "Camera rig changed", { rig });
  }

  readonly events = new Events();
  readonly input = new Set<string>();
  readonly objects = new Map<string, T.Group>();
  readonly behaviors = new Map<string, Behavior>();
  readonly registry = new Map<string, BehaviorFactory>();
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(55, 1, 0.1, 300);
  readonly renderer: T.WebGLRenderer;
  readonly orbit: OrbitControls;
  readonly gizmo: TransformControls;
  physics: PhysicsSystem;
  document!: SceneDocument;
  settings: RenderSettings = { ...LOW };
  loading = false;
  playing = false;
  paused = false;
  jump = false;
  look = { yaw: 0, pitch: 0 };
  checkpoint: Vec3 = [0, 2, 8];
  collected = new Set<string>();
  goalCount = 0;
  won = false;
  speed = 0;
  private root = new T.Group();
  private ambient = new T.HemisphereLight("#c4ddd7", "#405344", 2);
  private sun = new T.DirectionalLight("#ffe1b0", 2);
  private geometries = new Map<Primitive, T.BufferGeometry>();
  private materials = new Map<string, T.MeshStandardMaterial>();
  private imported = new Map<string, ModelLease>();
  readonly assetCache = new ModelCache();
  private loadAbort?: AbortController;
  private beams: T.Mesh<T.BufferGeometry, T.ShaderMaterial>[] = [];
  private playSnapshot: SceneDocument | null = null;
  private generation = 0;
  private selected: string | null = null;
  private effects: Effects | null = null;
  private observer: ResizeObserver;
  private raf = 0;
  private last = 0;
  private nextFrame = 0;
  private accumulator = 0;
  private dead = false;
  private steps = 0;
  private frames = 0;
  private elapsed = 0;
  private dragging = false;
  private down = { x: 0, y: 0 };
  private cleanup: Array<() => void> = [];
  private bufferSize = new T.Vector2();
  private follow = new T.Vector3();
  private adapter = "Adapter not exposed";
  private hudClock = 0;
  static async create(canvas: HTMLCanvasElement, options: EngineOptions = {}) {
    await initPhysics();
    return new Engine(canvas, options);
  }
  private constructor(
    readonly canvas: HTMLCanvasElement,
    private options: EngineOptions,
  ) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "default",
      failIfMajorPerformanceCaveat: false,
    });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    const gl = this.renderer.getContext(),
      ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext) this.adapter = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    this.physics = new PhysicsSystem();
    this.camera.position.set(22, 17, 25);
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.target.set(0, 1, -4);
    this.orbit.enableDamping = true;
    this.orbit.maxDistance = 110;
    this.orbit.minDistance = 2;
    this.gizmo = new TransformControls(this.camera, canvas);
    this.gizmo.addEventListener("dragging-changed", (event) => {
      this.orbit.enabled = !event.value;
    });
    this.gizmo.addEventListener("mouseUp", () => {
      if (!this.selected || this.playing) return;
      const o = this.objects.get(this.selected);
      if (o)
        this.options.onTransform?.(this.selected, {
          position: o.position.toArray() as Vec3,
          rotation: [
            T.MathUtils.radToDeg(o.rotation.x),
            T.MathUtils.radToDeg(o.rotation.y),
            T.MathUtils.radToDeg(o.rotation.z),
          ],
          scale: o.scale.toArray() as Vec3,
        });
    });
    this.sun.position.set(-12, 24, 10);
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, far: 100 });
    this.sun.shadow.bias = -0.001;
    this.scene.add(this.root, this.ambient, this.sun, this.sun.target, this.gizmo.getHelper());
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    registerBuiltins(this);
    this.uiRenderer = new UIRenderer(
      this.ui,
      canvas,
      options.onUISelect,
      () => this.input.clear(),
      options.onUITransform,
    );
    this.bindInput();
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }
  selectUI(id: string) {
    this.uiRenderer.setSelection(id);
  }
  registerBehavior(name: string, factory: BehaviorFactory) {
    this.registry.set(name, factory);
  }
  private listen(target: EventTarget, type: string, handler: EventListener) {
    target.addEventListener(type, handler);
    this.cleanup.push(() => target.removeEventListener(type, handler));
  }
  private bindInput() {
    this.listen(window, "keydown", (event) => {
      const e = event as KeyboardEvent;
      if (e.defaultPrevented || e.ctrlKey || e.metaKey) return;
      if (
        e.target instanceof Element &&
        e.target.closest("[data-pinefall-ui]") &&
        e.code !== "Escape"
      )
        return;
      if (
        !this.playing ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight"].includes(e.code))
        e.preventDefault();
      if (e.code === "Escape" && !e.repeat) {
        this.paused = !this.paused;
        this.input.clear();
        this.events.emit("gameplay", this.paused ? "Paused" : "Resumed");
      }
      if (e.code === "KeyR") this.respawn();
      if (e.code === "Space" && !e.repeat) this.jump = true;
      this.input.add(e.code);
      if (e.shiftKey) this.input.add("Shift");
    });
    this.listen(window, "keyup", (event) => {
      const e = event as KeyboardEvent;
      this.input.delete(e.code);
      if (!e.shiftKey) this.input.delete("Shift");
    });
    this.listen(window, "blur", () => {
      this.input.clear();
      if (this.playing) {
        this.paused = true;
        this.events.emit("gameplay", "Paused while unfocused");
      }
    });
    this.listen(this.canvas, "contextmenu", (event) => event.preventDefault());
    this.listen(this.canvas, "pointerdown", (event) => {
      const e = event as PointerEvent;
      this.down = { x: e.clientX, y: e.clientY };
      this.dragging = true;
      this.canvas.focus();
    });
    this.listen(window, "pointerup", (event) => {
      const e = event as PointerEvent;
      this.dragging = false;
      if (this.playing) return;
      if (
        Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 4 &&
        !this.gizmo.axis &&
        e.target === this.canvas
      )
        this.options.onSelect?.(this.pick(e.clientX, e.clientY));
    });
    this.listen(window, "pointermove", (event) => {
      if (!this.playing || this.paused || this.cameraRig === "orbit") return;
      const e = event as PointerEvent;
      if (document.pointerLockElement === this.canvas || this.dragging) {
        this.look.yaw -= e.movementX * 0.003;
        this.look.pitch = T.MathUtils.clamp(this.look.pitch - e.movementY * 0.003, -1.2, 1.2);
      }
    });
    this.listen(this.canvas, "dblclick", () => {
      if (this.playing && this.cameraRig === "first-person")
        void this.canvas
          .requestPointerLock()
          ?.catch(() =>
            this.events.emit("input", "Pointer lock unavailable; drag to look instead."),
          );
    });
    this.listen(this.canvas, "webglcontextlost", (event) => {
      event.preventDefault();
      this.paused = true;
      this.events.emit("error", "WebGL context lost. Stop and reload the application.");
    });
  }
  private geometry(primitive: Primitive) {
    let geometry = this.geometries.get(primitive);
    if (!geometry) {
      geometry =
        primitive === "sphere"
          ? new T.SphereGeometry(0.5, 16, 12)
          : primitive === "capsule"
            ? new T.CapsuleGeometry(0.35, 1, 4, 8)
            : primitive === "cylinder"
              ? new T.CylinderGeometry(0.5, 0.5, 1, 12)
              : primitive === "cone"
                ? new T.ConeGeometry(0.5, 1, 5)
                : new T.BoxGeometry(1, 1, 1);
      this.geometries.set(primitive, geometry);
    }
    return geometry;
  }
  private material(color: string) {
    let m = this.materials.get(color);
    if (!m) {
      m = new T.MeshStandardMaterial({ color, roughness: 0.82 });
      this.materials.set(color, m);
    }
    return m;
  }
  async load(input: SceneDocument, options: { preserveView?: boolean } = {}) {
    const savedView = options.preserveView
      ? { position: this.camera.position.clone(), target: this.orbit.target.clone() }
      : null;
    let scene = parseScene(input);
    const generation = ++this.generation;
    this.loading = true;
    this.loadAbort?.abort();
    const controller = new AbortController();
    this.loadAbort = controller;
    const staged = new Map<string, ModelLease>();
    try {
      scene = await referenceScene(scene, controller.signal);
      for (const asset of scene.assets) {
        if (!scene.entities.some((e) => e.mesh?.asset === asset.id)) continue;
        await this.assetCache.prepare(asset.data, controller.signal, (update) => {
          this.events.emit("asset", "Model " + update.stage, {
            operationId: update.id,
            elapsedMs: update.elapsedMs,
          });
        });
        // Pin the prototype across preparation of the remaining assets.
        const lease = this.assetCache.acquire(asset.data, `staging:${generation}:${asset.id}`);
        staged.set(asset.id, lease);
        const textures = new Set<T.Texture>();
        lease.root.traverse((o) => {
          if (o instanceof T.Mesh)
            for (const m of Array.isArray(o.material) ? o.material : [o.material])
              for (const value of Object.values(m))
                if (value instanceof T.Texture) textures.add(value);
        });
        let slice = performance.now();
        for (const texture of textures) {
          controller.signal.throwIfAborted();
          this.renderer.initTexture(texture);
          if (performance.now() - slice > 2) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            slice = performance.now();
          }
        }
        controller.signal.throwIfAborted();
        await this.renderer.compileAsync(lease.root, this.camera, this.scene);
      }
      if (this.dead || generation !== this.generation) return;
    } catch (error) {
      for (const lease of staged.values()) lease.release();
      if (generation === this.generation) this.loading = false;
      if (controller.signal.aborted) return;
      this.events.emit("error", "Asset preparation failed; previous world retained", {
        error: String(error),
      });
      throw error;
    } finally {
      if (this.dead || generation !== this.generation)
        for (const lease of staged.values()) lease.release();
    }
    this.playing = false;
    this.paused = false;
    this.input.clear();
    this.gizmo.detach();
    this.clear();
    this.document = cloneScene(scene);
    this.ui.load(scene.ui);
    this.physics = new PhysicsSystem(scene.environment.gravity);
    this.scene.background = new T.Color(scene.environment.background);
    this.scene.fog = new T.Fog(
      scene.environment.fog,
      scene.environment.fogNear,
      Math.max(scene.environment.fogNear + 1, scene.environment.fogFar),
    );
    this.sun.intensity = scene.environment.sun;
    this.goalCount = scene.entities.filter((e) => e.behavior === "collectible" && e.enabled).length;
    this.collected.clear();
    this.won = false;
    this.speed = 0;
    for (const e of scene.entities) this.addEntity(e);
    for (const e of scene.entities)
      if (e.parent) {
        const parent = this.objects.get(e.parent),
          child = this.objects.get(e.id);
        if (parent && child) parent.add(child);
      }
    for (const e of scene.entities) {
      if (e.mesh?.primitive !== "asset") continue;
      const asset = scene.assets.find((a) => a.id === e.mesh?.asset)!;
      const lease = this.assetCache.acquire(asset.data, `entity:${generation}:${e.id}`);
      this.imported.set(e.id, lease);
      lease.root.traverse((o) => {
        o.userData.entityId = e.id;
        if (o instanceof T.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      this.objects.get(e.id)?.add(lease.root);
    }
    for (const lease of staged.values()) lease.release();
    if (generation !== this.generation) return;
    this.orbit.enabled = true;
    this.orbit.target.set(0, 1, -4);
    this.camera.position.set(22, 17, 25);
    if (savedView) {
      this.camera.position.copy(savedView.position);
      this.orbit.target.copy(savedView.target);
    }
    this.orbit.update();
    this.applySettings(this.settings);
    this.loading = false;
    this.events.emit("scene", "Loaded " + scene.name, { entities: scene.entities.length });
  }
  private addEntity(e: Entity) {
    const object = new T.Group();
    object.name = e.name;
    object.userData.entityId = e.id;
    object.position.fromArray(e.transform.position);
    object.rotation.set(
      ...(e.transform.rotation.map(T.MathUtils.degToRad) as [number, number, number]),
    );
    object.scale.fromArray(e.transform.scale);
    object.visible = e.enabled;
    if (e.mesh && e.mesh.primitive !== "asset") {
      const mesh = new T.Mesh(this.geometry(e.mesh.primitive), this.material(e.mesh.color));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.entityId = e.id;
      object.add(mesh);
    }
    if (e.light) {
      const light =
        e.light.type === "spot"
          ? new T.SpotLight(e.light.color, e.light.intensity, e.light.range, 0.5, 0.6, 2)
          : new T.PointLight(e.light.color, e.light.intensity, e.light.range, 2);
      object.add(light);
      if (light instanceof T.SpotLight) {
        const target = new T.Object3D();
        target.position.set(0, -1, 0);
        object.add(target);
        light.target = target;
        const volume = beam(e.light.color);
        volume.position.y = -e.light.range * 0.35;
        volume.scale.set(e.light.range * 0.4, e.light.range * 0.7, e.light.range * 0.4);
        volume.userData.volume = true;
        this.beams.push(volume);
        object.add(volume);
      }
    }
    this.root.add(object);
    this.objects.set(e.id, object);
    this.physics.add(e);
  }
  select(id: string | null) {
    this.selected = id;
    this.gizmo.detach();
    if (id && !this.playing) {
      const object = this.objects.get(id);
      if (object) this.gizmo.attach(object);
    }
  }
  transformMode(mode: "translate" | "rotate" | "scale") {
    this.gizmo.setMode(mode);
  }
  focus(id: string | string[]) {
    const bounds = new T.Box3();
    for (const key of Array.isArray(id) ? id : [id]) {
      const o = this.objects.get(key);
      if (o) bounds.expandByObject(o);
    }
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new T.Vector3()),
      size = bounds.getSize(new T.Vector3());
    const radius = Math.max(2, size.length() * 0.5),
      distance = radius / Math.sin(T.MathUtils.degToRad(this.camera.fov * 0.5));
    this.orbit.target.copy(center);
    this.camera.position
      .copy(center)
      .add(new T.Vector3(1, 0.7, 1).normalize().multiplyScalar(Math.min(105, distance * 1.1)));
    this.orbit.update();
  }
  pick(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect(),
      ray = new T.Raycaster();
    ray.setFromCamera(
      new T.Vector2(
        ((x - rect.left) / rect.width) * 2 - 1,
        (-(y - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    return (
      (ray
        .intersectObjects([...this.objects.values()], true)
        .find((hit) => hit.object.visible && hit.object.userData.entityId)?.object.userData
        .entityId as string | undefined) || null
    );
  }
  play() {
    if (this.loading) throw Error("Wait for scene asset preparation before Play");
    if (!this.document || this.playing) return;
    const createBehavior = createBehaviorSession(this, this.registry, this.allowSceneScripts);
    this.behaviorBuilder = createBehavior;
    this.playSnapshot = cloneScene(this.document);
    this.playing = true;
    this.ui.interactive = true;
    this.paused = false;
    this.gizmo.detach();
    this.look = { yaw: 0, pitch: 0 };
    this.accumulator = 0;
    this.collected.clear();
    this.won = false;
    this.behaviors.clear();
    for (const e of [...this.document.entities]) {
      if (!e.enabled) continue;
      const instance = createBehavior(e);
      this.behaviors.set(e.id, instance);
      instance.start?.();
    }
    const player = this.document.entities.find((e) => e.tag === "player");
    if (player) this.checkpoint = [...player.transform.position];
    this.orbit.enabled = this.cameraRig === "orbit";
    this.events.emit("gameplay", "Play started — " + this.document.name);
    this.canvas.focus();
  }
  async stop() {
    if (!this.document) return;
    const snapshot = cloneScene(this.playSnapshot || this.document);
    this.playSnapshot = null;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    await this.load(snapshot);
    this.select(this.selected);
    this.events.emit("gameplay", "Stopped; authored scene restored.");
  }
  respawn() {
    const e = this.document.entities.find((e) => e.tag === "player");
    if (!e) return;
    const body = this.physics.bodies.get(e.id);
    body?.setTranslation(
      { x: this.checkpoint[0], y: this.checkpoint[1], z: this.checkpoint[2] },
      true,
    );
    body?.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.events.emit("gameplay", "Returned to checkpoint");
  }
  spawn(input: Entity) {
    if (!this.playing) throw Error("Runtime spawning requires Play");
    if (input.parent)
      throw Error("Spawn a root entity; parent it explicitly through authored scenes");
    const next = parseScene({ ...this.document, entities: [...this.document.entities, input] });
    const e = next.entities.at(-1)!;
    let lease: ModelLease | undefined;
    if (e.mesh?.primitive === "asset") {
      const asset = this.document.assets.find((a) => a.id === e.mesh?.asset)!;
      lease = this.assetCache.acquire(asset.data, `entity:${this.generation}:${e.id}`);
    }
    this.document.entities.push(e);
    this.addEntity(e);
    if (lease) {
      this.imported.set(e.id, lease);
      lease.root.traverse((o) => {
        o.userData.entityId = e.id;
      });
      this.objects.get(e.id)!.add(lease.root);
    }
    if (e.enabled && this.behaviorBuilder) {
      const behavior = this.behaviorBuilder(e);
      this.behaviors.set(e.id, behavior);
      behavior.start?.();
    }
    return e;
  }
  destroy(id: string) {
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
      this.imported.get(key)?.release();
      this.imported.delete(key);
      this.objects.get(key)?.removeFromParent();
      this.objects.delete(key);
    }
    this.document.entities = this.document.entities.filter((e) => !ids.has(e.id));
  }
  spawnBox() {
    if (!this.playing || this.document.entities.length >= 200) return;
    const e = entity(
      "Spawned crate",
      "box",
      [(Math.random() - 0.5) * 4, 7, (Math.random() - 0.5) * 4],
      [1, 1, 1],
      "#d5b77a",
    );
    e.physics = {
      type: "dynamic",
      shape: "box",
      mass: 2,
      friction: 0.7,
      restitution: 0.3,
      sensor: false,
    };
    this.document.entities.push(e);
    this.addEntity(e);
    this.events.emit("physics", "Spawned dynamic crate");
  }
  impulse() {
    for (const e of this.document.entities) {
      if (e.physics?.type === "dynamic")
        this.physics.bodies
          .get(e.id)
          ?.applyImpulse(
            { x: (Math.random() - 0.5) * 5, y: 7, z: (Math.random() - 0.5) * 5 },
            true,
          );
    }
    this.events.emit("physics", "Applied impulses to dynamic bodies");
  }
  applySettings(settings: RenderSettings) {
    this.settings = { ...settings };
    this.renderer.shadowMap.enabled = settings.preset === "high";
    this.sun.castShadow = settings.preset === "high";
    this.sun.shadow.needsUpdate = true;
    for (const b of this.beams) {
      b.visible = settings.volumetrics;
      b.material.uniforms.opacity.value = settings.beamOpacity;
    }
    if (settings.post && !this.effects)
      this.effects = new Effects(this.renderer, this.scene, this.camera);
    if (!settings.post && this.effects) {
      this.effects.dispose();
      this.effects = null;
    }
    this.resize();
    this.events.emit("render", "Applied " + settings.preset + " preset", {
      post: settings.post,
      volumetrics: settings.volumetrics,
    });
  }
  private resize() {
    this.uiRenderer?.resized();
    const rect = this.canvas.getBoundingClientRect(),
      cap = this.settings.preset === "low" ? [960, 540] : [1600, 900],
      ratio = Math.min(
        window.devicePixelRatio || 1,
        cap[0] / Math.max(1, rect.width),
        cap[1] / Math.max(1, rect.height),
      );
    const width = Math.max(1, Math.round(rect.width * ratio)),
      height = Math.max(1, Math.round(rect.height * ratio));
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
    this.camera.updateProjectionMatrix();
    this.effects?.resize(width, height);
    this.bufferSize.set(width, height);
  }
  private tick = (now: number) => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.tick);
    if (document.hidden) {
      this.last = now;
      return;
    }
    if (now < this.nextFrame) return;
    const interval = 1000 / (this.settings.preset === "high" && this.playing ? 60 : 30);
    this.nextFrame = now + interval - ((now - this.nextFrame) % interval);
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 1 / 30);
    this.last = now;
    const start = performance.now();
    this.uiRenderer.draw();
    if (this.playing && !this.paused && this.document) {
      this.accumulator = Math.min(this.accumulator + dt, 0.1);
      while (this.accumulator >= 1 / 60) {
        for (const b of this.behaviors.values()) b.fixedUpdate?.(1 / 60);
        this.physics.step((a, b, started) => {
          const ea = this.document.entities.find((e) => e.id === a),
            eb = this.document.entities.find((e) => e.id === b);
          if (ea && eb) {
            this.behaviors.get(a)?.trigger?.(eb, started);
            this.behaviors.get(b)?.trigger?.(ea, started);
          }
        });
        this.accumulator -= 1 / 60;
        this.steps++;
      }
      for (const [id, body] of this.physics.bodies) {
        const object = this.objects.get(id);
        if (!object) continue;
        const p = body.translation(),
          q = body.rotation();
        object.position.set(p.x, p.y, p.z);
        object.quaternion.set(q.x, q.y, q.z, q.w);
      }
      for (const b of this.behaviors.values()) b.update?.(dt);
      const player = this.document.entities.find((e) => e.tag === "player"),
        object = player && this.objects.get(player.id);
      if (object) {
        if (object.position.y < -20) this.respawn();
        if (this.cameraRig === "first-person") {
          this.camera.position.copy(object.position).add(new T.Vector3(0, 0.55, 0));
          this.camera.rotation.set(this.look.pitch, this.look.yaw, 0, "YXZ");
        } else if (this.cameraRig !== "orbit") {
          const offset = new T.Vector3(0, 5, 9).applyAxisAngle(
            new T.Vector3(0, 1, 0),
            this.cameraRig === "vehicle" ? object.rotation.y : this.look.yaw,
          );
          this.follow.copy(object.position).add(offset);
          this.camera.position.lerp(this.follow, 1 - Math.exp(-5 * dt));
          this.camera.lookAt(object.position.x, object.position.y + 0.6, object.position.z);
        }
      }
    }
    if (this.orbit.enabled) this.orbit.update();
    let visible = 0;
    if (this.document)
      for (const e of this.document.entities) {
        const object = this.objects.get(e.id);
        if (!object) continue;
        object.getWorldPosition(this.follow);
        object.visible =
          e.enabled &&
          !this.collected.has(e.id) &&
          !(this.playing && this.cameraRig === "first-person" && e.tag === "player") &&
          this.follow.distanceToSquared(this.camera.position) <
            (this.settings.viewDistance + Math.max(...e.transform.scale) * 2) ** 2;
        if (object.visible) visible++;
      }
    this.renderer.info.reset();
    try {
      if (this.effects) this.effects.draw(dt, this.settings);
      else this.renderer.render(this.scene, this.camera);
    } catch (error) {
      this.events.emit("error", "Render failed: " + String(error));
      this.paused = true;
    }
    this.frames++;
    this.elapsed += dt;
    this.hudClock += dt;
    if (this.hudClock >= 0.5) {
      this.options.onStats?.({
        fps: this.frames / this.elapsed,
        frameMs: performance.now() - start,
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        visible,
        entities: this.objects.size,
        bodies: this.physics.bodies.size,
        adapter: this.adapter,
        width: this.bufferSize.x,
        height: this.bufferSize.y,
      });
      this.frames = 0;
      this.elapsed = 0;
      this.hudClock = 0;
    }
  };
  private clear() {
    this.behaviorBuilder = undefined;
    for (const b of this.behaviors.values()) b.dispose?.();
    this.behaviors.clear();
    this.physics.dispose();
    for (const lease of this.imported.values()) lease.release();
    this.imported.clear();
    for (const b of this.beams) {
      b.geometry.dispose();
      b.material.dispose();
    }
    this.beams = [];
    this.root.clear();
    this.objects.clear();
    for (const g of this.geometries.values()) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.geometries.clear();
    this.materials.clear();
  }
  dispose() {
    this.loadAbort?.abort();
    this.dead = true;
    this.generation++;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    for (const fn of this.cleanup) fn();
    this.gizmo.dispose();
    this.orbit.dispose();
    this.effects?.dispose();
    this.clear();
    this.assetCache.dispose();
    this.uiRenderer.dispose();
    this.ui.dispose();
    this.sun.shadow.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
