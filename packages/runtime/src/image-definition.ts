import { isBlobRef } from "../../assets/src/blobs";
export const IMAGE_BYTES = 16 * 1024 * 1024,
  IMAGE_CATALOG_BYTES = 128 * 1024 * 1024,
  IMAGE_EDGE = 2048;
export interface GraphicsImage {
  id: string;
  name: string;
  format: "png" | "jpeg" | "hdr";
  width: number;
  height: number;
  data: string;
}
export const MAP_ROLES = [
  "color",
  "emissive",
  "normal",
  "roughness",
  "metalness",
  "ao",
  "alpha",
  "displacement",
] as const;
export type MapRole = (typeof MAP_ROLES)[number];
export interface TextureBinding {
  image: string;
  uv: 0 | 1;
  offset: [number, number];
  repeat: [number, number];
  rotation: number;
  wrap: "repeat" | "clamp";
}
export const textureBinding = (image: string): TextureBinding => ({
  image,
  uv: 0,
  offset: [0, 0],
  repeat: [1, 1],
  rotation: 0,
  wrap: "repeat",
});
export function parseGraphicsImage(input: unknown): GraphicsImage {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Invalid graphics image");
  const v = input as GraphicsImage;
  if (
    Object.keys(v).some((k) => !["id", "name", "format", "width", "height", "data"].includes(k)) ||
    [v.id, v.name].some((t) => typeof t !== "string" || !t.length || t.length > 100) ||
    !["png", "jpeg", "hdr"].includes(v.format) ||
    [v.width, v.height].some((n) => !Number.isInteger(n) || n < 1 || n > IMAGE_EDGE) ||
    typeof v.data !== "string" ||
    (!isBlobRef(v.data) &&
      (!/^data:(image\/(png|jpeg)|application\/octet-stream);base64,[A-Za-z0-9+/]*={0,2}$/.test(
        v.data,
      ) ||
        v.data.length > Math.ceil(IMAGE_BYTES / 3) * 4 + 128))
  )
    throw Error("Invalid graphics image format/dimensions/source budget");
  return { ...v };
}
export function parseTextureBinding(input: unknown): TextureBinding {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Invalid texture binding");
  const v = input as TextureBinding;
  if (
    Object.keys(v).some(
      (k) => !["image", "uv", "offset", "repeat", "rotation", "wrap"].includes(k),
    ) ||
    typeof v.image !== "string" ||
    !v.image.length ||
    v.image.length > 100 ||
    ![0, 1].includes(v.uv) ||
    !["repeat", "clamp"].includes(v.wrap) ||
    !Number.isFinite(v.rotation) ||
    Math.abs(v.rotation) > Math.PI * 32 ||
    [v.offset, v.repeat].some(
      (pair) =>
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        pair.some((n) => typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1024),
    )
  )
    throw Error("Invalid UV channel or texture transform");
  return {
    image: v.image,
    uv: v.uv,
    offset: [...v.offset],
    repeat: [...v.repeat],
    rotation: v.rotation,
    wrap: v.wrap,
  };
}
