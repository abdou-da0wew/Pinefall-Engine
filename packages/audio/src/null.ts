import { inspectWave } from "./wav";
import type { VoiceBackend, VoiceRequest, VoiceControl } from "./voices";
/** Mathematical audio commands only; never claims sound output. */
export class NullAudioBackend implements VoiceBackend {
  readonly rendered = false;
  ready = true;
  readonly trace: { type: string; asset: string; status: "not-rendered" }[] = [];
  private assets = new Map<string, number>();
  private voices = new Set<{
    asset: string;
    remaining: number;
    loop: boolean;
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
    const voice = { asset: request.asset, remaining: duration, loop: request.loop, ended };
    this.voices.add(voice);
    this.trace.push({ type: "play", asset: request.asset, status: "not-rendered" });
    if (this.trace.length > 200) this.trace.shift();
    return {
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
    for (const voice of [...this.voices]) {
      if (voice.loop) continue;
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
