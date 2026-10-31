export type Bus = "effects" | "music" | "dialogue" | "ui";
export interface VoiceRequest {
  asset: string;
  persistent?: boolean;
  bus?: Bus;
  priority?: number;
  gainDb?: number;
  loop?: boolean;
  position?: [number, number, number] | null;
  refDistance?: number;
  maxDistance?: number;
  rolloff?: number;
  delay?: number;
}
export interface VoiceControl {
  stop(fadeSeconds: number): void;
  seek?(seconds: number): void;
  setPaused?(paused: boolean): void;
  setPosition?(position: [number, number, number]): void;
}
export interface VoiceBackend {
  readonly rendered: boolean;
  readonly ready: boolean;
  duration(id: string): number | undefined;
  start(request: Required<VoiceRequest>, ended: () => void): VoiceControl;
  advance?(seconds: number): void;
  dispose(): void | Promise<void>;
}
export interface VoiceHandle {
  id: number;
  generation: number;
}
export type VoiceResult =
  | { status: "scheduled" | "not-rendered"; handle: VoiceHandle }
  | { status: "blocked" | "rejected"; reason: string };
interface Voice {
  handle: VoiceHandle;
  request: Required<VoiceRequest>;
  control: VoiceControl;
}
const roles: Record<Bus, number> = { effects: 0, music: 1, dialogue: 2, ui: 3 };
/** DOM-free admission/ownership policy. Release tails are bounded separately from active voices. */
export class VoiceSystem {
  private active = new Map<number, Voice>();
  private tails = new Map<number, Voice>();
  private serial = 0;
  private generation = 1;
  private dead = false;
  private paused = false;
  has(handle: VoiceHandle) {
    return handle.generation === this.generation && this.active.has(handle.id);
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    for (const voice of this.active.values())
      if (voice.request.bus !== "ui" && !voice.request.persistent)
        voice.control.setPaused?.(paused);
  }
  setPosition(handle: VoiceHandle, position: [number, number, number]) {
    if (position.length !== 3 || !position.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e6))
      throw Error("Invalid audio position");
    if (handle.generation === this.generation)
      this.active.get(handle.id)?.control.setPosition?.(position);
  }
  constructor(
    readonly backend: VoiceBackend,
    readonly limit = 24,
    readonly tailLimit = 4,
  ) {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 128 ||
      !Number.isInteger(tailLimit) ||
      tailLimit < 0 ||
      tailLimit > 16
    )
      throw Error("Voice limit");
  }
  get stats() {
    return { active: this.active.size, tails: this.tails.size, generation: this.generation };
  }
  play(input: VoiceRequest): VoiceResult {
    if (this.dead) throw Error("Audio service disposed");
    const request: Required<VoiceRequest> = {
      asset: input.asset,
      persistent: input.persistent ?? false,
      bus: input.bus ?? "effects",
      priority: input.priority ?? 0,
      gainDb: input.gainDb ?? 0,
      loop: input.loop ?? false,
      position: input.position ?? null,
      refDistance: input.refDistance ?? 1,
      maxDistance: input.maxDistance ?? 50,
      rolloff: input.rolloff ?? 1,
      delay: input.delay ?? 0,
    };
    if (
      typeof request.asset !== "string" ||
      !request.asset ||
      request.asset.length > 100 ||
      !Object.hasOwn(roles, request.bus) ||
      !Number.isFinite(request.priority) ||
      request.priority < 0 ||
      request.priority > 1000 ||
      !Number.isFinite(request.gainDb) ||
      request.gainDb < -80 ||
      request.gainDb > 6 ||
      typeof request.persistent !== "boolean" ||
      (request.persistent && request.bus !== "music") ||
      typeof request.loop !== "boolean" ||
      (request.position !== null &&
        (!Array.isArray(request.position) ||
          request.position.length !== 3 ||
          !request.position.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e6))) ||
      !Number.isFinite(request.refDistance) ||
      request.refDistance < 0.01 ||
      request.refDistance > 1000 ||
      !Number.isFinite(request.maxDistance) ||
      request.maxDistance < request.refDistance ||
      request.maxDistance > 10000 ||
      !Number.isFinite(request.rolloff) ||
      request.rolloff < 0 ||
      request.rolloff > 10 ||
      !Number.isFinite(request.delay) ||
      request.delay < 0 ||
      request.delay > 0.25 ||
      Object.keys(input).some(
        (k) =>
          ![
            "asset",
            "persistent",
            "bus",
            "priority",
            "gainDb",
            "loop",
            "position",
            "refDistance",
            "maxDistance",
            "rolloff",
            "delay",
          ].includes(k),
      )
    )
      throw Error("Invalid audio cue");
    if (this.paused && request.bus !== "ui" && !request.persistent)
      return { status: "blocked", reason: "Game audio paused" };
    if (this.backend.duration(request.asset) === undefined)
      return { status: "rejected", reason: "Missing audio asset" };
    if (!this.backend.ready)
      return { status: "blocked", reason: "Audio device suspended or not unlocked" };
    let victim: Voice | undefined;
    if (this.active.size >= this.limit) {
      victim = [...this.active.values()].sort(
        (a, b) =>
          roles[a.request.bus] - roles[b.request.bus] ||
          a.request.priority - b.request.priority ||
          a.handle.id - b.handle.id,
      )[0];
      if (
        roles[request.bus] < roles[victim.request.bus] ||
        (roles[request.bus] === roles[victim.request.bus] &&
          request.priority < victim.request.priority)
      )
        return { status: "rejected", reason: "Voice priority budget" };
    }
    const handle = { id: ++this.serial, generation: this.generation };
    const ended = () => {
      if (handle.generation !== this.generation) return;
      this.active.delete(handle.id);
      this.tails.delete(handle.id);
    };
    try {
      const control = this.backend.start(request, ended);
      if (victim) this.release(victim, 0.01);
      this.active.set(handle.id, { handle, request, control });
    } catch (error) {
      return { status: "rejected", reason: "Audio start failed: " + String(error) };
    }
    return { status: this.backend.rendered ? "scheduled" : "not-rendered", handle: { ...handle } };
  }
  stop(handle: VoiceHandle, fadeSeconds = 0.01) {
    if (!Number.isFinite(fadeSeconds) || fadeSeconds < 0 || fadeSeconds > 0.1)
      throw Error("Invalid release fade");
    if (handle.generation !== this.generation) return;
    const voice = this.active.get(handle.id);
    if (voice) this.release(voice, fadeSeconds);
  }
  private release(voice: Voice, fade: number) {
    this.active.delete(voice.handle.id);
    if (fade > 0 && this.tailLimit) {
      while (this.tails.size >= this.tailLimit) {
        const first = this.tails.values().next().value!;
        this.tails.delete(first.handle.id);
        first.control.stop(0);
      }
      this.tails.set(voice.handle.id, voice);
      voice.control.stop(fade);
    } else voice.control.stop(0);
  }
  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 3600)
      throw Error("Invalid audio delta");
    if (this.dead) throw Error("Audio service disposed");
    this.backend.advance?.(seconds);
  }
  usesAsset(asset: string) {
    return [...this.active.values(), ...this.tails.values()].some((v) => v.request.asset === asset);
  }
  seek(handle: VoiceHandle, seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) throw Error("Invalid seek");
    const v = handle.generation === this.generation ? this.active.get(handle.id) : undefined;
    if (!v) return;
    if (seconds > this.backend.duration(v.request.asset)!) throw Error("Seek past audio duration");
    if (!v.control.seek) throw Error("Seek requires a stream");
    v.control.seek(seconds);
  }
  reset(keepPersistent = false) {
    if (this.dead) return;
    for (const voice of [...this.active.values(), ...this.tails.values()]) {
      if (keepPersistent && voice.request.persistent) continue;
      voice.control.stop(0);
      this.active.delete(voice.handle.id);
      this.tails.delete(voice.handle.id);
    }
    if (keepPersistent) return;
    this.active.clear();
    this.tails.clear();
    this.generation++;
    this.serial = 0;
  }
  async dispose() {
    if (this.dead) return;
    this.reset();
    this.dead = true;
    await this.backend.dispose();
  }
}
