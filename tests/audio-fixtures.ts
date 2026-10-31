/** Authored synthetic PCM16 sine; no external artwork or audio dependency. */
export function sineWave(seconds = 0.2, channels = 1, rate = 16000) {
  const frames = Math.round(seconds * rate),
    bytes = new Uint8Array(44 + frames * channels * 2),
    view = new DataView(bytes.buffer);
  const tag = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i);
  };
  tag(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, bytes.length - 44, true);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++)
      view.setInt16(
        44 + (i * channels + c) * 2,
        Math.round(Math.sin((i * 440 * 2 * Math.PI) / rate) * 8192),
        true,
      );
  return bytes;
}
