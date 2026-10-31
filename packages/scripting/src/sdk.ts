import type { Behavior, SimulationHost } from "../../runtime/src/behaviors";
import type { Entity, ScriptValue, Vec3 } from "../../runtime/src/schema";
import type { EngineEvent } from "../../runtime/src/events";
import type { Group, Vector3 } from "three";
export { Vector2, Vector3, Quaternion, Euler, Color, MathUtils } from "three";
export { entity, cloneScene, parseScene } from "../../runtime/src/schema";
export { RAPIER } from "../../runtime/src/physics";
export type { Entity, Vec3, SceneDocument, ScriptValue } from "../../runtime/src/schema";
export type { Behavior, SimulationHost } from "../../runtime/src/behaviors";
export interface ScriptContext {
  readonly engine: SimulationHost;
  readonly entity: Entity;
  readonly object: Group;
  readonly props: Record<string, ScriptValue>;
  readonly state: Record<string, unknown>;
  readonly input: Set<string>;
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
