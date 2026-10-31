export type Vec3 = [number, number, number];
export type Template = "adventure" | "first-person" | "driving" | "sandbox";
export type Primitive = "box" | "sphere" | "capsule" | "cylinder" | "cone" | "asset";
export interface Entity {
  id: string;
  name: string;
  enabled: boolean;
  parent?: string;
  transform: { position: Vec3; rotation: Vec3; scale: Vec3 };
  mesh?: { primitive: Primitive; color: string; asset?: string };
  physics?: {
    type: "fixed" | "dynamic" | "kinematic";
    shape: "box" | "sphere" | "capsule";
    mass: number;
    friction: number;
    restitution: number;
    sensor: boolean;
  };
  light?: { type: "point" | "spot"; color: string; intensity: number; range: number };
  behavior?: string;
  tag?: string;
}
export interface Asset {
  id: string;
  name: string;
  data: string;
}
export interface SceneDocument {
  version: 1;
  name: string;
  template: Template;
  entities: Entity[];
  assets: Asset[];
  environment: {
    background: string;
    fog: string;
    fogNear: number;
    fogFar: number;
    sun: number;
    gravity: number;
  };
}
export interface RenderSettings {
  preset: "low" | "high";
  post: boolean;
  glow: boolean;
  threshold: number;
  strength: number;
  exposure: number;
  volumetrics: boolean;
  beamOpacity: number;
  viewDistance: number;
}
export const LOW: RenderSettings = {
  preset: "low",
  post: false,
  glow: false,
  threshold: 0.75,
  strength: 0.15,
  exposure: 1,
  volumetrics: false,
  beamOpacity: 0.09,
  viewDistance: 85,
};
export const HIGH: RenderSettings = {
  preset: "high",
  post: true,
  glow: true,
  threshold: 0.7,
  strength: 0.18,
  exposure: 1.05,
  volumetrics: true,
  beamOpacity: 0.09,
  viewDistance: 150,
};
export function entity(
  name: string,
  primitive: Primitive = "box",
  position: Vec3 = [0, 1, 0],
  scale: Vec3 = [1, 1, 1],
  color = "#90aa96",
): Entity {
  return {
    id: crypto.randomUUID(),
    name,
    enabled: true,
    transform: { position, rotation: [0, 0, 0], scale },
    mesh: { primitive, color },
  };
}
export function cloneScene(scene: SceneDocument): SceneDocument {
  return structuredClone(scene);
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
function fail(message: string): never {
  throw new Error("Invalid scene: " + message);
}
function text(v: unknown, label: string, max = 100): string {
  if (typeof v !== "string" || !v.length || v.length > max) fail(label);
  return v;
}
function number(v: unknown, label: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) fail(label);
  return v;
}
function color(v: unknown): string {
  if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v)) fail("color");
  return v;
}
function vector(v: unknown, scale = false): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) fail("vector");
  return [
    number(v[0], "vector", scale ? 0.05 : -1000, scale ? 100 : 1000),
    number(v[1], "vector", scale ? 0.05 : -1000, scale ? 100 : 1000),
    number(v[2], "vector", scale ? 0.05 : -1000, scale ? 100 : 1000),
  ];
}
function oneOf<T extends string>(v: unknown, options: readonly T[]): T {
  if (typeof v !== "string" || !options.includes(v as T)) fail("enum");
  return v as T;
}
export function parseScene(value: unknown): SceneDocument {
  if (
    !record(value) ||
    value.version !== 1 ||
    !Array.isArray(value.entities) ||
    value.entities.length > 500 ||
    !Array.isArray(value.assets) ||
    value.assets.length > 16 ||
    !record(value.environment)
  )
    fail("root/version/limits");
  const assets: Asset[] = value.assets.map((a) => {
    if (!record(a)) fail("asset");
    const data = text(a.data, "asset data", 3_000_000);
    if (!/^data:model\/gltf-binary;base64,[A-Za-z0-9+/=]+$/.test(data)) fail("embedded GLB only");
    return { id: text(a.id, "asset ID"), name: text(a.name, "asset name"), data };
  });
  if (assets.reduce((s, a) => s + a.data.length, 0) > 8_000_000) fail("asset budget");
  const entities: Entity[] = value.entities.map((e) => {
    if (!record(e) || !record(e.transform) || typeof e.enabled !== "boolean") fail("entity");
    const out: Entity = {
      id: text(e.id, "ID"),
      name: text(e.name, "name"),
      enabled: e.enabled,
      transform: {
        position: vector(e.transform.position),
        rotation: vector(e.transform.rotation),
        scale: vector(e.transform.scale, true),
      },
    };
    if (e.parent !== undefined) out.parent = text(e.parent, "parent");
    if (e.tag !== undefined) out.tag = text(e.tag, "tag");
    if (e.behavior !== undefined) out.behavior = text(e.behavior, "behavior");
    if (e.mesh !== undefined) {
      if (!record(e.mesh)) fail("mesh");
      out.mesh = {
        primitive: oneOf(e.mesh.primitive, [
          "box",
          "sphere",
          "capsule",
          "cylinder",
          "cone",
          "asset",
        ]),
        color: color(e.mesh.color),
      };
      if (e.mesh.asset !== undefined) out.mesh.asset = text(e.mesh.asset, "asset reference");
      if (out.mesh.primitive === "asset" && !assets.some((a) => a.id === out.mesh?.asset))
        fail("missing asset");
    }
    if (e.physics !== undefined) {
      if (!record(e.physics) || typeof e.physics.sensor !== "boolean" || out.parent)
        fail("physics requires root entity");
      out.physics = {
        type: oneOf(e.physics.type, ["fixed", "dynamic", "kinematic"]),
        shape: oneOf(e.physics.shape, ["box", "sphere", "capsule"]),
        mass: number(e.physics.mass, "mass", 0.01, 10000),
        friction: number(e.physics.friction, "friction", 0, 2),
        restitution: number(e.physics.restitution, "restitution", 0, 1),
        sensor: e.physics.sensor,
      };
    }
    if (e.light !== undefined) {
      if (!record(e.light)) fail("light");
      out.light = {
        type: oneOf(e.light.type, ["point", "spot"]),
        color: color(e.light.color),
        intensity: number(e.light.intensity, "intensity", 0, 200),
        range: number(e.light.range, "range", 1, 100),
      };
    }
    return out;
  });
  const ids = new Set(entities.map((e) => e.id));
  if (ids.size !== entities.length) fail("duplicate IDs");
  if (new Set(assets.map((a) => a.id)).size !== assets.length) fail("duplicate assets");
  if (entities.filter((e) => e.light).length > 8) fail("maximum eight lights");
  for (const e of entities) {
    const seen = new Set([e.id]);
    let p = e.parent;
    while (p) {
      if (!ids.has(p) || seen.has(p)) fail("missing/cyclic parent");
      seen.add(p);
      p = entities.find((n) => n.id === p)?.parent;
    }
  }
  const env = value.environment;
  return {
    version: 1,
    name: text(value.name, "scene name"),
    template: oneOf(value.template, ["adventure", "first-person", "driving", "sandbox"]),
    entities,
    assets,
    environment: {
      background: color(env.background),
      fog: color(env.fog),
      fogNear: number(env.fogNear, "fog near", 0, 200),
      fogFar: number(env.fogFar, "fog far", 10, 500),
      sun: number(env.sun, "sun", 0, 5),
      gravity: number(env.gravity, "gravity", -30, 0),
    },
  };
}
export function serializeScene(scene: SceneDocument) {
  return JSON.stringify(parseScene(scene), null, 2);
}
