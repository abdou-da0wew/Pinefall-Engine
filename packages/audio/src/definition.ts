import { blobs, isBlobRef } from "../../assets/src/blobs";
import type { Bus } from "./voices";
export const audioBuses: readonly Bus[] = ["effects", "music", "dialogue", "ui"];
export interface AudioAsset {
  mode?: "stream";
  id: string;
  name: string;
  data: string;
}
export interface AudioCue {
  persistent?: boolean;
  id: string;
  asset: string;
  bus: Bus;
  gainDb: number;
  priority: number;
  loop: boolean;
  spatial: boolean;
  refDistance: number;
  maxDistance: number;
  rolloff: number;
  late: "drop" | "immediate";
}
export interface AudioDefinition {
  version: 1;
  assets: AudioAsset[];
  cues: AudioCue[];
  buses: Record<Bus, number>;
}
export const emptyAudio = (): AudioDefinition => ({
  version: 1,
  assets: [],
  cues: [],
  buses: { effects: 0, music: 0, dialogue: 0, ui: 0 },
});
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid audio object");
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, names: string[]) {
  if (Object.keys(value).some((key) => !names.includes(key))) throw Error("Unknown audio field");
}
export function audioId(value: unknown) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 100 ||
    ["__proto__", "constructor", "prototype"].includes(value)
  )
    throw Error("Invalid audio ID");
  return value;
}
function number(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw Error("Invalid audio number");
  return value;
}
function boolean(value: unknown) {
  if (typeof value !== "boolean") throw Error("Invalid audio flag");
  return value;
}
export function parseAudio(input: unknown): AudioDefinition {
  const raw = object(input);
  fields(raw, ["version", "assets", "cues", "buses"]);
  if (raw.version !== 1) throw Error("Unsupported audio version");
  if (
    !Array.isArray(raw.assets) ||
    raw.assets.length > 16 ||
    !Array.isArray(raw.cues) ||
    raw.cues.length > 128
  )
    throw Error("Audio catalog budget");
  let bytes = 0;
  const ids = new Set<string>();
  const assets = raw.assets.map((value) => {
    const a = object(value);
    fields(a, ["id", "name", "data", "mode"]);
    if (a.mode !== undefined && a.mode !== "stream") throw Error("Invalid audio mode");
    const mode = a.mode === "stream" ? { mode: "stream" as const } : {};
    const id = audioId(a.id),
      name = audioId(a.name);
    if (ids.has(id)) throw Error("Duplicate audio asset");
    ids.add(id);
    if (typeof a.data === "string" && isBlobRef(a.data)) return { id, name, data: a.data, ...mode };
    if (
      typeof a.data !== "string" ||
      a.data.length > 5_333_400 ||
      !a.data.startsWith("data:audio/wav;base64,") ||
      (a.data.length - 22) % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(a.data.slice(22))
    )
      throw Error("Expected bounded embedded WAV");
    bytes += (a.data.length - 22) * 0.75;
    if (bytes > 8_000_000) throw Error("Audio source budget");
    return { id, name, data: a.data, ...mode };
  });
  const cueIds = new Set<string>();
  const cues = raw.cues.map((value) => {
    const c = object(value);
    fields(c, [
      "id",
      "asset",
      "bus",
      "gainDb",
      "priority",
      "loop",
      "spatial",
      "refDistance",
      "maxDistance",
      "rolloff",
      "late",
      "persistent",
    ]);
    const id = audioId(c.id),
      asset = audioId(c.asset),
      bus = c.bus as Bus;
    if (
      cueIds.has(id) ||
      !ids.has(asset) ||
      !audioBuses.includes(bus) ||
      !["drop", "immediate"].includes(String(c.late))
    )
      throw Error("Invalid audio cue reference/bus/policy");
    if (c.persistent !== undefined && typeof c.persistent !== "boolean")
      throw Error("Invalid persistence policy");
    const streaming = assets.find((a) => a.id === asset)?.mode === "stream";
    if (streaming && (bus !== "music" || c.spatial))
      throw Error("Streams require nonspatial music bus");
    if (c.persistent && !streaming) throw Error("Persistent cues require streaming music");
    cueIds.add(id);
    const refDistance = number(c.refDistance, 0.01, 1000),
      maxDistance = number(c.maxDistance, refDistance, 10000);
    return {
      id,
      asset,
      bus,
      gainDb: number(c.gainDb, -80, 6),
      priority: number(c.priority, 0, 1000),
      loop: boolean(c.loop),
      spatial: boolean(c.spatial),
      refDistance,
      maxDistance,
      rolloff: number(c.rolloff, 0, 10),
      late: c.late as AudioCue["late"],
      ...(c.persistent === undefined ? {} : { persistent: c.persistent as boolean }),
    };
  });
  const b = object(raw.buses);
  fields(b, [...audioBuses]);
  const buses = Object.fromEntries(
    audioBuses.map((bus) => [bus, number(b[bus], -80, 6)]),
  ) as Record<Bus, number>;
  return { version: 1, assets, cues, buses };
}
export function waveBytes(data: string) {
  if (isBlobRef(data)) return blobs.read(data);
  if (!data.startsWith("data:audio/wav;base64,") || data.length > 5_333_400)
    throw Error("Invalid WAV source");
  const text = atob(data.slice(22));
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}
export function waveURI(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return "data:audio/wav;base64," + btoa(text);
}
export function defaultCue(id: string, asset: string): AudioCue {
  return {
    id,
    asset,
    bus: "effects",
    gainDb: 0,
    priority: 0,
    loop: false,
    spatial: false,
    refDistance: 1,
    maxDistance: 50,
    rolloff: 1,
    late: "drop",
  };
}

export async function waveBytesAsync(data: string, signal: AbortSignal) {
  signal.throwIfAborted();
  if (isBlobRef(data)) return blobs.readAsync(data);
  if (!data.startsWith("data:audio/wav;base64,") || data.length > 5_333_400)
    throw Error("Invalid WAV source");
  const text = data.slice(22),
    chunks: Uint8Array[] = [];
  let size = 0;
  for (let at = 0; at < text.length; at += 32768) {
    signal.throwIfAborted();
    const decoded = atob(text.slice(at, at + 32768)),
      chunk = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
    chunks.push(chunk);
    size += chunk.length;
    if (at % 131072 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  signal.throwIfAborted();
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
