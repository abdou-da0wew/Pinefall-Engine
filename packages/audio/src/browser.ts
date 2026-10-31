import { assetMemory, type Reservation } from "../../assets/src/budget";
import { inspectWave } from "./wav";
import type { VoiceBackend, VoiceRequest, VoiceControl, Bus } from "./voices";
export class BrowserAudioBackend implements VoiceBackend {
  readonly rendered = true;
  private context?: AudioContext;
  private dead = false;
  private meter?: AnalyserNode;
  private meterData = new Float32Array(256);
  private pending = new Set<Promise<void>>();
  private buses = new Map<Bus, GainNode>();
  private master?: GainNode;
  private buffers = new Map<string, { buffer: AudioBuffer; reservation: Reservation }>();
  private voices = new Set<{ asset: string; finish: () => void }>();
  private loading = new Set<string>();
  private bytes = 0;
  get ready() {
    return !this.dead && this.context?.state === "running";
  }
  get stats() {
    return {
      voices: this.voices.size,
      buffers: this.buffers.size,
      pcmBytes: this.bytes,
      state: this.context?.state || "locked",
    };
  }
  /** Call directly from a user gesture; a blocked context stays explicitly blocked. */
  async unlock() {
    if (this.dead) throw Error("Audio backend disposed");
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      this.meter = this.context.createAnalyser();
      this.meter.fftSize = 256;
      this.master.connect(this.meter);
      this.meter.connect(this.context.destination);
      for (const bus of ["effects", "music", "dialogue", "ui"] as const) {
        const gain = this.context.createGain();
        gain.connect(this.master);
        this.buses.set(bus, gain);
      }
    }
    if (this.context.state === "suspended") await this.context.resume();
    return this.ready;
  }
  async suspend() {
    if (this.dead) throw Error("Audio backend disposed");
    await this.context?.suspend();
  }
  duration(id: string) {
    return this.buffers.get(id)?.buffer.duration;
  }
  outputPeak() {
    if (!this.meter) return 0;
    this.meter.getFloatTimeDomainData(this.meterData);
    let peak = 0;
    for (const value of this.meterData) peak = Math.max(peak, Math.abs(value));
    return peak;
  }
  loadWave(id: string, bytes: Uint8Array, signal: AbortSignal) {
    const pending = this.decode(id, bytes, signal);
    this.pending.add(pending);
    void pending.then(
      () => this.pending.delete(pending),
      () => this.pending.delete(pending),
    );
    return pending;
  }
  private async decode(id: string, bytes: Uint8Array, signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.dead || !this.context) throw Error("Unlock audio before decoding");
    if (
      !id ||
      id.length > 100 ||
      this.buffers.has(id) ||
      this.loading.has(id) ||
      this.buffers.size + this.loading.size >= 128
    )
      throw Error("Audio asset catalog budget/duplicate");
    if (this.loading.size) throw Error("Audio decode already in progress");
    const info = inspectWave(bytes);
    if (this.bytes + info.pcmBytes > 32 * 1024 * 1024) throw Error("PCM cache budget");
    const reservation = assetMemory.reserve(info.pcmBytes, "audio-pcm");
    this.loading.add(id);
    this.bytes += info.pcmBytes;
    try {
      const buffer = this.context.createBuffer(info.channels, info.frames, info.sampleRate),
        view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let slice = performance.now();
      for (let channel = 0; channel < info.channels; channel++) {
        const output = buffer.getChannelData(channel);
        for (let frame = 0; frame < info.frames; frame += 4096) {
          signal.throwIfAborted();
          if (this.dead) throw Error("Audio backend disposed");
          const end = Math.min(info.frames, frame + 4096);
          for (let i = frame; i < end; i++)
            output[i] =
              view.getInt16(info.offset + (i * info.channels + channel) * 2, true) / 32768;
          if (performance.now() - slice > 2) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            slice = performance.now();
          }
        }
      }
      signal.throwIfAborted();
      if (this.dead) throw Error("Audio backend disposed");
      this.buffers.set(id, { buffer, reservation });
    } catch (error) {
      this.bytes -= info.pcmBytes;
      reservation.release();
      throw error;
    } finally {
      this.loading.delete(id);
    }
  }
  setBusGain(bus: Bus, db: number) {
    if (!Number.isFinite(db) || db < -80 || db > 6) throw Error("Invalid bus gain");
    const gain = this.buses.get(bus);
    if (!gain || !this.context) throw Error("Audio bus unavailable");
    const now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(10 ** (db / 20), now, 0.005);
  }
  start(request: Required<VoiceRequest>, ended: () => void): VoiceControl {
    const context = this.context,
      asset = this.buffers.get(request.asset),
      bus = this.buses.get(request.bus);
    if (!context || !this.ready || !asset || !bus) throw Error("Audio device/asset unavailable");
    const source = context.createBufferSource(),
      gain = context.createGain();
    let finished = false;
    const voice = {
      asset: request.asset,
      finish: () => {
        if (finished) return;
        finished = true;
        source.onended = null;
        try {
          source.stop();
        } catch {
          /* Already ended. */
        }
        source.disconnect();
        gain.disconnect();
        this.voices.delete(voice);
        ended();
      },
    };
    try {
      source.buffer = asset.buffer;
      source.loop = request.loop;
      const startAt = context.currentTime + 0.005;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(10 ** (request.gainDb / 20), startAt + 0.005);
      source.connect(gain);
      gain.connect(bus);
      source.onended = voice.finish;
      source.start(startAt);
      this.voices.add(voice);
    } catch (error) {
      voice.finish();
      throw error;
    }
    return {
      stop: (fade) => {
        if (finished) return;
        if (fade <= 0) {
          voice.finish();
          return;
        }
        const now = context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + fade);
        source.stop(now + fade);
      },
    };
  }
  unload(id: string) {
    if ([...this.voices].some((v) => v.asset === id)) throw Error("Audio asset still in use");
    const entry = this.buffers.get(id);
    if (entry) {
      this.bytes -= entry.buffer.length * entry.buffer.numberOfChannels * 4;
      entry.reservation.release();
      this.buffers.delete(id);
    }
  }
  async dispose() {
    if (this.dead) return;
    this.dead = true;
    for (const voice of [...this.voices]) voice.finish();
    for (const id of [...this.buffers.keys()]) this.unload(id);
    for (const bus of this.buses.values()) bus.disconnect();
    this.buses.clear();
    this.master?.disconnect();
    this.meter?.disconnect();
    await Promise.allSettled([...this.pending]);
    if (this.context && this.context.state !== "closed") await this.context.close();
  }
}
