import { Vector3 } from "three";
import type { Entity } from "./schema";
import type { SimulationHost } from "./behaviors";
import type { GraphEvent } from "../../animation/src/graph";
/** Structural ownership is committed at the next fixed boundary, never while traversing callbacks. */
export class FixedSimulation {
  readonly pendingDestroy = new Set<string>();
  readonly pendingSpawns = new Map<string, Entity>();
  readonly trace: string[] = [];
  private commands: { ids: string[]; apply: () => void; spawn?: string }[] = [];
  private running = false;
  ticks = 0;
  inputSnapshot: ReadonlySet<string> = new Set();
  discardedSeconds = 0;
  private lastDiscardTick = -60;
  discard(seconds: number, host: SimulationHost) {
    if (seconds <= 0) return;
    this.discardedSeconds += seconds;
    if (this.ticks - this.lastDiscardTick >= 60) {
      this.lastDiscardTick = this.ticks;
      host.events.emit("warning", "Simulation catch-up bounded", {
        discardedSeconds: this.discardedSeconds,
      });
    }
  }

  private admit() {
    if (this.commands.length >= 512) throw Error("Structural command budget exceeded");
  }
  spawn(entity: Entity, apply: (entity: Entity) => void) {
    this.admit();
    const copy = structuredClone(entity);
    this.pendingSpawns.set(copy.id, copy);
    this.commands.push({ ids: [], spawn: copy.id, apply: () => apply(copy) });
  }
  destroy(ids: string[], apply: () => void) {
    const fresh = ids.filter((id) => !this.pendingDestroy.has(id));
    if (!fresh.length) return;
    this.admit();
    for (const id of fresh) this.pendingDestroy.add(id);
    this.commands.push({ ids: fresh, apply });
  }
  clear() {
    this.commands = [];
    this.pendingDestroy.clear();
    this.pendingSpawns.clear();
    this.trace.length = 0;
    this.ticks = 0;
    this.inputSnapshot = new Set();
    this.discardedSeconds = 0;
    this.lastDiscardTick = -60;
  }
  run(host: SimulationHost) {
    if (this.running) throw Error("Reentrant simulation tick");
    this.running = true;
    this.trace.length = 0;
    try {
      this.trace.push("admit");
      const commands = this.commands;
      this.commands = [];
      for (const command of commands) {
        try {
          if (command.spawn) {
            this.pendingSpawns.delete(command.spawn);
            if (this.pendingDestroy.has(command.spawn)) continue;
          }
          command.apply();
        } catch (error) {
          host.events.emit("error", "Structural command rejected", { error: String(error) });
        } finally {
          for (const id of command.ids) this.pendingDestroy.delete(id);
        }
      }
      const entities = [...host.document.entities].sort((a, b) =>
          a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
        ),
        active = (id: string) => !this.pendingDestroy.has(id);
      this.inputSnapshot = new Set(host.input);
      host.physics.beginMotion();
      host.audio.setTime(this.ticks / 60);
      this.trace.push("fixed");
      for (const entity of entities)
        if (entity.enabled && active(entity.id))
          host.behaviors.get(entity.id)?.fixedUpdate?.(1 / 60);
      this.trace.push("animation");
      const pending: { id: string; event: GraphEvent }[] = [];
      for (const entity of entities) {
        const animator = host.animators.get(entity.id);
        if (!animator || !entity.enabled || !active(entity.id)) continue;
        try {
          if (animator.rootMotion)
            host.physics.proposeRoot(entity.id, { x: 0, z: 0, yaw: 0 }, entity.transform.scale[0]);
          const result = animator.advance(1 / 60);
          if (result.rootDelta)
            host.physics.proposeRoot(entity.id, result.rootDelta, entity.transform.scale[0]);
          if (result.overflow)
            host.events.emit("error", "Animation marker overflow", { entity: entity.id });
          for (const event of result.events) pending.push({ id: entity.id, event });
        } catch (error) {
          animator.graph.paused = true;
          host.events.emit("error", "Animator disabled", {
            entity: entity.id,
            error: String(error),
          });
        }
      }
      this.trace.push("physics");
      host.physics.resolveMotion(active);
      const contacts: { a: string; b: string; started: boolean }[] = [];
      let overflow = false;
      host.physics.step((x, y, started) => {
        if (contacts.length >= 4096) {
          overflow = true;
          return;
        }
        const [a, b] = x < y ? [x, y] : [y, x];
        contacts.push({ a, b, started });
      });
      this.trace.push("sync");
      for (const [id, body] of host.physics.bodies) {
        const node = host.objects.get(id);
        if (!node) continue;
        const p = body.translation(),
          q = body.rotation();
        node.position.set(p.x, p.y, p.z);
        node.quaternion.set(q.x, q.y, q.z, q.w);
      }
      if (overflow) {
        this.ticks++;
        host.paused = true;
        host.events.emit("error", "Physics event budget exceeded; simulation paused");
        return;
      }
      this.trace.push("physics-events");
      contacts.sort((x, y) =>
        x.a < y.a
          ? -1
          : x.a > y.a
            ? 1
            : x.b < y.b
              ? -1
              : x.b > y.b
                ? 1
                : Number(x.started) - Number(y.started),
      );
      const byId = new Map(entities.map((entity) => [entity.id, entity]));
      for (const { a, b, started } of contacts) {
        const ea = byId.get(a),
          eb = byId.get(b);
        if (!ea || !eb || !active(a) || !active(b)) continue;
        host.behaviors.get(a)?.trigger?.(eb, started);
        if (active(a) && active(b)) host.behaviors.get(b)?.trigger?.(ea, started);
      }
      this.trace.push("animation-events");
      for (const { id, event } of pending) {
        const animator = host.animators.get(id);
        if (!active(id) || !animator || animator.graph.activation !== event.activation) continue;
        host.audio.setEventOffset(event.offset);
        const cue = byId.get(id)?.audioCues?.[event.id],
          node = host.objects.get(id);
        if (cue)
          host.audio.play(
            cue,
            id,
            node?.getWorldPosition(new Vector3()).toArray() as [number, number, number] | undefined,
          );
        host.events.emit("animation", event.id, {
          entity: id,
          state: event.state,
          clip: event.clip,
          activation: event.activation,
          loop: event.loop,
          kind: event.kind,
          offset: event.offset,
          tick: this.ticks,
        });
        host.audio.setEventOffset(0);
      }
      this.ticks++;
    } finally {
      host.physics.endMotion();
      this.running = false;
    }
  }
}
