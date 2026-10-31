import { inspectWave } from "./wav";
import type { VoiceBackend, VoiceRequest, VoiceControl, Bus } from "./voices";
/** Mathematical audio commands only; never claims sound output. */
export class NullAudioBackend implements VoiceBackend {
  readonly rendered = false;
  ready = true;
  time = 0;
  readonly gains: Record<Bus, number> = { effects: 0, music: 0, dialogue: 0, ui: 0 };
  setBusGain(bus: Bus, db: number) {
    if (!Number.isFinite(db) || db < -80 || db > 6) throw Error("Invalid bus gain");
    this.gains[bus] = db;
  }
  readonly trace: { type: string; asset: string; status: "not-rendered" }[] = [];
  private assets = new Map<string, number>();
  private voices = new Set<{
    asset: string;
    remaining: number;
    loop: boolean;
    paused: boolean;
    ended: () => void;
  }>();
  loadWave(id: string, bytes: Uint8Array) {
    if (!this.ready) throw Error("Audio backend disposed");
    if (
      typeof id !== "string" ||
      !id ||
      id.length > 100 ||
      this.assets.has(id) ||
      this.assets.size >= 128
    )
      throw Error("Audio asset catalog budget/duplicate");
    this.assets.set(id, inspectWave(bytes).duration);
  }
  duration(id: string) {
    return this.assets.get(id);
  }
  start(request: Required<VoiceRequest>, ended: () => void): VoiceControl {
    const duration = this.assets.get(request.asset);
    if (duration === undefined || !this.ready) throw Error("Missing/null audio asset");
    const voice = {
      asset: request.asset,
      remaining: duration + request.delay,
      loop: request.loop,
      ended,
      paused: false,
    };
    this.voices.add(voice);
    this.trace.push({ type: "play", asset: request.asset, status: "not-rendered" });
    if (this.trace.length > 200) this.trace.shift();
    return {
      setPaused: (value) => {
        voice.paused = value;
      },
      setPosition: () => {},
      stop: () => {
        if (this.voices.delete(voice)) {
          this.trace.push({ type: "stop", asset: voice.asset, status: "not-rendered" });
          if (this.trace.length > 200) this.trace.shift();
          ended();
        }
      },
    };
  }
  advance(seconds: number) {
    this.time += seconds;
    for (const voice of [...this.voices]) {
      if (voice.loop || voice.paused) continue;
      voice.remaining -= seconds;
      if (voice.remaining <= 1e-10) {
        this.voices.delete(voice);
        voice.ended();
      }
    }
  }
  unload(id: string) {
    if ([...this.voices].some((v) => v.asset === id)) throw Error("Audio asset still in use");
    this.assets.delete(id);
  }
  dispose() {
    for (const voice of this.voices) voice.ended();
    this.voices.clear();
    this.assets.clear();
    this.ready = false;
  }
}
