export type Bus = "effects" | "music" | "dialogue" | "ui";
export interface VoiceRequest {
  asset: string;
  bus?: Bus;
  priority?: number;
  gainDb?: number;
  loop?: boolean;
}
export interface VoiceControl {
  stop(fadeSeconds: number): void;
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
      bus: input.bus ?? "effects",
      priority: input.priority ?? 0,
      gainDb: input.gainDb ?? 0,
      loop: input.loop ?? false,
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
      typeof request.loop !== "boolean" ||
      Object.keys(input).some((k) => !["asset", "bus", "priority", "gainDb", "loop"].includes(k))
    )
      throw Error("Invalid audio cue");
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
  reset() {
    if (this.dead) return;
    for (const voice of [...this.active.values(), ...this.tails.values()]) voice.control.stop(0);
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
