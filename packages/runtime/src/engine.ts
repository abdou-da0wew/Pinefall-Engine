import { invalidateObjectGPU } from "../../assets/src/gpu-reset";
import { materialSlots, inspectSlotUV } from "./material-slots";
import { GraphicsImages } from "./graphics-images";
import { acquireEnvironment, invalidateEnvironments, type EnvironmentLease } from "./environment";
import { installDirectionalFit } from "./shadow-fit";
import { ShaderCompiler, setShaderUniform } from "./shader-runtime";
import { parseShader, type ShaderSource } from "./shader-definition";
import {
  surfaceMaterial,
  updateSurface,
  makeLight,
  applyLight,
  type SceneLight,
} from "./graphics-material";
import {
  DEFAULT_POST,
  DEFAULT_SURFACE,
  parsePost,
  parseSurface,
  parseLight,
  bounded,
  choice,
  type Surface,
  type PostSettings,
  type LightDefinition,
} from "./graphics-definition";
import type { GraphicsAPI, GraphicsSnapshot } from "./graphics-api";
import { AudioService, AudioCatalog } from "../../audio/src/service";
import { BrowserAudioBackend } from "../../audio/src/browser";
import { FixedSimulation } from "./fixed";
import { AnimationGraphPlayer } from "../../animation/src/graph-player";
import { assetMemory, type Reservation } from "../../assets/src/budget";
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
interface WorldResources {
  images?: GraphicsImages;
  environment?: EnvironmentLease;
  animators: Map<string, AnimationGraphPlayer>;
  reservation?: Reservation;
  root: T.Group;
  objects: Map<string, T.Group>;
  physics: PhysicsSystem;
  geometries: Map<Primitive, T.BufferGeometry>;
  materials: Map<string, T.Material>;
  imported: Map<string, ModelLease>;
  beams: T.Mesh<T.BufferGeometry, T.ShaderMaterial>[];
}
function disposeWorld(world: WorldResources) {
  world.environment?.release();
  world.images?.dispose();
  for (const animator of world.animators.values()) animator.dispose();
  world.animators.clear();
  world.physics.dispose();
  for (const lease of world.imported.values()) lease.release();
  world.imported.clear();
  for (const b of world.beams) {
    b.geometry.dispose();
    b.material.dispose();
  }
  world.beams.length = 0;
  world.root.traverse((o) => {
    if (o instanceof T.Light && "shadow" in o) (o as SceneLight).shadow.dispose();
  });
  world.root.clear();
  world.objects.clear();
  for (const g of world.geometries.values()) g.dispose();
  for (const m of world.materials.values()) m.dispose();
  world.geometries.clear();
  world.materials.clear();
  world.reservation?.release();
}
export interface Stats {
  graphics?: GraphicsSnapshot;
  fps: number;
  drawCalls: number;
  triangles: number;
  visible: number;
  entities: number;
  bodies: number;
  frameMs: number;
  adapter: string;
  assetAccountedBytes: number;
  assetPeakAccountedBytes: number;
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
  readonly audio = new AudioService(new BrowserAudioBackend(), (message, data) =>
    this.events.emit("audio", message, data),
  );
  readonly fixed = new FixedSimulation();
  animators = new Map<string, AnimationGraphPlayer>();
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
  readonly graphics: GraphicsAPI = this.createGraphicsAPI();
  private runtimePost?: PostSettings;
  private shaderCompiler?: ShaderCompiler;
  private shaderEpoch = new AbortController();
  private playSettingsSnapshot?: RenderSettings;
  private runtimeSurfaces = new Map<string, Surface>();
  private contextLost = false;
  private environmentLease?: EnvironmentLease;
  private graphicsImages?: GraphicsImages;
  private shadowFitFrame = 0;
  private shadowBoundsFrame = -1;
  private shadowBounds = new T.Box3();
  private shadowBytes = 0;
  private shadowViews = 0;
  private shadowReasons: string[] = [];
  private shadowAllocation?: Reservation;
  private requestedPost(): PostSettings {
    return (
      this.runtimePost ??
      this.settings.previewPost ??
      this.document?.graphics?.post ?? {
        ...DEFAULT_POST,
        enabled: this.settings.post,
        bloom: this.settings.glow,
        threshold: this.settings.threshold,
        strength: this.settings.strength,
        exposure: this.settings.exposure,
      }
    );
  }
  private createGraphicsAPI(): GraphicsAPI {
    // oxlint-disable-next-line typescript/no-this-alias -- Stable API accessor captures its owning runtime.
    const engine = this;
    return {
      async compileShader(id, source, signal) {
        if (engine.dead || engine.loading || engine.contextLost)
          throw Error("Renderer unavailable for shader compilation");
        if (!engine.settings.allowCustomShaders)
          throw Error("Custom GPU code is disabled; explicitly enable shader preview first");
        const root = engine.objects.get(id);
        if (!root) throw Error("Shader target missing");
        if (
          !engine.materials.has("shader:" + id) &&
          [...engine.materials.keys()].filter((k) => k.startsWith("shader:")).length >= 16
        )
          throw Error("Custom shader instance budget");
        const generation = engine.generation;
        const material = await engine.compileShader(
          root,
          source,
          signal ? AbortSignal.any([signal, engine.shaderEpoch.signal]) : engine.shaderEpoch.signal,
        );
        if (
          engine.dead ||
          engine.contextLost ||
          !engine.settings.allowCustomShaders ||
          signal?.aborted ||
          engine.shaderEpoch.signal.aborted ||
          engine.generation !== generation ||
          engine.objects.get(id) !== root
        ) {
          material.dispose();
          throw Error("Shader target changed during compilation");
        }
        engine.assignSurface(id, material, engine.liveWorld());
        engine.materials.get("shader:" + id)?.dispose();
        engine.materials.set("shader:" + id, material);
        root.traverse((o) => {
          if (o instanceof T.Mesh && o.userData.entityId === id) o.castShadow = false;
        });
      },
      setUniform(id, name, value) {
        if (engine.dead) throw Error("Graphics runtime disposed");
        const material = engine.materials.get("shader:" + id);
        if (!(material instanceof T.ShaderMaterial))
          throw Error("No applied custom shader on target");
        setShaderUniform(material, name, value);
      },
      get snapshot() {
        const post = engine.requestedPost();
        return {
          available: !engine.dead && !engine.contextLost,
          backend: "webgl2" as const,
          adapter: engine.adapter,
          hdr: engine.renderer?.extensions.has("EXT_color_buffer_float") ?? false,
          requested: structuredClone(post),
          effective: {
            ...structuredClone(post),
            enabled: post.enabled && !engine.dead && !engine.contextLost,
            scattering:
              post.enabled && !engine.dead && !engine.contextLost ? post.scattering : undefined,
            bloom: post.enabled && post.bloom && !engine.dead && !engine.contextLost,
            fxaa: post.enabled && post.fxaa && !engine.dead && !engine.contextLost,
          },
          postTargetBytes: engine.effects?.snapshot.targetBytes ?? 0,
          shadowTargetBytes: engine.shadowBytes,
          environmentTargetBytes: engine.environmentLease?.bytes ?? 0,
          shadowViews: engine.shadowViews,
          reasons: [
            ...engine.shadowReasons,
            ...(engine.effects?.snapshot.scattering?.reasons ?? []),
            ...(engine.document?.graphics?.environment && !engine.environmentLease
              ? ["PMREM environment unavailable: floating-point render targets are unsupported."]
              : []),
            ...(!engine.renderer?.extensions.has("EXT_color_buffer_float") &&
            (post.bloom || post.scattering)
              ? ["HDR unavailable: bloom/scattering targets use an LDR approximation."]
              : []),
          ],
          contextLost: engine.contextLost,
        };
      },
      setPost(patch) {
        if (engine.dead) throw Error("Graphics runtime disposed");
        engine.runtimePost = parsePost({ ...engine.requestedPost(), ...patch });
        engine.applySettings(engine.settings);
      },
      setPreview(patch) {
        if (engine.dead) throw Error("Graphics runtime disposed");
        if (
          Object.keys(patch).some(
            (k) => !["preset", "renderScale", "shadows", "viewDistance"].includes(k),
          )
        )
          throw Error("Unsupported preview setting");
        engine.applySettings({ ...engine.settings, ...patch });
      },
      setMaterial(id, patch) {
        if (engine.dead) throw Error("Graphics runtime disposed");
        const entity = engine.document.entities.find((e) => e.id === id);
        if (!entity?.mesh || !engine.objects.has(id)) throw Error("Material target missing");
        const base = engine.runtimeSurfaces.get(id) ??
          entity.mesh.surface ??
          engine.document.graphics?.materials.find((m) => m.id === entity.mesh?.material) ?? {
            ...DEFAULT_SURFACE,
            color: entity.mesh.color,
          };
        const next = parseSurface({ ...base, ...patch });
        const old = engine.materials.get("runtime:" + id);
        if (JSON.stringify(next.maps) !== JSON.stringify(base.maps))
          throw Error("Runtime texture bindings are immutable; stage authored changes with load()");
        const compatible =
          (next.family === "pbr" && old instanceof T.MeshStandardMaterial) ||
          (next.family === "unlit" && old instanceof T.MeshBasicMaterial);
        const material = compatible
          ? (old as T.MeshStandardMaterial | T.MeshBasicMaterial)
          : surfaceMaterial(next, engine.graphicsImages);
        if (compatible) updateSurface(material, next);
        engine.assignSurface(id, material, engine.liveWorld());
        if (old !== material) old?.dispose();
        engine.materials.get("shader:" + id)?.dispose();
        engine.materials.delete("shader:" + id);
        engine.materials.set("runtime:" + id, material);
        engine.runtimeSurfaces.set(id, next);
        engine.objects.get(id)?.traverse((o) => {
          if (o instanceof T.Mesh && !o.userData.volume && o.userData.entityId === id)
            o.castShadow = entity.mesh?.castShadow ?? next.alphaMode !== "blend";
        });
        engine.invalidateShadows(false);
      },
      setLight(id, patch) {
        if (engine.dead) throw Error("Graphics runtime disposed");
        const object = engine.objects.get(id),
          light = object?.children.find((o) => o instanceof T.Light) as SceneLight | undefined;
        if (!light) throw Error("Light target missing");
        const next = parseLight({ ...light.userData.pinefallLight, ...patch });
        if (next.type !== light.userData.pinefallLight.type)
          throw Error("Changing runtime light type requires an authored scene edit");
        applyLight(light, next);
        engine.configureShadows();
      },
      invalidateShadows(entityId) {
        if (engine.dead) throw Error("Graphics runtime disposed");
        if (entityId && !engine.objects.has(entityId)) throw Error("Shadow target missing");
        engine.invalidateShadows(true, entityId);
      },
    };
  }
  private compileShader(root: T.Object3D, source: ShaderSource, signal: AbortSignal) {
    parseShader(source);
    return (this.shaderCompiler ??= new ShaderCompiler(this.renderer)).compile(
      root,
      this.camera,
      this.scene,
      source,
      signal,
    );
  }
  private async authoredShader(
    e: Entity,
    doc: SceneDocument,
    world: WorldResources,
    signal: AbortSignal,
    strict = false,
  ) {
    if (!e.mesh?.shader) return;
    const source = doc.graphics?.shaders?.find((s) => s.id === e.mesh?.shader);
    if (!source) throw Error("Missing shader source");
    let material: T.Material;
    if (!this.settings.allowCustomShaders) {
      material = new T.MeshBasicMaterial({ color: 0xff00ff });
      this.events.emit(
        "render",
        "Custom shader blocked; enable trusted shader preview: " + source.name,
      );
    } else {
      try {
        material = await this.compileShader(world.objects.get(e.id)!, source, signal);
        if (signal.aborted || !this.settings.allowCustomShaders || this.contextLost) {
          material.dispose();
          throw new DOMException("Shader permission or context changed", "AbortError");
        }
      } catch (error) {
        signal.throwIfAborted();
        if (strict) throw error;
        material = new T.MeshBasicMaterial({ color: 0xff00ff });
        this.events.emit("error", "Custom shader failed; visible error material: " + String(error));
      }
    }
    world.materials.set("shader:" + e.id, material);
    this.assignSurface(e.id, material, world);
    world.objects.get(e.id)?.traverse((o) => {
      if (o instanceof T.Mesh && o.userData.entityId === e.id) o.castShadow = false;
    });
  }
  private assignSurface(id: string, material: T.Material, world: WorldResources) {
    world.objects.get(id)?.traverse((o) => {
      if (o instanceof T.Mesh && !o.userData.volume && o.userData.entityId === id)
        o.material =
          o.userData.pinefallSlotCount > 1
            ? Array.from({ length: o.userData.pinefallSlotCount }, () => material)
            : material;
    });
  }
  inspectUV(id: string, key: string, channel: 0 | 1) {
    const root = this.objects.get(id);
    if (!root) throw Error("UV inspection target missing");
    return inspectSlotUV(root, id, key, channel);
  }
  inspectMaterialSlots(id: string) {
    const root = this.objects.get(id);
    return root
      ? materialSlots(root, id).map(({ mesh: _mesh, index: _index, ...info }) => info)
      : [];
  }
  private authoredSurface(e: Entity, doc: SceneDocument, world: WorldResources) {
    const slots = materialSlots(world.objects.get(e.id)!, e.id);
    const surface =
      e.mesh?.surface ?? doc.graphics?.materials.find((m) => m.id === e.mesh?.material);
    if (surface) {
      const material = surfaceMaterial(surface, world.images);
      world.objects.get(e.id)?.traverse((object) => {
        if (object instanceof T.Mesh && object.userData.entityId === e.id)
          for (const binding of Object.values(surface.maps ?? {})) {
            if (!object.geometry.getAttribute(binding.uv === 0 ? "uv" : "uv1")) {
              material.dispose();
              throw Error("Requested UV channel missing on " + e.name);
            }
          }
      });
      world.materials.set("surface:" + e.id, material);
      this.assignSurface(e.id, material, world);
    }
    for (const binding of e.mesh?.slots ?? []) {
      const source =
        e.mesh?.primitive === "asset"
          ? doc.assets.find((asset) => asset.id === e.mesh?.asset)?.data
          : "primitive:" + e.mesh?.primitive;
      if (source !== binding.source)
        throw Error("Material slots require review/remapping after model replacement");
      const slot = slots.find((slot) => slot.key === binding.key);
      if (!slot) throw Error("Authored material slot no longer exists");
      const definition =
        binding.surface ?? doc.graphics?.materials.find((m) => m.id === binding.material);
      if (!definition) throw Error("Missing slot material");
      for (const map of Object.values(definition.maps ?? {}))
        if (!slot.mesh.geometry.getAttribute(map.uv === 0 ? "uv" : "uv1"))
          throw Error("Requested UV channel is missing on slot " + binding.key);
      const material = surfaceMaterial(definition, world.images);
      world.materials.set("slot:" + e.id + ":" + binding.key, material);
      const materials = Array.isArray(slot.mesh.material)
        ? [...slot.mesh.material]
        : Array.from(
            { length: slot.mesh.userData.pinefallSlotCount },
            () => slot.mesh.material as T.Material,
          );
      materials[slot.index] = material;
      slot.mesh.material = materials.length === 1 ? materials[0] : materials;
    }
    world.objects.get(e.id)?.traverse((o) => {
      if (o instanceof T.Mesh && !o.userData.volume && o.userData.entityId === e.id) {
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        o.castShadow = e.mesh?.castShadow ?? materials.some((material) => !material.transparent);
        o.receiveShadow = e.mesh?.receiveShadow ?? true;
      }
    });
  }
  private invalidateShadows(explicit = true, entityId?: string) {
    this.renderer.shadowMap.needsUpdate = true;
    (entityId ? this.objects.get(entityId)! : this.scene).traverse((o) => {
      if (
        o instanceof T.Light &&
        "shadow" in o &&
        (explicit ||
          (o.userData.pinefallLight as LightDefinition | undefined)?.shadowUpdate !== "manual")
      )
        (o as SceneLight).shadow.needsUpdate = true;
    });
  }
  private configureShadows() {
    const enabled = this.settings.shadows ?? this.settings.preset === "high";
    this.renderer.shadowMap.enabled = enabled;
    this.shadowBytes = 0;
    this.shadowViews = 0;
    this.shadowReasons = [];
    const budget = this.settings.preset === "low" ? 1 : 8;
    const apply = (light: SceneLight, requested: boolean, size: number, label: string) => {
      const views = light instanceof T.PointLight ? 6 : 1;
      const side = Math.min(size, this.settings.preset === "low" ? 512 : 1024);
      const bytes = side * side * 8 * (light instanceof T.PointLight ? 8 : 1);
      const allowed =
        enabled &&
        requested &&
        this.shadowViews + views <= budget &&
        this.shadowBytes + bytes <= 64 * 1048576;
      if (requested && !allowed)
        this.shadowReasons.push(label + ": shadows disabled by preview profile/allocation budget");
      if (requested && allowed && side !== size)
        this.shadowReasons.push(label + ": shadow resolution capped to " + side);
      const changed = light.castShadow !== allowed || light.shadow.mapSize.x !== side;
      if (changed) {
        light.shadow.map?.dispose();
        light.shadow.map = null;
      }
      light.castShadow = allowed;
      light.shadow.mapSize.set(side, side);
      if (allowed) {
        this.shadowViews += views;
        this.shadowBytes += bytes;
        if (changed || !light.shadow.map) light.shadow.needsUpdate = true;
      }
      if (light instanceof T.DirectionalLight)
        installDirectionalFit(light, () => {
          if (this.shadowBoundsFrame !== this.shadowFitFrame) {
            this.root.updateWorldMatrix(true, true);
            this.shadowBounds.setFromObject(this.root);
            this.shadowBoundsFrame = this.shadowFitFrame;
          }
          return this.shadowBounds;
        });
    };
    apply(this.sun, enabled, 1024, "Environment sun");
    this.root.traverse((o) => {
      if (o instanceof T.Light && "shadow" in o) {
        const light = o as SceneLight;
        const definition = light.userData.pinefallLight as LightDefinition;
        apply(
          light,
          definition?.castShadow ?? false,
          definition?.shadowSize ?? 512,
          light.parent?.name ?? "Light",
        );
      }
    });
    (this.shadowAllocation ??= assetMemory.reserve(0, "shadow-targets")).resize(this.shadowBytes);
  }
  settings: RenderSettings = { ...LOW };
  loading = false;
  playing = false;
  private _paused = false;
  get paused() {
    return this._paused;
  }
  set paused(value: boolean) {
    this._paused = value;
    this.audio.setPaused(value);
  }
  jump = false;
  look = { yaw: 0, pitch: 0 };
  checkpoint: Vec3 = [0, 2, 8];
  collected = new Set<string>();
  goalCount = 0;
  won = false;
  speed = 0;
  private root = new T.Group();
  private worldReservation?: Reservation;
  private ambient = new T.HemisphereLight("#c4ddd7", "#405344", 2);
  private sun = new T.DirectionalLight("#ffe1b0", 2);
  private geometries = new Map<Primitive, T.BufferGeometry>();
  private materials = new Map<string, T.Material>();
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
    const lost = (event: Event) => {
      event.preventDefault();
      this.contextLost = true;
      this.shaderEpoch.abort();
      this.loadAbort?.abort();
      this.effects?.dispose();
      this.effects = null;
      invalidateEnvironments(this.renderer);
      this.graphicsImages?.invalidateGPU();
      this.assetCache.invalidateGPU();
      invalidateObjectGPU(this.scene);
      this.input.clear();
      this.audio.setPaused(true);
      this.events.emit("render", "WebGL context lost; rendering suspended; authored data retained");
    };
    const restored = () => {
      this.contextLost = false;
      this.shaderEpoch = new AbortController();
      this.audio.setPaused(this.paused);
      this.last = 0;
      this.effects?.dispose();
      this.effects = null;
      invalidateEnvironments(this.renderer);
      this.environmentLease?.release();
      this.environmentLease = this.document?.graphics?.environment
        ? acquireEnvironment(
            this.renderer,
            this.document.graphics.environment,
            this.document.graphics.environment.image
              ? this.graphicsImages?.source(this.document.graphics.environment.image)
              : undefined,
            this.document.graphics.images?.find(
              (image) => image.id === this.document.graphics?.environment?.image,
            )?.data,
          )
        : undefined;
      this.scene.environment = this.environmentLease?.texture ?? null;
      this.applySettings(this.settings);
      this.events.emit("render", "WebGL context restored; graphics resources rebuilding");
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    this.cleanup.push(() => {
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = T.PCFShadowMap;
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
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || !this.playing) return;
      if (document.querySelector('dialog[open],[role="dialog"],[role="menu"]')) return;
      if (e.code === "Escape" && !(e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        if (!e.repeat) {
          this.paused = !this.paused;
          this.input.clear();
          this.jump = false;
          this.events.emit("gameplay", this.paused ? "Paused" : "Resumed");
        }
        return;
      }
      if (
        e.target instanceof Element &&
        e.target.closest(
          '[data-pinefall-ui],input,textarea,select,[contenteditable]:not([contenteditable="false"])',
        )
      )
        return;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight"].includes(e.code))
        e.preventDefault();
      if (e.code === "KeyR") this.respawn();
      if (e.code === "Space" && !e.repeat) this.jump = true;
      this.input.add(e.code);
      if (e.shiftKey) this.input.add("Shift");
    });
    this.listen(window, "focusin", (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest(
          'dialog,[role="dialog"],[role="menu"],input,textarea,select,[contenteditable],[data-pinefall-ui]',
        )
      ) {
        this.input.clear();
        this.jump = false;
      }
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
    this.listen(document, "visibilitychange", () => {
      if (document.hidden || this.contextLost) {
        this.paused = true;
        this.input.clear();
        void this.audio.suspend().catch((error) => this.events.emit("error", String(error)));
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
  }
  private geometry(primitive: Primitive, geometries = this.geometries) {
    let geometry = geometries.get(primitive);
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
      geometries.set(primitive, geometry);
    }
    return geometry;
  }
  private material(color: string, materials = this.materials) {
    let m = materials.get(color);
    if (!m) {
      m = new T.MeshStandardMaterial({ color, roughness: 0.82 });
      materials.set(color, m);
    }
    return m;
  }
  async load(
    input: SceneDocument,
    options: { preserveView?: boolean; strictShaders?: boolean; signal?: AbortSignal } = {},
  ) {
    const started = performance.now();
    const savedView = options.preserveView
      ? { position: this.camera.position.clone(), target: this.orbit.target.clone() }
      : null;
    let scene = parseScene(input);
    const generation = ++this.generation;
    this.shaderEpoch.abort();
    this.shaderEpoch = new AbortController();
    this.loading = true;
    this.loadAbort?.abort();
    const controller = new AbortController();
    this.loadAbort = controller;
    const externalAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", externalAbort, { once: true });
    if (options.signal?.aborted) externalAbort();
    const staged = new Map<string, ModelLease>();
    let world: WorldResources | undefined;
    let audio: AudioCatalog | undefined;
    let worldReservation: Reservation | undefined;
    try {
      scene = await referenceScene(scene, controller.signal);
      audio = await AudioCatalog.prepare(scene.audio, controller.signal);
      for (const asset of scene.assets) {
        if (!scene.entities.some((e) => e.mesh?.asset === asset.id)) continue;
        await this.assetCache.prepare(asset.data, controller.signal, (update) => {
          this.events.emit("asset", "Model " + update.stage, {
            operationId: update.id,
            elapsedMs: update.elapsedMs,
          });
        });
        // Pin the prototype across preparation of the remaining assets.
        const lease = await this.assetCache.acquireAsync(
          asset.data,
          `staging:${generation}:${asset.id}`,
          controller.signal,
        );
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
      this.events.emit("asset", "Prepared model resources", {
        operationId: generation,
        elapsedMs: performance.now() - started,
        accountedBytes: assetMemory.snapshot.used,
      });
      // Build the complete replacement off-scene. The active physics world/leases remain usable.
      worldReservation = assetMemory.reserve(
        2 * 1024 * 1024 + scene.entities.length * 32768,
        "world",
      );
      world = {
        animators: new Map(),
        reservation: worldReservation,
        root: new T.Group(),
        objects: new Map(),
        physics: new PhysicsSystem(scene.environment.gravity),
        geometries: new Map(),
        materials: new Map(),
        imported: new Map(),
        beams: [],
      };
      const imageIds = new Set<string>();
      for (const entity of scene.entities) {
        const surface =
          entity.mesh?.surface ??
          scene.graphics?.materials.find((material) => material.id === entity.mesh?.material);
        for (const binding of Object.values(surface?.maps ?? {})) imageIds.add(binding.image);
        for (const slot of entity.mesh?.slots ?? []) {
          const material =
            slot.surface ?? scene.graphics?.materials.find((m) => m.id === slot.material);
          for (const binding of Object.values(material?.maps ?? {})) imageIds.add(binding.image);
        }
      }
      if (scene.graphics?.environment?.image) imageIds.add(scene.graphics.environment.image);
      world.images = await GraphicsImages.prepare(
        scene.graphics?.images ?? [],
        imageIds,
        controller.signal,
        scene.graphics?.environment?.resolution,
      );
      if (scene.graphics?.environment)
        world.environment = acquireEnvironment(
          this.renderer,
          scene.graphics.environment,
          scene.graphics.environment.image
            ? world.images.source(scene.graphics.environment.image)
            : undefined,
          scene.graphics.images?.find((image) => image.id === scene.graphics?.environment?.image)
            ?.data,
        );
      let slice = performance.now();
      for (const e of scene.entities) {
        controller.signal.throwIfAborted();
        this.addEntity(e, world);
        if (e.mesh?.primitive === "asset") {
          const asset = scene.assets.find((a) => a.id === e.mesh?.asset)!;
          const lease = await this.assetCache.acquireAsync(
            asset.data,
            `entity:${generation}:${e.id}`,
            controller.signal,
          );
          world.imported.set(e.id, lease);
          lease.root.traverse((o) => {
            o.userData.entityId = e.id;
            if (o instanceof T.Mesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          world.objects.get(e.id)!.add(lease.root);
          if (e.animator)
            world.animators.set(
              e.id,
              new AnimationGraphPlayer(lease.root, e.animator, asset.import!),
            );
        }
        this.authoredSurface(e, scene, world);
        await this.authoredShader(e, scene, world, controller.signal, options.strictShaders);
        if (performance.now() - slice > 2) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          slice = performance.now();
        }
      }
      await world.images.upload(this.renderer, controller.signal);
      for (const e of scene.entities)
        if (e.parent) world.objects.get(e.parent)!.add(world.objects.get(e.id)!);
      if (imageIds.size || scene.entities.some((entity) => entity.mesh?.slots?.length)) {
        const warm = new T.Scene();
        warm.environment = world.environment?.texture ?? null;
        const sun = this.sun.clone(),
          ambient = this.ambient.clone();
        warm.add(world.root, sun, ambient);
        try {
          await this.renderer.compileAsync(warm, this.camera);
        } finally {
          warm.remove(world.root);
          sun.shadow.dispose();
        }
      }
      controller.signal.throwIfAborted();
      if (this.dead || generation !== this.generation) return;
    } catch (error) {
      audio?.dispose();
      audio = undefined;
      if (world) {
        disposeWorld(world);
        world = undefined;
      } else worldReservation?.release();
      for (const lease of staged.values()) lease.release();
      this.assetCache.pruneUnused();
      if (generation === this.generation) this.loading = false;
      if (controller.signal.aborted) {
        if (options.signal) throw controller.signal.reason;
        return;
      }
      this.events.emit("error", "Asset preparation failed; previous world retained", {
        error: String(error),
      });
      throw error;
    } finally {
      options.signal?.removeEventListener("abort", externalAbort);
      if (this.dead || generation !== this.generation) {
        audio?.dispose();
        audio = undefined;
        if (world) {
          disposeWorld(world);
          world = undefined;
        }
        for (const lease of staged.values()) lease.release();
        this.assetCache.pruneUnused();
      }
    }
    if (!world) return;
    // No awaited work between generation check and pointer/ownership swap.
    if (this.playing && this.playSettingsSnapshot) this.settings = this.playSettingsSnapshot;
    this.playSettingsSnapshot = undefined;
    this.playing = false;
    this.paused = false;
    this.input.clear();
    this.gizmo.detach();
    this.clear(true);
    this.audio.adopt(audio!);
    this.scene.remove(this.root);
    this.root = world.root;
    this.scene.add(this.root);
    for (const [id, object] of world.objects) this.objects.set(id, object);
    this.worldReservation = world.reservation;
    this.environmentLease = world.environment;
    this.graphicsImages = world.images;
    this.scene.environment = world.environment?.texture ?? null;
    this.scene.environmentIntensity = scene.graphics?.environment?.intensity ?? 1;
    this.physics = world.physics;
    this.geometries = world.geometries;
    this.materials = world.materials;
    this.imported = world.imported;
    this.animators = world.animators;
    this.beams = world.beams;
    this.document = cloneScene(scene);
    this.runtimePost = undefined;
    this.runtimeSurfaces.clear();
    this.ui.load(scene.ui);
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
    for (const lease of staged.values()) lease.release();
    this.assetCache.pruneUnused();
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
    this.events.emit("scene", "Loaded " + scene.name, {
      entities: scene.entities.length,
      operationId: generation,
      elapsedMs: performance.now() - started,
      accountedBytes: assetMemory.snapshot.used,
      peakAccountedBytes: assetMemory.snapshot.peak,
    });
  }
  private liveWorld(): WorldResources {
    return {
      reservation: this.worldReservation,
      environment: this.environmentLease,
      images: this.graphicsImages,
      animators: this.animators,
      root: this.root,
      objects: this.objects,
      physics: this.physics,
      geometries: this.geometries,
      materials: this.materials,
      imported: this.imported,
      beams: this.beams,
    };
  }
  private addEntity(e: Entity, world: WorldResources = this.liveWorld()) {
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
      const mesh = new T.Mesh(
        this.geometry(e.mesh.primitive, world.geometries),
        this.material(e.mesh.color, world.materials),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.entityId = e.id;
      object.add(mesh);
    }
    if (e.light) {
      const light = makeLight(e.light);
      object.add(light);
      if (light instanceof T.SpotLight || light instanceof T.DirectionalLight) {
        const target = new T.Object3D();
        target.position.set(0, -1, 0);
        object.add(target);
        light.target = target;
      }
      if (light instanceof T.SpotLight) {
        const volume = beam(e.light.color);
        volume.position.y = -e.light.range * 0.35;
        volume.scale.set(e.light.range * 0.4, e.light.range * 0.7, e.light.range * 0.4);
        volume.userData.volume = true;
        world.beams.push(volume);
        object.add(volume);
      }
    }
    world.root.add(object);
    world.objects.set(e.id, object);
    world.physics.add(e);
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
    this.playSettingsSnapshot = structuredClone(this.settings);
    this.fixed.clear();
    this.audio.reset(true);
    this.playing = true;
    this.physics.deferredMotion = true;
    this.ui.interactive = true;
    this.paused = false;
    this.gizmo.detach();
    this.look = { yaw: 0, pitch: 0 };
    this.accumulator = 0;
    this.collected.clear();
    this.won = false;
    this.behaviors.clear();
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
    const player = this.document.entities.find((e) => e.tag === "player");
    if (player) this.checkpoint = [...player.transform.position];
    this.orbit.enabled = this.cameraRig === "orbit";
    this.events.emit("gameplay", "Play started — " + this.document.name);
    this.canvas.focus();
  }
  async stop() {
    if (!this.document) return;
    this.audio.reset();
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
    if (!this.playing || this.dead) throw Error("Runtime spawning requires Play");
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
    let animator: AnimationGraphPlayer | undefined;
    try {
      if (e.animator && lease)
        animator = new AnimationGraphPlayer(
          lease.root,
          e.animator,
          this.document.assets.find((a) => a.id === e.mesh?.asset)!.import!,
        );
      this.document.entities.push(e);
      this.addEntity(e);
      if (lease) {
        this.imported.set(e.id, lease);
        lease.root.traverse((o) => {
          o.userData.entityId = e.id;
        });
        this.objects.get(e.id)!.add(lease.root);
      }
      this.authoredSurface(e, this.document, this.liveWorld());
      this.configureShadows();
      if (animator) this.animators.set(e.id, animator);
    } catch (error) {
      animator?.dispose();
      lease?.release();
      this.imported.delete(e.id);
      this.physics.remove(e.id);
      this.objects.get(e.id)?.removeFromParent();
      this.objects.delete(e.id);
      this.document.entities = this.document.entities.filter((item) => item.id !== e.id);
      throw error;
    }
    if (e.enabled && this.behaviorBuilder) {
      const behavior = this.behaviorBuilder(e);
      this.behaviors.set(e.id, behavior);
      behavior.start?.();
    }
    return e;
  }
  destroy(id: string) {
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
      this.audio.stopOwner(key);
      const b = this.behaviors.get(key);
      this.behaviors.delete(key);
      b?.dispose?.();
      this.physics.remove(key);
      this.animators.get(key)?.dispose();
      this.animators.delete(key);
      this.imported.get(key)?.release();
      this.imported.delete(key);
      this.objects.get(key)?.traverse((o) => {
        if (o instanceof T.Light && "shadow" in o) (o as SceneLight).shadow.dispose();
      });
      for (const prefix of ["runtime:", "surface:", "shader:"]) {
        this.materials.get(prefix + key)?.dispose();
        this.materials.delete(prefix + key);
      }
      this.runtimeSurfaces.delete(key);
      this.objects.get(key)?.removeFromParent();
      this.objects.delete(key);
    }
    this.document.entities = this.document.entities.filter((e) => !ids.has(e.id));
    this.configureShadows();
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
    this.spawn(e);
    this.events.emit("physics", "Queued dynamic crate");
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
    choice(settings.preset, ["low", "high"]);
    bounded(settings.viewDistance, 1, 500);
    bounded(settings.renderScale ?? 1, 0.25, 1);
    if (settings.shadows !== undefined && typeof settings.shadows !== "boolean")
      throw Error("Invalid shadow preview flag");
    if (
      settings.allowCustomShaders !== undefined &&
      typeof settings.allowCustomShaders !== "boolean"
    )
      throw Error("Invalid custom shader trust flag");
    if (settings.previewPost) parsePost(settings.previewPost);
    if (this.settings.allowCustomShaders && !settings.allowCustomShaders) {
      this.shaderEpoch.abort();
      this.shaderEpoch = new AbortController();
      this.loadAbort?.abort();
      for (const [key, material] of this.materials)
        if (key.startsWith("shader:")) {
          const fallback = new T.MeshBasicMaterial({ color: 0xff00ff });
          this.assignSurface(key.slice(7), fallback, this.liveWorld());
          material.dispose();
          this.materials.set(key, fallback);
        }
    }
    this.settings = { ...settings };
    this.configureShadows();
    const post = parsePost(this.requestedPost());
    this.renderer.toneMapping = {
      aces: T.ACESFilmicToneMapping,
      neutral: T.NeutralToneMapping,
      reinhard: T.ReinhardToneMapping,
      none: T.LinearToneMapping, // No artistic curve; retain linear exposure gain.
    }[post.toneMapping];
    this.renderer.toneMappingExposure = post.exposure;
    for (const b of this.beams) {
      b.visible = settings.volumetrics;
      b.material.uniforms.opacity.value = settings.beamOpacity;
    }
    if (post.enabled && !this.effects)
      this.effects = new Effects(this.renderer, this.scene, this.camera);
    if (!post.enabled && this.effects) {
      this.effects.dispose();
      this.effects = null;
    }
    this.effects?.configure(post);
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
    const width = Math.max(1, Math.round(rect.width * ratio * (this.settings.renderScale ?? 1))),
      height = Math.max(1, Math.round(rect.height * ratio * (this.settings.renderScale ?? 1)));
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
    if (document.hidden || this.contextLost) {
      this.last = now;
      return;
    }
    if (now < this.nextFrame) return;
    const interval = 1000 / (this.settings.preset === "high" && this.playing ? 60 : 30);
    this.nextFrame = now + interval - ((now - this.nextFrame) % interval);
    const rawDt = this.last ? (now - this.last) / 1000 : 1 / 30;
    const dt = Math.min(0.1, rawDt);
    if (this.playing && !this.paused) this.fixed.discard(rawDt - dt, this);
    this.last = now;
    const start = performance.now();
    this.audio.advance(dt, (id) => {
      const node = this.objects.get(id);
      return node ? (node.getWorldPosition(new T.Vector3()).toArray() as Vec3) : undefined;
    });
    this.audio.listener(
      this.camera.getWorldPosition(new T.Vector3()).toArray() as Vec3,
      this.camera.getWorldDirection(new T.Vector3()).toArray() as Vec3,
      this.camera.up.toArray() as Vec3,
    );
    this.uiRenderer.draw();
    if (this.playing && !this.paused && this.document) {
      this.fixed.discard(Math.max(0, this.accumulator + dt - 0.1), this);
      this.accumulator = Math.min(this.accumulator + dt, 0.1);
      while (this.accumulator >= 1 / 60 && !this.paused) {
        this.fixed.run(this);
        this.accumulator -= 1 / 60;
        this.steps++;
      }
      if (!this.paused)
        for (const [id, b] of this.behaviors)
          if (!this.fixed.pendingDestroy.has(id)) b.update?.(dt);
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
    let visible = 0,
      shadowVisibilityChanged = false;
    if (this.document)
      for (const e of this.document.entities) {
        const object = this.objects.get(e.id);
        if (!object) continue;
        object.getWorldPosition(this.follow);
        const previousVisibility = object.visible;
        object.visible =
          e.enabled &&
          !this.collected.has(e.id) &&
          !(this.playing && this.cameraRig === "first-person" && e.tag === "player") &&
          this.follow.distanceToSquared(this.camera.position) <
            (this.settings.viewDistance + Math.max(...e.transform.scale) * 2) ** 2;
        if (previousVisibility !== object.visible) shadowVisibilityChanged = true;
        if (object.visible) visible++;
      }
    for (const [key, material] of this.materials)
      if (
        key.startsWith("shader:") &&
        material instanceof T.ShaderMaterial &&
        material.uniforms.uTime
      )
        material.uniforms.uTime.value += dt;
    if (shadowVisibilityChanged || (this.playing && !this.paused)) this.invalidateShadows(false);
    this.shadowFitFrame++;
    this.renderer.info.reset();
    try {
      if (this.effects) this.effects.draw(dt);
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
        graphics: this.graphics.snapshot,
        fps: this.frames / this.elapsed,
        frameMs: performance.now() - start,
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        visible,
        entities: this.objects.size,
        bodies: this.physics.bodies.size,
        adapter: this.adapter,
        assetAccountedBytes: assetMemory.snapshot.used,
        assetPeakAccountedBytes: assetMemory.snapshot.peak,
        width: this.bufferSize.x,
        height: this.bufferSize.y,
      });
      this.frames = 0;
      this.elapsed = 0;
      this.hudClock = 0;
    }
  };
  private clear(keepPersistent = false) {
    this.audio.reset(keepPersistent);
    this.behaviorBuilder = undefined;
    for (const b of this.behaviors.values()) {
      try {
        b.dispose?.();
      } catch (error) {
        this.events.emit("error", "Behavior cleanup failed", { error: String(error) });
      }
    }
    this.behaviors.clear();
    this.fixed.clear();
    disposeWorld(this.liveWorld());
    this.runtimeSurfaces.clear();
    this.runtimePost = undefined;
  }
  dispose() {
    this.shaderEpoch.abort();
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
    void this.audio.dispose();
    this.uiRenderer.dispose();
    this.ui.dispose();
    this.shadowAllocation?.release();
    this.sun.shadow.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
