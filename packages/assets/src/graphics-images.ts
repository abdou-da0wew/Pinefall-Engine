import { imageDimensions, fromDataURI } from "./glb";
import { blobs, isBlobRef } from "./blobs";
import { IMAGE_BYTES, IMAGE_EDGE, type GraphicsImage } from "../../runtime/src/image-definition";
/** Inspect dimensions before any bitmap/HDR allocation. HDR accepts canonical Radiance -Y/+X. */
export function inspectGraphicsImage(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > IMAGE_BYTES)
    throw Error("Graphics image source exceeds 16 MiB");
  let format: GraphicsImage["format"], width: number, height: number;
  if (bytes[0] === 137 && bytes[1] === 80) {
    format = "png";
    [width, height] = imageDimensions(bytes);
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    format = "jpeg";
    [width, height] = imageDimensions(bytes);
  } else {
    const header = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 65536)));
    const resolution = /\n-Y ([0-9]+) \+X ([0-9]+)\r?\n/.exec(header);
    if (
      !/^#\?(RADIANCE|RGBE)\r?\n/.test(header) ||
      !header.includes("FORMAT=32-bit_rle_rgbe") ||
      !resolution
    )
      throw Error("Expected PNG/JPEG or canonical Radiance HDR (-Y +X)");
    format = "hdr";
    height = Number(resolution[1]);
    width = Number(resolution[2]);
  }
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > IMAGE_EDGE ||
    height > IMAGE_EDGE
  )
    throw Error("Graphics image dimension budget is 2048 per edge");
  return { format, width, height };
}
export async function graphicsImageBytes(image: GraphicsImage) {
  const bytes = isBlobRef(image.data) ? await blobs.readAsync(image.data) : fromDataURI(image.data);
  const info = inspectGraphicsImage(bytes);
  if (info.format !== image.format || info.width !== image.width || info.height !== image.height)
    throw Error("Graphics image metadata/source mismatch");
  return bytes;
}
export async function importGraphicsImage(file: File): Promise<GraphicsImage> {
  if (file.size > IMAGE_BYTES) throw Error("Graphics image source exceeds 16 MiB");
  const bytes = new Uint8Array(await file.arrayBuffer()),
    info = inspectGraphicsImage(bytes);
  return {
    id: crypto.randomUUID(),
    name: file.name.slice(0, 100),
    ...info,
    data: await blobs.put(bytes),
  };
}
