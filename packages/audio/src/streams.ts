import { assetMemory, type Reservation } from "../../assets/src/budget";
import { inspectWave } from "./wav";
import type { VoiceRequest, VoiceControl } from "./voices";
/** Bounded media-element transport. Start/seek timing is deliberately not sample accurate. */
export class StreamBank {
  private assets = new Map<string, { url: string; duration: number; reservation: Reservation }>();
  private voices = new Set<{ asset: string; finish: () => void; refresh: () => void }>();
  private error = "";
  private suspended = false;
  setSuspended(value: boolean) {
    this.suspended = value;
    for (const voice of this.voices) voice.refresh();
  }
  get stats() {
    return { streamAssets: this.assets.size, streams: this.voices.size, streamError: this.error };
  }
  duration(id: string) {
    return this.assets.get(id)?.duration;
  }
  load(id: string, bytes: Uint8Array, signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.assets.has(id) || this.assets.size >= 18)
      throw Error("Stream catalog budget/duplicate");
    const info = inspectWave(bytes, true),
      reservation = assetMemory.reserve(bytes.length * 2, "audio-stream-source");
    try {
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "audio/wav" }));
      this.assets.set(id, { url, duration: info.duration, reservation });
    } catch (error) {
      reservation.release();
      throw error;
    }
  }
  start(
    context: AudioContext,
    bus: GainNode,
    request: Required<VoiceRequest>,
    ended: () => void,
  ): VoiceControl {
    const asset = this.assets.get(request.asset);
    if (!asset || this.voices.size >= 2)
      throw Error("Stream missing or two-stream budget exhausted");
    if (request.position) throw Error("Streaming spatial audio unsupported");
    const media = new Audio();
    media.preload = "metadata";
    media.loop = request.loop;
    media.src = asset.url;
    const source = context.createMediaElementSource(media),
      gain = context.createGain();
    source.connect(gain);
    gain.connect(bus);
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(10 ** (request.gainDb / 20), context.currentTime + 0.01);
    let finished = false,
      paused = false,
      seek = 0,
      playSerial = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    const voice = {
      asset: request.asset,
      refresh: () => {
        if (paused || this.suspended) {
          playSerial++;
          media.pause();
        } else play();
      },
      finish: () => {
        if (finished) return;
        finished = true;
        playSerial++;
        if (timer) clearTimeout(timer);
        media.onended = null;
        media.onerror = null;
        media.onloadedmetadata = null;
        media.pause();
        media.removeAttribute("src");
        media.load();
        source.disconnect();
        gain.disconnect();
        this.voices.delete(voice);
        ended();
      },
    };
    const fail = (error: unknown) => {
      if (finished) return;
      this.error = String(error).slice(0, 240);
      voice.finish();
    };
    const play = () => {
      if (!finished && !paused && !this.suspended) {
        const serial = ++playSerial;
        void media.play().catch((error) => {
          if (serial === playSerial) fail(error);
        });
      }
    };
    media.onloadedmetadata = () => {
      try {
        media.currentTime = seek;
      } catch (error) {
        fail(error);
      }
    };
    media.onerror = () => fail("Media stream failed: " + media.error?.code);
    media.onended = voice.finish;
    this.voices.add(voice);
    play();
    return {
      seek: (seconds) => {
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > asset.duration)
          throw Error("Invalid stream seek");
        seek = seconds;
        if (media.readyState >= 1) media.currentTime = seconds;
      },
      setPaused: (value) => {
        paused = value;
        voice.refresh();
      },
      stop: (fade) => {
        if (finished) return;
        if (fade <= 0 || paused) {
          voice.finish();
          return;
        }
        gain.gain.cancelScheduledValues(context.currentTime);
        gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
        gain.gain.linearRampToValueAtTime(0, context.currentTime + fade);
        if (timer) clearTimeout(timer);
        timer = setTimeout(voice.finish, Math.ceil(fade * 1000) + 10);
      },
    };
  }
  unload(id: string) {
    if ([...this.voices].some((v) => v.asset === id)) throw Error("Stream still in use");
    const a = this.assets.get(id);
    if (!a) return;
    URL.revokeObjectURL(a.url);
    a.reservation.release();
    this.assets.delete(id);
  }
  dispose() {
    for (const voice of [...this.voices]) voice.finish();
    for (const id of [...this.assets.keys()]) this.unload(id);
  }
}
