export type { InputOptions } from "../../runtime/src/input-options";
export { DEFAULT_INPUT_OPTIONS } from "../../runtime/src/input-options";
export type { GraphicsImage, TextureBinding, MapRole } from "../../runtime/src/image-definition";
export { textureBinding, MAP_ROLES } from "../../runtime/src/image-definition";
export type {
  MaterialSlotBinding,
  MaterialSlotInfo,
  UVInspection,
} from "../../runtime/src/material-slots";
export type { GraphicsAPI, GraphicsSnapshot } from "../../runtime/src/graphics-api";
export type {
  ScatteringSettings,
  EnvironmentLighting,
  Surface,
  MaterialAsset,
  LightDefinition,
  PostSettings,
  GraphicsDefinition,
} from "../../runtime/src/graphics-definition";
export {
  DEFAULT_SURFACE,
  DEFAULT_POST,
  DEFAULT_SCATTERING,
  emptyGraphics,
} from "../../runtime/src/graphics-definition";
import type { UIAPI } from "../../ui/src/store";
export { createUIElement, emptyUI } from "../../ui/src/schema";
export type { UIElement, UIDocument, UIKind, UIStyle } from "../../ui/src/schema";
export type { UIAPI, UIEvent, UIEventType } from "../../ui/src/store";
import type { Behavior, SimulationHost } from "../../runtime/src/behaviors";
import type { Entity, ScriptValue, Vec3 } from "../../runtime/src/schema";
import type { EngineEvent } from "../../runtime/src/events";
import type { Group, Vector3 } from "three";
export { Vector2, Vector3, Quaternion, Euler, Color, MathUtils } from "three";
export { entity, cloneScene, parseScene } from "../../runtime/src/schema";
export { RAPIER } from "../../runtime/src/physics";
export type { Entity, Vec3, SceneDocument, ScriptValue } from "../../runtime/src/schema";
export type { Behavior, SimulationHost } from "../../runtime/src/behaviors";
export interface AnimationAPI {
  readonly snapshot: import("../../animation/src/graph").AnimationGraph["snapshot"] | undefined;
  setParameter(name: string, value: number | boolean): void;
  play(state: string): void;
  crossFade(state: string, seconds: number): void;
  onEvent(listener: (event: EngineEvent) => void): () => void;
}
export interface AudioAPI {
  seek(handle: import("../../audio/src/voices").VoiceHandle, seconds: number): void;
  play(cue: string): import("../../audio/src/voices").VoiceResult;
  stop(handle: import("../../audio/src/voices").VoiceHandle, fadeSeconds?: number): void;
  setBusGain(bus: import("../../audio/src/voices").Bus, db: number): void;
}
export interface ScriptContext {
  readonly graphics: import("../../runtime/src/graphics-api").GraphicsAPI;
  readonly audio: AudioAPI;
  readonly animation: AnimationAPI;
  readonly ui: UIAPI;
  readonly engine: SimulationHost;
  readonly entity: Entity;
  readonly object: Group;
  readonly props: Record<string, ScriptValue>;
  readonly state: Record<string, unknown>;
  readonly input: ReadonlySet<string>;
  readonly time: { elapsed: number; delta: number; fixedDelta: number; frame: number };
  number(name: string, fallback?: number): number;
  string(name: string, fallback?: string): string;
  boolean(name: string, fallback?: boolean): boolean;
  vector(name: string, fallback?: Vec3): Vector3;
  spawn(entity: Entity): Entity;
  destroy(id?: string): void;
  find(idOrName: string): Entity | undefined;
  findByTag(tag: string): Entity[];
  objectFor(id: string): Group | undefined;
  body(id?: string): ReturnType<SimulationHost["physics"]["bodies"]["get"]>;
  teleport(position: Vec3, id?: string): void;
  impulse(force: Vec3, id?: string): void;
  log(message: string): void;
  emit(name: string, data?: EngineEvent["data"]): void;
  onEvent(name: string, listener: (event: EngineEvent) => void): () => void;
}
/** Extend this class, or export a factory returning lifecycle hooks. */
export class Script {
  constructor(public readonly ctx: ScriptContext) {}
}
export type GameScriptFactory = (ctx: ScriptContext) => Behavior;

export type {
  ShaderSource,
  ShaderAsset,
  ShaderUniform,
  UniformValue,
} from "../../runtime/src/shader-definition";
export { DEFAULT_SHADER } from "../../runtime/src/shader-definition";
