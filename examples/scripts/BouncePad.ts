import { Script } from "@pinefall/sdk";
import type { Entity } from "@pinefall/sdk";
export const defaults = { height: 3 };
export default class BouncePad extends Script {
  trigger(other: Entity, started: boolean) {
    if (!started || other.tag !== "player") return;
    const target = this.ctx.objectFor(other.id);
    if (!target) return;
    this.ctx.teleport(
      [target.position.x, target.position.y + Number(this.ctx.props.height), target.position.z],
      other.id,
    );
    this.ctx.emit("bounce", { player: other.id });
  }
}
