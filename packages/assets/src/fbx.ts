import { DECODED_MODEL_BYTES } from "./limits";
import { IMPORT_BYTES } from "./limits";
/** Defensive FBX admission before Three's synchronous parser/decompressor allocates arrays. */
export async function inspectFbx(bytes: Uint8Array) {
  if (bytes.length < 32 || bytes.length > IMPORT_BYTES) throw Error("FBX source size limit");
  const text = new TextDecoder().decode(bytes.subarray(0, 23));
  if (!text.startsWith("Kaydara FBX Binary")) {
    const ascii = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!/FBXVersion:\s*7\d{3}/.test(ascii)) throw Error("Unsupported ASCII FBX version");
    let elements = 0;
    for (const match of ascii.matchAll(/:\s*\*(\d+)\s*\{/g)) {
      const n = Number(match[1]);
      if (!Number.isSafeInteger(n) || n > 15_000_000) throw Error("FBX array count limit");
      elements += n;
    }
    if (elements * 8 > DECODED_MODEL_BYTES) throw Error("FBX decoded array budget");
    for (const line of ascii.split("\n"))
      if ((line.match(/^\t*/)?.[0].length || 0) > 128) throw Error("FBX hierarchy too deep");
    return;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    version = view.getUint32(23, true);
  if (version < 6400 || version > 7700) throw Error("Unsupported binary FBX version");
  const wide = version >= 7500,
    header = wide ? 25 : 13;
  let total = 0,
    nodes = 0;
  const uint = (at: number) => {
    if (at + (wide ? 8 : 4) > bytes.length) throw Error("Truncated FBX integer");
    const n = wide ? Number(view.getBigUint64(at, true)) : view.getUint32(at, true);
    if (!Number.isSafeInteger(n)) throw Error("FBX integer overflow");
    return n;
  };
  async function node(start: number, limit: number, depth: number): Promise<number> {
    if (depth > 128 || ++nodes > 20000 || start + header > limit)
      throw Error("FBX hierarchy/header limit");
    const end = uint(start),
      count = uint(start + (wide ? 8 : 4)),
      propertyBytes = uint(start + (wide ? 16 : 8)),
      nameLength = bytes[start + header - 1];
    if (end === 0) {
      if (bytes.subarray(start, start + header).some((b) => b !== 0))
        throw Error("Invalid FBX null record");
      return start + header;
    }
    let at = start + header + nameLength;
    const propertiesEnd = at + propertyBytes;
    if (end <= start || end > limit || propertiesEnd > end || count > 15_000_000)
      throw Error("Invalid FBX node bounds");
    for (let i = 0; i < count; i++) {
      if (at >= propertiesEnd) throw Error("Truncated FBX property");
      const type = String.fromCharCode(bytes[at++]),
        scalar = ({ Y: 2, C: 1, I: 4, F: 4, D: 8, L: 8 } as Record<string, number>)[type];
      if (scalar) {
        at += scalar;
      } else if (type === "S" || type === "R") {
        if (at + 4 > propertiesEnd) throw Error("FBX data length");
        const n = view.getUint32(at, true);
        at += 4 + n;
      } else {
        const size = ({ f: 4, d: 8, l: 8, i: 4, b: 1, c: 1 } as Record<string, number>)[type];
        if (!size || at + 12 > propertiesEnd) throw Error("Unsupported FBX array/property");
        const n = view.getUint32(at, true),
          encoding = view.getUint32(at + 4, true),
          length = view.getUint32(at + 8, true);
        at += 12;
        const expected = n * size;
        total += expected;
        if (
          n > 15_000_000 ||
          total > DECODED_MODEL_BYTES ||
          at + length > propertiesEnd ||
          encoding > 1
        )
          throw Error("FBX allocation budget/bounds");
        if (encoding === 0) {
          if (length !== expected) throw Error("FBX raw array length mismatch");
        } else {
          // Validate zlib expansion before fflate inside FBXLoader can allocate an unbounded result.
          const stream = new Blob([new Uint8Array(bytes.subarray(at, at + length))])
            .stream()
            .pipeThrough(new DecompressionStream("deflate"));
          const reader = stream.getReader();
          let decoded = 0;
          try {
            for (;;) {
              const part = await reader.read();
              if (part.done) break;
              decoded += part.value.length;
              if (decoded > expected)
                throw Error("FBX compressed array expands beyond declared size");
            }
          } finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
          }
          if (decoded !== expected) throw Error("FBX decompressed array length mismatch");
        }
        at += length;
      }
      if (at > propertiesEnd) throw Error("FBX property out of bounds");
    }
    if (at !== propertiesEnd) throw Error("FBX property count mismatch");
    while (at < end) at = await node(at, end, depth + 1);
    if (at !== end) throw Error("FBX child bounds");
    return end;
  }
  let at = 27;
  while (at + header <= bytes.length) {
    if (uint(at) === 0) {
      await node(at, bytes.length, 0);
      break;
    }
    at = await node(at, bytes.length, 0);
  }
}
