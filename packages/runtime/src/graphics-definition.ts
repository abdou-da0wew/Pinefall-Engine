import { parseShaderAsset, type ShaderAsset } from "./shader-definition";
export interface Surface {
  family: "pbr" | "unlit";
  color: string;
  roughness: number;
  metalness: number;
  emissive: string;
  emissiveIntensity: number;
  opacity: number;
  alphaMode: "opaque" | "mask" | "blend";
  alphaCutoff: number;
  doubleSided: boolean;
}
export interface MaterialAsset extends Surface {
  id: string;
  name: string;
}
export interface ScatteringSettings {
  density: number;
  heightFalloff: number;
  baseHeight: number;
  maxDistance: number;
  steps: 8 | 16 | 32;
  color: string;
  intensity: number;
  anisotropy: number;
}
export const DEFAULT_SCATTERING: ScatteringSettings = {
  density: 0.03,
  heightFalloff: 0.1,
  baseHeight: 0,
  maxDistance: 100,
  steps: 16,
  color: "#bfd4ef",
  intensity: 1,
  anisotropy: 0,
};
export function parseScattering(value: unknown): ScatteringSettings {
  const v = object(value);
  if (
    Object.keys(v).some((k) => !Object.hasOwn(DEFAULT_SCATTERING, k)) ||
    ![8, 16, 32].includes(Number(v.steps)) ||
    typeof v.steps !== "number"
  )
    throw Error("Invalid scattering settings");
  return {
    density: bounded(v.density, 0, 0.5),
    heightFalloff: bounded(v.heightFalloff, 0, 2),
    baseHeight: bounded(v.baseHeight, -100, 100),
    maxDistance: bounded(v.maxDistance, 1, 200),
    steps: v.steps as 8 | 16 | 32,
    color: color(v.color),
    intensity: bounded(v.intensity, 0, 8),
    anisotropy: bounded(v.anisotropy, -0.8, 0.8),
  };
}
export interface PostSettings {
  scattering?: ScatteringSettings;
  enabled: boolean;
  bloom: boolean;
  threshold: number;
  strength: number;
  radius: number;
  exposure: number;
  toneMapping: "aces" | "neutral" | "reinhard" | "none";
  contrast: number;
  saturation: number;
  vignette: number;
  grain: number;
  chromaticAberration: number;
  fxaa: boolean;
}
export interface EnvironmentLighting {
  sky: string;
  ground: string;
  intensity: number;
  resolution: 128 | 256;
}
export function parseEnvironment(value: unknown): EnvironmentLighting {
  const v = object(value);
  if (
    Object.keys(v).some((k) => !["sky", "ground", "intensity", "resolution"].includes(k)) ||
    ![128, 256].includes(Number(v.resolution)) ||
    typeof v.resolution !== "number"
  )
    throw Error("Invalid environment lighting");
  return {
    sky: color(v.sky),
    ground: color(v.ground),
    intensity: bounded(v.intensity, 0, 8),
    resolution: v.resolution as 128 | 256,
  };
}
export interface GraphicsDefinition {
  environment?: EnvironmentLighting;
  shaders?: ShaderAsset[];
  version: 1;
  materials: MaterialAsset[];
  post?: PostSettings;
}
export const DEFAULT_SURFACE: Surface = {
  family: "pbr",
  color: "#90aa96",
  roughness: 0.8,
  metalness: 0,
  emissive: "#000000",
  emissiveIntensity: 0,
  opacity: 1,
  alphaMode: "opaque",
  alphaCutoff: 0.5,
  doubleSided: false,
};
export const DEFAULT_POST: PostSettings = {
  enabled: false,
  bloom: false,
  threshold: 1,
  strength: 0.3,
  radius: 0.3,
  exposure: 1,
  toneMapping: "aces",
  contrast: 1,
  saturation: 1,
  vignette: 0,
  grain: 0,
  chromaticAberration: 0,
  fxaa: false,
};
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid graphics object");
  return value as Record<string, unknown>;
}
export function bounded(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw Error("Graphics value outside supported range");
  return value;
}
export function choice<T extends string>(value: unknown, options: readonly T[]): T {
  if (typeof value !== "string" || !options.includes(value as T))
    throw Error("Unsupported graphics option");
  return value as T;
}
function bool(value: unknown) {
  if (typeof value !== "boolean") throw Error("Invalid graphics boolean");
  return value;
}
function color(value: unknown) {
  if (typeof value !== "string" || !/^#[a-f\d]{6}$/i.test(value))
    throw Error("Invalid graphics colour");
  return value;
}
function text(value: unknown) {
  if (typeof value !== "string" || !value.length || value.length > 100)
    throw Error("Invalid graphics identifier/name");
  return value;
}
export function parseSurface(value: unknown): Surface {
  const v = object(value);
  for (const key of Object.keys(v))
    if (!Object.hasOwn(DEFAULT_SURFACE, key) && key !== "id" && key !== "name")
      throw Error("Unsupported material field: " + key);
  return {
    family: choice(v.family, ["pbr", "unlit"]),
    color: color(v.color),
    roughness: bounded(v.roughness, 0, 1),
    metalness: bounded(v.metalness, 0, 1),
    emissive: color(v.emissive),
    emissiveIntensity: bounded(v.emissiveIntensity, 0, 100),
    opacity: bounded(v.opacity, 0, 1),
    alphaMode: choice(v.alphaMode, ["opaque", "mask", "blend"]),
    alphaCutoff: bounded(v.alphaCutoff, 0, 1),
    doubleSided: bool(v.doubleSided),
  };
}
export function parsePost(value: unknown): PostSettings {
  const v = object(value);
  for (const key of Object.keys(v))
    if (!Object.hasOwn(DEFAULT_POST, key) && key !== "scattering")
      throw Error("Unknown post-processing field: " + key);
  return {
    ...(v.scattering === undefined ? {} : { scattering: parseScattering(v.scattering) }),
    enabled: bool(v.enabled),
    bloom: bool(v.bloom),
    threshold: bounded(v.threshold, 0, 10),
    strength: bounded(v.strength, 0, 3),
    radius: bounded(v.radius, 0, 1),
    exposure: bounded(v.exposure, 0.05, 8),
    toneMapping: choice(v.toneMapping, ["aces", "neutral", "reinhard", "none"]),
    contrast: bounded(v.contrast, 0, 2),
    saturation: bounded(v.saturation, 0, 2),
    vignette: bounded(v.vignette, 0, 1),
    grain: bounded(v.grain, 0, 0.2),
    chromaticAberration: bounded(v.chromaticAberration, 0, 0.01),
    fxaa: bool(v.fxaa),
  };
}
export function parseGraphicsDefinition(value: unknown): GraphicsDefinition {
  const v = object(value);
  if (
    v.version !== 1 ||
    !Array.isArray(v.materials) ||
    v.materials.length > 64 ||
    Object.keys(v).some(
      (k) => !["version", "materials", "post", "shaders", "environment"].includes(k),
    )
  )
    throw Error("Invalid graphics schema/version/budget");
  const materials = v.materials.map((raw) => {
    const m = object(raw);
    return { ...parseSurface(m), id: text(m.id), name: text(m.name) };
  });
  if (new Set(materials.map((m) => m.id)).size !== materials.length)
    throw Error("Duplicate material IDs");
  let shaders: ShaderAsset[] | undefined;
  if (v.shaders !== undefined) {
    if (!Array.isArray(v.shaders) || v.shaders.length > 16) throw Error("Shader asset budget");
    shaders = v.shaders.map(parseShaderAsset);
    if (new Set(shaders.map((s) => s.id)).size !== shaders.length)
      throw Error("Duplicate shader IDs");
  }
  return {
    version: 1,
    materials,
    ...(v.environment === undefined ? {} : { environment: parseEnvironment(v.environment) }),
    ...(v.post === undefined ? {} : { post: parsePost(v.post) }),
    ...(shaders ? { shaders } : {}),
  };
}
export function emptyGraphics(): GraphicsDefinition {
  return { version: 1, materials: [] };
}
export interface LightDefinition {
  shadowUpdate?: "every-frame" | "on-change" | "manual";
  shadowFrustum?: "fixed" | "scene";
  shadowPadding?: number;
  type: "point" | "spot" | "directional";
  color: string;
  intensity: number;
  range: number;
  angle?: number;
  penumbra?: number;
  decay?: number;
  castShadow?: boolean;
  shadowSize?: 512 | 1024 | 2048;
  bias?: number;
  normalBias?: number;
}
export function parseLight(value: unknown): LightDefinition {
  const v = object(value);
  for (const key of Object.keys(v))
    if (
      ![
        "type",
        "color",
        "intensity",
        "range",
        "angle",
        "penumbra",
        "decay",
        "castShadow",
        "shadowSize",
        "bias",
        "normalBias",
        "shadowUpdate",
        "shadowFrustum",
        "shadowPadding",
      ].includes(key)
    )
      throw Error("Unsupported light field: " + key);
  const result: LightDefinition = {
    type: choice(v.type, ["point", "spot", "directional"]),
    color: color(v.color),
    intensity: bounded(v.intensity, 0, 200),
    range: bounded(v.range, 1, 100),
  };
  if (v.shadowUpdate !== undefined)
    result.shadowUpdate = choice(v.shadowUpdate, ["every-frame", "on-change", "manual"] as const);
  if (v.shadowFrustum !== undefined)
    result.shadowFrustum = choice(v.shadowFrustum, ["fixed", "scene"] as const);
  if (v.shadowPadding !== undefined) result.shadowPadding = bounded(v.shadowPadding, 0, 100);
  if (v.angle !== undefined) result.angle = bounded(v.angle, 1, 89);
  if (v.penumbra !== undefined) result.penumbra = bounded(v.penumbra, 0, 1);
  if (v.decay !== undefined) result.decay = bounded(v.decay, 0, 2);
  if (v.castShadow !== undefined) result.castShadow = bool(v.castShadow);
  if (v.shadowSize !== undefined) {
    if (![512, 1024, 2048].includes(Number(v.shadowSize)) || typeof v.shadowSize !== "number")
      throw Error("Invalid shadow map size");
    result.shadowSize = v.shadowSize as 512 | 1024 | 2048;
  }
  if (v.bias !== undefined) result.bias = bounded(v.bias, -0.01, 0.01);
  if (v.normalBias !== undefined) result.normalBias = bounded(v.normalBias, 0, 1);
  return result;
}
