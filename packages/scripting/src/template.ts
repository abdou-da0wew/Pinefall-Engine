export const SCRIPT_TEMPLATE = `import { Script, MathUtils } from '@pinefall/sdk';
import type { ScriptContext } from '@pinefall/sdk';

// Editable per-instance overrides live in the object's Script properties.
export const defaults = { speed: 1.5 };

export default class Rotate extends Script {
  constructor(ctx: ScriptContext) { super(ctx); }

  start() {
    this.ctx.log('Attached to ' + this.ctx.entity.name);
  }

  update(dt: number) {
    const speed = Number(this.ctx.props.speed ?? 1.5);
    this.ctx.object.rotation.y += MathUtils.clamp(speed, -10, 10) * dt;
  }

  // fixedUpdate(dt: number) { /* physics / deterministic gameplay */ }
  // trigger(other: Entity, started: boolean) { /* collider entry/exit */ }
  // dispose() { /* release resources when Play stops */ }
}
`;

export function uniqueScriptName(names: readonly string[]): string {
  const taken = new Set(names.map((name) => name.toLowerCase()));
  for (let index = 1; index <= names.length + 1; index++) {
    const name = `CustomScript${index === 1 ? "" : index}.ts`;
    if (!taken.has(name.toLowerCase())) return name;
  }
  throw Error("Script name allocation failed");
}
