import * as T from "three";
import { assetMemory, type Reservation } from "../../assets/src/budget";
import { graphicsImageBytes } from "../../assets/src/graphics-images";
import type { GraphicsImage, MapRole, TextureBinding } from "./image-definition";
interface Decoded {
  texture: T.Texture;
  bitmap?: ImageBitmap;
  allocation: Reservation;
}
/** A world owns decoded sources and private sampler/colour-space views; no shared-material mutation. */
export class GraphicsImages {
  private decoded = new Map<string, Decoded>();
  private views = new Map<string, T.Texture>();
  private viewAllocations: Reservation[] = [];
  static async prepare(
    images: GraphicsImage[],
    ids: Set<string>,
    signal: AbortSignal,
    environmentResolution = 256,
  ) {
    const result = new GraphicsImages();
    let total = 0;
    try {
      for (const id of ids) {
        signal.throwIfAborted();
        const image = images.find((image) => image.id === id);
        if (!image) throw Error("Missing graphics image: " + id);
        const bytes = await graphicsImageBytes(image);
        const decodedBytes =
          Math.max(image.width * image.height, image.format === "hdr" ? 64 * 32 : 0) *
          (image.format === "hdr" ? 8 : 4);
        total += decodedBytes;
        if (total > 128 * 1024 * 1024) throw Error("Decoded graphics images exceed 128 MiB");
        const allocation = assetMemory.reserve(decodedBytes * 3 + bytes.length, "graphics-image");
        let decoded: Decoded | undefined;
        try {
          const payload = await new Promise<{
            bitmap?: ImageBitmap;
            data?: Uint16Array;
            width?: number;
            height?: number;
          }>((resolve, reject) => {
            const worker = new Worker(
              new URL("../../assets/src/graphics-image.worker.ts", import.meta.url),
              { type: "module" },
            );
            const cleanup = () => {
              clearTimeout(timer);
              signal.removeEventListener("abort", abort);
              worker.terminate();
            };
            const abort = () => {
              cleanup();
              reject(signal.reason ?? Error("Image decoding cancelled"));
            };
            const timer = setTimeout(() => {
              cleanup();
              reject(Error("Image decoding exceeded 20 seconds"));
            }, 20000);
            signal.addEventListener("abort", abort, { once: true });
            worker.onerror = (event) => {
              cleanup();
              reject(Error(event.message));
            };
            worker.onmessage = (event) => {
              cleanup();
              if (event.data.error) reject(Error(event.data.error));
              else resolve(event.data);
            };
            if (signal.aborted) {
              abort();
              return;
            }
            // Preserve the content-addressed cache's buffer: transfer only a bounded copy.
            const copy = bytes.slice();
            worker.postMessage({ bytes: copy, environmentResolution }, [copy.buffer]);
          });
          const texture = payload.bitmap
            ? new T.Texture(payload.bitmap)
            : new T.DataTexture(
                payload.data!,
                payload.width!,
                payload.height!,
                T.RGBAFormat,
                T.HalfFloatType,
              );
          texture.flipY = image.format === "hdr";
          texture.needsUpdate = true;
          texture.colorSpace = T.NoColorSpace;
          if (image.format === "hdr") texture.mapping = T.EquirectangularReflectionMapping;
          decoded = { texture, bitmap: payload.bitmap, allocation };
          result.decoded.set(id, decoded);
          allocation.resize(decodedBytes * 2);
          signal.throwIfAborted();
        } catch (error) {
          if (!decoded) allocation.release();
          throw error;
        }
      }
      return result;
    } catch (error) {
      result.dispose();
      throw error;
    }
  }
  source(id: string) {
    const source = this.decoded.get(id);
    if (!source) throw Error("Graphics image was not prepared: " + id);
    return source.texture;
  }
  binding(role: MapRole, binding: TextureBinding) {
    const key = JSON.stringify([role, binding]);
    let texture = this.views.get(key);
    if (!texture) {
      const source = this.source(binding.image),
        image = source.image as { width: number; height: number };
      const allocation = assetMemory.reserve(
        Math.ceil((image.width * image.height * 4 * 4) / 3),
        "graphics-texture-view",
      );
      try {
        texture = source.clone();
      } catch (error) {
        allocation.release();
        throw error;
      }
      this.viewAllocations.push(allocation);
      texture.channel = binding.uv;
      texture.colorSpace = ["color", "emissive"].includes(role) ? T.SRGBColorSpace : T.NoColorSpace;
      texture.wrapS = texture.wrapT =
        binding.wrap === "repeat" ? T.RepeatWrapping : T.ClampToEdgeWrapping;
      texture.offset.fromArray(binding.offset);
      texture.repeat.fromArray(binding.repeat);
      texture.rotation = binding.rotation;
      texture.needsUpdate = true;
      this.views.set(key, texture);
    }
    return texture;
  }
  async upload(renderer: T.WebGLRenderer, signal: AbortSignal) {
    for (const texture of this.views.values()) {
      signal.throwIfAborted();
      renderer.initTexture(texture);
      const gl = renderer.getContext(),
        error = gl.getError();
      if (error !== gl.NO_ERROR) throw Error("Graphics texture upload failed (GL " + error + ")");
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  invalidateGPU() {
    for (const texture of [
      ...this.views.values(),
      ...Array.from(this.decoded.values(), (source) => source.texture),
    ]) {
      texture.dispose();
      texture.needsUpdate = true;
    }
  }
  dispose() {
    for (const texture of this.views.values()) texture.dispose();
    this.views.clear();
    for (const allocation of this.viewAllocations) allocation.release();
    this.viewAllocations = [];
    for (const source of this.decoded.values()) {
      source.texture.dispose();
      source.bitmap?.close();
      source.allocation.release();
    }
    this.decoded.clear();
  }
}
