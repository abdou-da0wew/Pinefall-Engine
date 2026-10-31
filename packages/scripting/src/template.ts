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
