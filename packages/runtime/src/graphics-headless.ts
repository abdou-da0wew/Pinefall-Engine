import { parseShader } from "./shader-definition";
import {
  DEFAULT_POST,
  DEFAULT_SURFACE,
  parsePost,
  parseSurface,
  parseLight,
  bounded,
  choice,
} from "./graphics-definition";
import type { PostSettings, Surface } from "./graphics-definition";
import type { GraphicsAPI, GraphicsSnapshot } from "./graphics-api";
import type { SceneDocument } from "./schema";
/** Validates script intent without allocating a renderer or modifying authored data. */
export function headlessGraphics(scene: () => SceneDocument): GraphicsAPI {
  let post: PostSettings | undefined;
  const materials = new Map<string, Surface>();
  const lights = new Map<string, ReturnType<typeof parseLight>>();
  return {
    async compileShader(id, source) {
      parseShader(source);
      if (!scene().entities.some((e) => e.id === id)) throw Error("Shader target missing");
      throw Error("Headless runtime cannot compile GPU shaders");
    },
    setUniform() {
      throw Error("Headless runtime has no compiled GPU shader");
    },
    get snapshot(): GraphicsSnapshot {
      const requested = post ?? scene().graphics?.post ?? DEFAULT_POST;
      return {
        available: false,
        backend: "headless",
        adapter: "No renderer",
        hdr: false,
        requested: structuredClone(requested),
        effective: {
          ...requested,
          enabled: false,
          bloom: false,
          fxaa: false,
          scattering: undefined,
        },
        postTargetBytes: 0,
        shadowTargetBytes: 0,
        environmentTargetBytes: 0,
        shadowViews: 0,
        reasons: ["Headless simulation: graphics intents validated; no pixels rendered."],
        contextLost: false,
      };
    },
    setPost(patch) {
      post = parsePost({ ...(post ?? scene().graphics?.post ?? DEFAULT_POST), ...patch });
    },
    setPreview(patch) {
      if (
        Object.keys(patch).some(
          (k) => !["preset", "renderScale", "shadows", "viewDistance"].includes(k),
        )
      )
        throw Error("Unsupported preview setting");
      if (patch.preset !== undefined) choice(patch.preset, ["low", "high"]);
      if (patch.renderScale !== undefined) bounded(patch.renderScale, 0.25, 1);
      if (patch.viewDistance !== undefined) bounded(patch.viewDistance, 1, 500);
      if (patch.shadows !== undefined && typeof patch.shadows !== "boolean")
        throw Error("Invalid shadow flag");
    },
    setMaterial(id, patch) {
      const ids = new Set(scene().entities.map((e) => e.id));
      for (const key of materials.keys()) if (!ids.has(key)) materials.delete(key);
      const e = scene().entities.find((e) => e.id === id);
      if (!e?.mesh) throw Error("Material target missing");
      const base = materials.get(id) ??
        e.mesh.surface ??
        scene().graphics?.materials.find((m) => m.id === e.mesh?.material) ?? {
          ...DEFAULT_SURFACE,
          color: e.mesh.color,
        };
      materials.set(id, parseSurface({ ...base, ...patch }));
    },
    setLight(id, patch) {
      const e = scene().entities.find((e) => e.id === id);
      if (!e?.light) throw Error("Light target missing");
      for (const key of lights.keys())
        if (!scene().entities.some((e) => e.id === key)) lights.delete(key);
      const next = parseLight({ ...(lights.get(id) ?? e.light), ...patch });
      if (next.type !== e.light.type)
        throw Error("Changing runtime light type requires an authored scene edit");
      lights.set(id, next);
    },
    invalidateShadows() {},
  };
}
