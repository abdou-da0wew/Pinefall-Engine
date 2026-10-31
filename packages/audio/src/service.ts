import { blobs, isBlobRef } from "../../assets/src/blobs";
import { assetMemory, type Reservation } from "../../assets/src/budget";
import {
  emptyAudio,
  parseAudio,
  audioBuses,
  waveBytesAsync,
  type AudioDefinition,
} from "./definition";
import { inspectWave } from "./wav";
import {
  VoiceSystem,
  type VoiceBackend,
  type VoiceHandle,
  type VoiceResult,
  type Bus,
} from "./voices";
export interface CatalogBackend extends VoiceBackend {
  readonly time: number;
  loadWave(id: string, bytes: Uint8Array, signal: AbortSignal): void | Promise<void>;
  unload(id: string): void;
  setBusGain(bus: Bus, db: number): void;
  unlock?(): Promise<boolean>;
  setListener?(
    position: [number, number, number],
    forward: [number, number, number],
    up: [number, number, number],
  ): void;
}
export class AudioCatalog {
  readonly waves = new Map<string, Uint8Array>();
  private constructor(
    readonly definition: AudioDefinition,
    private reservation: Reservation,
  ) {}
  static async prepare(input: AudioDefinition | undefined, signal: AbortSignal) {
    const definition = input ? parseAudio(input) : emptyAudio(),
      size = definition.assets.reduce(
        (n, a) => n + (isBlobRef(a.data) ? blobs.byteLength(a.data) : (a.data.length - 22) * 0.75),
        0,
      ),
      reservation = assetMemory.reserve(Math.ceil(size * 2), "audio-sources");
    if (size > 8_000_000) {
      reservation.release();
      throw Error("Audio source budget");
    }
    const catalog = new AudioCatalog(definition, reservation);
    let pcm = 0;
    try {
      for (const asset of definition.assets) {
        signal.throwIfAborted();
        const bytes = await waveBytesAsync(asset.data, signal);
        pcm += inspectWave(bytes).pcmBytes;
        if (pcm > 32 * 1024 * 1024) throw Error("PCM catalog budget");
        catalog.waves.set(asset.id, bytes);
      }
      signal.throwIfAborted();
      reservation.resize([...catalog.waves.values()].reduce((n, a) => n + a.length, 0));
      return catalog;
    } catch (error) {
      catalog.dispose();
      throw error;
    }
  }
  dispose() {
    this.waves.clear();
    this.reservation.release();
  }
}
/** Maps simulation instants to device time. Suspension/discontinuity resets, never queues missed effects. */
export class AudioEpoch {
  private simulation?: number;
  private device = 0;
  reset() {
    this.simulation = undefined;
  }
  delay(simulation: number, now: number, late: "drop" | "immediate") {
    if (!Number.isFinite(simulation) || !Number.isFinite(now))
      throw Error("Invalid audio epoch time");
    if (this.simulation === undefined) {
      this.simulation = simulation;
      this.device = now + 0.015;
    }
    const difference = this.device + simulation - this.simulation - now;
    if (difference < -0.03 && late === "drop") return undefined;
    return Math.max(0, Math.min(0.1, difference));
  }
  boundary(simulation: number, now: number) {
    if (
      this.simulation !== undefined &&
      Math.abs(this.device + simulation - this.simulation - now) > 0.1
    )
      this.reset();
  }
}
export class AudioService {
  readonly voices: VoiceSystem;
  private catalog?: AudioCatalog;
  private keys = new Map<string, string>();
  private previews = new Map<number, VoiceHandle>();
  private failures = new Map<string, string>();
  private deny(status: "blocked" | "rejected", reason: string, cue = "unknown"): VoiceResult {
    if (this.failures.get(cue) !== reason) {
      this.failures.set(cue, reason);
      this.diagnostic("Audio cue " + status, { cue, reason });
    }
    return { status, reason };
  }
  private owned = new Map<
    number,
    { handle: VoiceHandle; owner?: string; emitter?: string; spatial: boolean }
  >();
  private abort = new AbortController();
  private serial = 0;
  private loading: Promise<void> = Promise.resolve();
  private scheduled?: AudioCatalog;
  private readyCatalog?: AudioCatalog;
  private disposed = false;
  private fault = "";
  private simulation = 0;
  private offset = 0;
  private paused = false;
  private spatialClock = 0;
  readonly epoch = new AudioEpoch();
  constructor(
    readonly backend: CatalogBackend,
    private diagnostic: (
      message: string,
      data?: Record<string, string | number | boolean>,
    ) => void = () => {},
  ) {
    this.voices = new VoiceSystem(backend);
  }
  get stats() {
    return {
      ...this.voices.stats,
      state: this.disposed
        ? "disposed"
        : !this.backend.ready
          ? "locked"
          : this.fault
            ? "failed"
            : this.readyCatalog === this.catalog
              ? "ready"
              : "loading",
      assets: this.catalog?.waves.size ?? 0,
      fault: this.fault,
    };
  }
  adopt(catalog: AudioCatalog) {
    if (this.disposed) {
      catalog.dispose();
      throw Error("Audio service disposed");
    }
    this.reset();
    this.abort.abort();
    this.abort = new AbortController();
    for (const key of this.keys.values()) this.backend.unload(key);
    this.keys.clear();
    const old = this.catalog;
    if (old) {
      if (this.readyCatalog === old || this.scheduled !== old) old.dispose();
      else void this.loading.then(() => old.dispose());
    }
    this.catalog = catalog;
    this.readyCatalog = undefined;
    this.fault = "";
    const epoch = ++this.serial;
    for (const [i, asset] of catalog.definition.assets.entries())
      this.keys.set(asset.id, `a${epoch}-${i}`);
    if (this.backend.ready) void this.decode();
  }
  private decode() {
    const catalog = this.catalog;
    if (!catalog || this.disposed || !this.backend.ready) return this.loading;
    if (this.scheduled === catalog) return this.loading;
    this.scheduled = catalog;
    const signal = this.abort.signal,
      keys = new Map(this.keys);
    this.loading = this.loading
      .catch(() => {})
      .then(async () => {
        signal.throwIfAborted();
        for (const [id, bytes] of catalog.waves) {
          signal.throwIfAborted();
          await this.backend.loadWave(keys.get(id)!, bytes, signal);
        }
        signal.throwIfAborted();
        for (const bus of audioBuses) this.backend.setBusGain(bus, catalog.definition.buses[bus]);
        this.readyCatalog = catalog;
      })
      .catch((error) => {
        for (const key of keys.values()) this.backend.unload(key);
        if (!signal.aborted) {
          this.scheduled = undefined;
          this.fault = String(error);
          this.diagnostic("Audio preparation failed", { error: this.fault });
        }
      });
    return this.loading;
  }
  async unlock() {
    if (this.disposed) throw Error("Audio service disposed");
    const ready = this.backend.unlock ? await this.backend.unlock() : this.backend.ready;
    this.epoch.reset();
    if (ready) await this.decode();
    return ready && this.readyCatalog === this.catalog;
  }
  async settled() {
    await this.loading;
  }
  setTime(seconds: number) {
    this.simulation = seconds;
    this.offset = 0;
    if (!this.backend.ready) this.epoch.reset();
    else this.epoch.boundary(seconds, this.backend.time);
  }
  setEventOffset(seconds: number) {
    this.offset = seconds;
  }
  play(
    cueId: string,
    owner?: string,
    position?: [number, number, number],
    emitter = owner,
  ): VoiceResult {
    if (this.disposed) throw Error("Audio service disposed");
    const cue = this.catalog?.definition.cues.find((c) => c.id === cueId);
    if (!cue) return this.deny("rejected", "Missing audio cue");
    if (this.readyCatalog !== this.catalog || !this.backend.ready)
      return this.deny("blocked", "Audio not unlocked/prepared", cue.id);
    if (cue.spatial && !position)
      return this.deny("rejected", "Spatial cue needs an emitter", cue.id);
    if (this.paused && cue.bus !== "ui") return this.deny("blocked", "Game audio paused", cue.id);
    const delay =
      cue.bus === "ui"
        ? 0
        : this.epoch.delay(this.simulation + this.offset, this.backend.time, cue.late);
    if (delay === undefined) return this.deny("rejected", "Late audio cue dropped", cue.id);
    const result = this.voices.play({
      asset: this.keys.get(cue.asset)!,
      bus: cue.bus,
      gainDb: cue.gainDb,
      priority: cue.priority,
      loop: cue.loop,
      position: cue.spatial ? position! : null,
      refDistance: cue.refDistance,
      maxDistance: cue.maxDistance,
      rolloff: cue.rolloff,
      delay,
    });
    for (const [id, voice] of this.owned) if (!this.voices.has(voice.handle)) this.owned.delete(id);
    if ("handle" in result)
      this.owned.set(result.handle.id, {
        handle: result.handle,
        owner,
        emitter,
        spatial: cue.spatial,
      });
    this.diagnostic("Audio cue " + result.status, {
      cue: cue.id,
      owner: owner ?? "",
      simulationTime: this.simulation + this.offset,
      rendered: this.backend.rendered,
    });
    return result;
  }
  preview(asset: string) {
    if (this.readyCatalog !== this.catalog)
      return { status: "blocked", reason: "Audio not unlocked/prepared" } as VoiceResult;
    const key = this.keys.get(asset);
    if (!key) return { status: "rejected", reason: "Missing audio asset" } as VoiceResult;
    const result = this.voices.play({ asset: key, bus: "ui" });
    for (const [id, handle] of this.previews)
      if (!this.voices.has(handle)) this.previews.delete(id);
    if ("handle" in result) this.previews.set(result.handle.id, result.handle);
    return result;
  }
  stopPreviews() {
    for (const handle of this.previews.values()) this.voices.stop(handle);
    this.previews.clear();
  }
  stop(handle: VoiceHandle, owner?: string, fade = 0.01) {
    const item = this.owned.get(handle.id);
    if (
      owner !== undefined &&
      (item?.owner !== owner || item.handle.generation !== handle.generation)
    )
      return;
    this.voices.stop(handle, fade);
    this.owned.delete(handle.id);
  }
  stopOwner(owner: string) {
    for (const item of this.owned.values()) if (item.owner === owner) this.stop(item.handle, owner);
  }
  setBusGain(bus: Bus, db: number) {
    if (!audioBuses.includes(bus) || !Number.isFinite(db) || db < -80 || db > 6)
      throw Error("Invalid audio bus gain");
    if (!this.catalog) throw Error("No audio catalog");
    this.catalog.definition.buses[bus] = db;
    if (this.backend.ready) this.backend.setBusGain(bus, db);
  }
  setPaused(value: boolean) {
    if (value === this.paused) return;
    this.paused = value;
    this.epoch.reset();
    this.voices.setPaused(value);
  }
  listener(
    position: [number, number, number],
    forward: [number, number, number],
    up: [number, number, number],
  ) {
    if (![...position, ...forward, ...up].every(Number.isFinite))
      throw Error("Invalid audio listener");
    this.backend.setListener?.(position, forward, up);
  }
  advance(seconds: number, position?: (id: string) => [number, number, number] | undefined) {
    this.voices.advance(seconds);
    this.spatialClock += seconds;
    const update = this.spatialClock >= 1 / 30;
    if (update) this.spatialClock = 0;
    for (const [id, item] of this.owned) {
      if (!this.voices.has(item.handle)) {
        this.owned.delete(id);
        continue;
      }
      if (update && item.spatial && item.emitter) {
        const point = position?.(item.emitter!);
        if (point) this.voices.setPosition(item.handle, point);
      }
    }
  }
  reset() {
    this.voices.reset();
    this.owned.clear();
    this.previews.clear();
    this.failures.clear();
    this.epoch.reset();
    this.simulation = 0;
    this.offset = 0;
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.reset();
    const catalog = this.catalog;
    if (catalog && (this.readyCatalog === catalog || this.scheduled !== catalog)) catalog.dispose();
    this.catalog = undefined;
    await this.loading;
    catalog?.dispose();
    await this.voices.dispose();
    this.keys.clear();
  }
}
