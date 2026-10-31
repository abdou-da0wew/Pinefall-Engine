export interface WaveInfo {
  frames: number;
  channels: number;
  sampleRate: number;
  duration: number;
  pcmBytes: number;
  offset: number;
}
/** AA0 decoder contract: bounded little-endian PCM16 RIFF/WAVE. Other codecs reject explicitly. */
export function inspectWave(bytes: Uint8Array, streaming = false): WaveInfo {
  if (bytes.byteLength < 44 || bytes.byteLength > 4_000_000) throw Error("WAV input budget");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || view.getUint32(4, true) + 8 !== bytes.length)
    throw Error("Expected bounded RIFF/WAVE");
  let channels = 0,
    sampleRate = 0,
    block = 0,
    offset = -1,
    length = 0,
    chunks = 0;
  for (let at = 12; at < bytes.length;) {
    if (++chunks > 32 || at + 8 > bytes.length) throw Error("WAV chunk budget");
    const size = view.getUint32(at + 4, true),
      start = at + 8,
      end = start + size;
    if (end > bytes.length) throw Error("Truncated WAV chunk");
    if (tag(at) === "fmt ") {
      if (
        channels ||
        size < 16 ||
        view.getUint16(start, true) !== 1 ||
        view.getUint16(start + 14, true) !== 16
      )
        throw Error("Only PCM16 WAV is supported");
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
      block = view.getUint16(start + 12, true);
      if (
        ![1, 2].includes(channels) ||
        sampleRate < 8000 ||
        sampleRate > 96000 ||
        block !== channels * 2 ||
        view.getUint32(start + 8, true) !== sampleRate * block
      )
        throw Error("Invalid PCM layout");
    }
    if (tag(at) === "data") {
      if (offset !== -1) throw Error("Duplicate WAV data");
      offset = start;
      length = size;
    }
    at = end + (size % 2);
    if (at > bytes.length) throw Error("Missing WAV padding");
  }
  if (!channels || offset < 0 || !length || length % block) throw Error("Missing/invalid PCM data");
  const frames = length / block,
    duration = frames / sampleRate,
    pcmBytes = frames * channels * 4;
  if (duration < 0.02 || duration > (streaming ? 240 : 30) || pcmBytes > 32 * 1024 * 1024)
    throw Error("Decoded PCM budget/duration");
  return { frames, channels, sampleRate, duration, pcmBytes, offset };
}
