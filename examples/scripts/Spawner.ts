import { Script, entity } from "@pinefall/sdk";
export const defaults = { interval: 2, maxCrates: 8 };
export default class Spawner extends Script {
  private next = 0;
  private spawned: string[] = [];
  fixedUpdate() {
    if (this.ctx.time.elapsed < this.next) return;
    this.next = this.ctx.time.elapsed + Math.max(0.2, Number(this.ctx.props.interval));
    const p = this.ctx.object.position;
    const box = entity("Scripted crate", "box", [p.x, p.y + 4, p.z]);
    box.physics = {
      type: "dynamic",
      shape: "box",
      mass: 1,
      friction: 0.6,
      restitution: 0.3,
      sensor: false,
    };
    this.spawned.push(this.ctx.spawn(box).id);
    if (this.spawned.length > Math.max(1, Number(this.ctx.props.maxCrates)))
      this.ctx.destroy(this.spawned.shift()!);
  }
}
