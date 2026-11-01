import type { RenderSettings } from "./schema";
import type { Surface, LightDefinition, PostSettings } from "./graphics-definition";
export interface GraphicsSnapshot {
  available: boolean;
  adapter: string;
  backend: "webgl2" | "headless";
  hdr: boolean;
  requested: PostSettings;
  effective: PostSettings;
  postTargetBytes: number;
  shadowTargetBytes: number;
  shadowViews: number;
  reasons: string[];
  contextLost: boolean;
}
export interface GraphicsAPI {
  compileShader(
    entityId: string,
    source: import("./shader-definition").ShaderSource,
    signal?: AbortSignal,
  ): Promise<void>;
  setUniform(
    entityId: string,
    name: string,
    value: import("./shader-definition").UniformValue,
  ): void;
  readonly snapshot: GraphicsSnapshot;
  setPost(patch: Partial<PostSettings>): void;
  setPreview(
    patch: Partial<Pick<RenderSettings, "preset" | "renderScale" | "shadows" | "viewDistance">>,
  ): void;
  setMaterial(entityId: string, patch: Partial<Surface>): void;
  setLight(entityId: string, patch: Partial<LightDefinition>): void;
  invalidateShadows(): void;
}
