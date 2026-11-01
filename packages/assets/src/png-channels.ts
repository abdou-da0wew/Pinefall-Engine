const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crc = (bytes: Uint8Array) => {
  let result = 0xffffffff;
  for (const byte of bytes) result = crcTable[(result ^ byte) & 255] ^ (result >>> 8);
  return (result ^ 0xffffffff) >>> 0;
};
async function transform(bytes: Uint8Array, compress: boolean, limit: number) {
  const reader = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(compress ? new CompressionStream("deflate") : new DecompressionStream("deflate"))
    .getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) throw Error("PNG expansion/output budget");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
function chunk(type: string, bytes: Uint8Array) {
  const result = new Uint8Array(bytes.length + 12),
    view = new DataView(result.buffer);
  view.setUint32(0, bytes.length);
  result.set(new TextEncoder().encode(type), 4);
  result.set(bytes, 8);
  view.setUint32(result.length - 4, crc(result.subarray(4, -4)));
  return result;
}
/** Exact straight-alpha channel bytes; no canvas premultiplication or colour conversion. */
export async function encodeChannelPNG(
  width: number,
  height: number,
  pixels: Uint8Array | Uint8ClampedArray,
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 2048 ||
    height > 2048 ||
    pixels.length !== width * height * 4
  )
    throw Error("PNG image budget");
  const rows = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++)
    rows.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const header = new Uint8Array(13),
    view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const chunks = [
    signature,
    chunk("IHDR", header),
    chunk("IDAT", await transform(rows, true, 16 * 1024 * 1024 - 128)),
    chunk("IEND", new Uint8Array()),
  ];
  const result = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}
export async function decodeChannelPNG(bytes: Uint8Array) {
  if (bytes.length > 16 * 1024 * 1024 || !signature.every((n, i) => n === bytes[i]))
    throw Error("Invalid PNG signature/budget");
  let width = 0,
    height = 0,
    channels = 0,
    offset = 8,
    ended = false;
  const compressed: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset),
      length = view.getUint32(0);
    if (offset + 12 + length > bytes.length) throw Error("Truncated PNG chunk");
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8)),
      data = bytes.subarray(offset + 8, offset + 8 + length);
    if (crc(bytes.subarray(offset + 4, offset + 8 + length)) !== view.getUint32(8 + length))
      throw Error("PNG CRC mismatch");
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13) throw Error("Invalid PNG header");
      width = view.getUint32(8);
      height = view.getUint32(12);
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      if (
        !width ||
        !height ||
        width > 2048 ||
        height > 2048 ||
        data[8] !== 8 ||
        !channels ||
        data[10] ||
        data[11] ||
        data[12]
      )
        throw Error("Channel packing requires 8-bit RGB/RGBA non-interlaced PNG");
    } else if (type === "IDAT") {
      if (!channels) throw Error("PNG header missing");
      compressed.push(data);
    } else if (type === "IEND") {
      if (length) throw Error("Invalid PNG end");
      ended = true;
      offset += 12;
      break;
    } else if (type === "tRNS" || type === "acTL")
      throw Error("Convert transparent RGB or animated PNG to ordinary RGBA before packing");
    else if (type[0] === type[0].toUpperCase()) throw Error("Unsupported critical PNG chunk");
    offset += length + 12;
  }
  if (!ended || offset !== bytes.length || !compressed.length)
    throw Error("Invalid PNG terminator");
  const input = new Uint8Array(compressed.reduce((n, c) => n + c.length, 0));
  offset = 0;
  for (const c of compressed) {
    input.set(c, offset);
    offset += c.length;
  }
  const stride = width * channels,
    raw = await transform(input, false, height * (stride + 1));
  if (raw.length !== height * (stride + 1)) throw Error("Truncated PNG pixels");
  const output = new Uint8Array(width * height * 4),
    previous = new Uint8Array(stride),
    row = new Uint8Array(stride);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw Error("Invalid PNG filter");
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0,
        b = previous[x],
        c = x >= channels ? previous[x - channels] : 0;
      row[x] =
        (raw[y * (stride + 1) + x + 1] +
          [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]) &
        255;
    }
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      output[at] = row[x * channels];
      output[at + 1] = row[x * channels + 1];
      output[at + 2] = row[x * channels + 2];
      output[at + 3] = channels === 4 ? row[x * channels + 3] : 255;
    }
    previous.set(row);
  }
  return { width, height, pixels: output };
}
