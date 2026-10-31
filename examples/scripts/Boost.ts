import { Script, Vector3 } from "@pinefall/sdk";
// Attach alongside the built-in character controller; hold E for a forward dash.
export const defaults = { dashSpeed: 9 };
export default class Boost extends Script {
  fixedUpdate(dt: number) {
    if (!this.ctx.input.has("KeyE")) return;
    const direction = new Vector3(
      -Math.sin(this.ctx.engine.look.yaw),
      0,
      -Math.cos(this.ctx.engine.look.yaw),
    );
    const body = this.ctx.body();
    if (!body) return;
    // Extend the controller's already scheduled displacement, preserving wall collisions.
    const current = body.translation(),
      next = body.nextTranslation();
    this.ctx.engine.physics.move(this.ctx.entity.id, {
      x: next.x - current.x + direction.x * Number(this.ctx.props.dashSpeed) * dt,
      y: next.y - current.y,
      z: next.z - current.z + direction.z * Number(this.ctx.props.dashSpeed) * dt,
    });
  }
}
