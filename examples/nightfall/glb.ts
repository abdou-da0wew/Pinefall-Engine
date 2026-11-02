export function makeGlb(doc: Record<string, unknown>, bin?: Uint8Array) {
  const text = new TextEncoder().encode(JSON.stringify(doc)),
    jsonSize = Math.ceil(text.length / 4) * 4,
    binSize = bin ? Math.ceil(bin.length / 4) * 4 : 0;
  const bytes = new Uint8Array(20 + jsonSize + (bin ? 8 + binSize : 0)),
    v = new DataView(bytes.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, bytes.length, true);
  v.setUint32(12, jsonSize, true);
  v.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonSize);
  bytes.set(text, 20);
  if (bin) {
    v.setUint32(20 + jsonSize, binSize, true);
    v.setUint32(24 + jsonSize, 0x004e4942, true);
    bytes.set(bin, 28 + jsonSize);
  }
  return bytes;
}
