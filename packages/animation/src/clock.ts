export interface Marker {
  id: string;
  time: number;
  kind: "gameplay" | "cosmetic";
  entry?: boolean;
  repeat?: boolean;
}
export interface MarkerEvent {
  id: string;
  kind: Marker["kind"];
  activation: number;
  loop: number;
  offset: number;
}
export interface ClockOptions {
  loop?: boolean;
  speed?: number;
  activation?: number;
  markers?: Marker[];
}
/** Simulation-owned cursor. Rendering/seek never dispatches gameplay events. */
export class ClipClock {
  readonly duration: number;
  readonly markers: readonly Marker[];
  readonly loop: boolean;
  readonly activation: number;
  private elapsed = 0;
  private seekSample: number | undefined;
  private compensation = 0;
  private delivered = new Map<string, number>();
  private entered = true;
  private rate: number;
  paused = false;
  fault: string | undefined;
  constructor(duration: number, options: ClockOptions = {}) {
    if (!Number.isFinite(duration) || duration < 0.001 || duration > 86400)
      throw Error("Invalid clip duration");
    this.duration = duration;
    if (options.loop !== undefined && typeof options.loop !== "boolean")
      throw Error("Invalid loop flag");
    this.loop = options.loop ?? true;
    this.activation = options.activation ?? 1;
    if (!Number.isSafeInteger(this.activation) || this.activation < 0)
      throw Error("Invalid activation");
    this.rate = 1;
    this.speed = options.speed ?? 1;
    const markers = structuredClone(options.markers || []);
    if (markers.length > 128) throw Error("Marker count budget");
    const ids = new Set<string>();
    for (const m of markers) {
      if (
        Object.keys(m).some((key) => !["id", "time", "kind", "entry", "repeat"].includes(key)) ||
        typeof m.id !== "string" ||
        !m.id ||
        m.id.length > 100 ||
        ids.has(m.id) ||
        !Number.isFinite(m.time) ||
        m.time < 0 ||
        m.time > duration ||
        !["gameplay", "cosmetic"].includes(m.kind) ||
        (m.entry !== undefined && typeof m.entry !== "boolean") ||
        (m.repeat !== undefined && typeof m.repeat !== "boolean") ||
        (m.entry && m.time !== 0)
      )
        throw Error("Invalid animation marker");
      ids.add(m.id);
      Object.freeze(m);
    }
    this.markers = Object.freeze(markers);
    if (this.rate < 0) {
      this.elapsed = duration;
      this.seekSample = duration;
    }
  }
  get speed() {
    return this.rate;
  }
  set speed(value: number) {
    if (!Number.isFinite(value) || Math.abs(value) > 8)
      throw Error("Animation speed outside -8..8");
    this.rate = value;
  }
  get time() {
    if (this.seekSample !== undefined) return this.seekSample;
    if (!this.loop) return Math.max(0, Math.min(this.duration, this.elapsed));
    return ((this.elapsed % this.duration) + this.duration) % this.duration;
  }
  get cursor() {
    return this.elapsed / this.duration;
  }
  get normalized() {
    return this.time / this.duration;
  }
  seek(time: number) {
    if (!Number.isFinite(time) || time < 0 || time > this.duration)
      throw Error("Invalid animation seek");
    this.elapsed = this.loop
      ? Math.floor(this.elapsed / this.duration) * this.duration + time
      : time;
    this.seekSample = time;
    this.compensation = 0;
    this.entered = false;
    this.fault = undefined;
  }
  advance(dt: number, timeScale = 1): { events: MarkerEvent[]; overflow: boolean } {
    if (!Number.isFinite(dt) || dt < 0 || dt > 3600) throw Error("Invalid animation delta");
    if (!Number.isFinite(timeScale) || timeScale <= 0 || timeScale > 86_400_000)
      throw Error("Invalid clock cadence");
    if (this.paused) return { events: [], overflow: false };
    const previous = this.elapsed;
    const increment = dt * timeScale * this.rate - this.compensation;
    let next = previous + increment;
    let compensation = next - previous - increment;
    if (Math.abs(next) > 1e12) throw Error("Animation cursor budget");
    if (!this.loop) {
      const clamped = Math.max(0, Math.min(this.duration, next));
      if (clamped !== next) compensation = 0;
      next = clamped;
    }
    const pending: { event: MarkerEvent; at: number; order: number }[] = [];
    const push = (m: Marker, loop: number, at: number, order: number) => {
      pending.push({
        event: {
          id: m.id,
          kind: m.kind,
          activation: this.activation,
          loop,
          offset: this.rate > 0 ? Math.max(0, (at - previous) / (this.rate * timeScale)) : 0,
        },
        at,
        order,
      });
    };
    if (this.rate >= 0) {
      for (let order = 0; order < this.markers.length; order++) {
        const m = this.markers[order];
        if (this.entered && m.entry) push(m, 0, previous, order);
        if (next <= previous) continue;
        let first = Math.max(
          Math.floor((previous - m.time) / this.duration) + 1,
          (this.delivered.get(m.id) ?? -Infinity) + 1,
        );
        if (!this.loop || m.repeat === false) first = Math.max(0, first);
        let last = Math.floor((next - m.time) / this.duration);
        if (!this.loop || m.repeat === false) last = Math.min(last, 0);
        if (m.time === 0 && m.repeat !== true) last = first - 1;
        const count = Math.max(0, last - first + 1);
        if (pending.length + count > 64) {
          this.paused = true;
          this.fault = "Animation marker overflow: tick not adopted";
          return { events: [], overflow: true };
        }
        for (; first <= last; first++) push(m, first, m.time + first * this.duration, order);
      }
    }
    if (pending.length > 64) {
      this.paused = true;
      this.fault = "Animation marker overflow: tick not adopted";
      return { events: [], overflow: true };
    }
    if (next !== previous) this.seekSample = undefined;
    this.elapsed = next;
    this.compensation = compensation;
    this.entered = false;
    pending.sort((a, b) => a.at - b.at || a.order - b.order);
    for (const item of pending) this.delivered.set(item.event.id, item.event.loop);
    return { events: pending.map((x) => x.event), overflow: false };
  }
}
