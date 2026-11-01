import * as T from "three";
import { assetMemory, type Reservation } from "../../assets/src/budget";
import type { EnvironmentLighting } from "./graphics-definition";
interface Entry {
  target: T.WebGLRenderTarget;
  refs: number;
  allocation: Reservation;
  disposed: boolean;
}
export interface EnvironmentLease {
  texture: T.Texture;
  bytes: number;
  release(): void;
}
const caches = new WeakMap<T.WebGLRenderer, Map<string, Entry>>();
export function invalidateEnvironments(renderer: T.WebGLRenderer) {
  const cache = caches.get(renderer);
  if (!cache) return;
  for (const entry of cache.values()) {
    entry.target.dispose();
    entry.allocation.release();
    entry.disposed = true;
  }
  cache.clear();
}
/** Renderer-local, ref-counted PMREM; intensity edits do not regenerate the texture. */
export function acquireEnvironment(
  renderer: T.WebGLRenderer,
  definition: EnvironmentLighting,
  external?: T.Texture,
  sourceKey?: string,
): EnvironmentLease | undefined {
  if (!renderer.extensions.has("EXT_color_buffer_float")) return undefined;
  let cache = caches.get(renderer);
  if (!cache) {
    cache = new Map();
    caches.set(renderer, cache);
  }
  if (definition.image && !external) throw Error("External environment source was not prepared");
  const key = JSON.stringify([
    definition.sky,
    definition.ground,
    definition.resolution,
    definition.image ? sourceKey : null,
  ]);
  let entry = cache.get(key);
  if (!entry) {
    const width = definition.resolution * 4,
      height = definition.resolution * 2;
    const allocation = assetMemory.reserve(width * height * 48, "pmrem-environment");
    let generator: T.PMREMGenerator | undefined,
      source: T.DataTexture | undefined,
      target: T.WebGLRenderTarget | undefined;
    try {
      if (external) {
        generator = new T.PMREMGenerator(renderer);
        target = generator.fromEquirectangular(external);
      } else {
        const data = new Float32Array(width * height * 4),
          sky = new T.Color(definition.sky),
          ground = new T.Color(definition.ground),
          color = new T.Color();
        for (let y = 0; y < height; y++) {
          // DataTexture v=0 is the south pole; values are linear radiance.
          color.copy(ground).lerp(sky, (1 - Math.cos((Math.PI * y) / (height - 1))) * 0.5);
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            data[i] = color.r;
            data[i + 1] = color.g;
            data[i + 2] = color.b;
            data[i + 3] = 1;
          }
        }
        source = new T.DataTexture(data, width, height, T.RGBAFormat, T.FloatType);
        source.mapping = T.EquirectangularReflectionMapping;
        source.colorSpace = T.LinearSRGBColorSpace;
        source.needsUpdate = true;
        generator = new T.PMREMGenerator(renderer);
        target = generator.fromEquirectangular(source);
      }
      allocation.resize(target.width * target.height * 8);
      entry = { target, allocation, refs: 0, disposed: false };
      cache.set(key, entry);
    } catch (error) {
      target?.dispose();
      allocation.release();
      throw error;
    } finally {
      source?.dispose();
      generator?.dispose();
    }
  }
  entry.refs++;
  const owned = entry;
  let released = false;
  return {
    texture: owned.target.texture,
    bytes: owned.target.width * owned.target.height * 8,
    release() {
      if (released) return;
      released = true;
      if (--owned.refs === 0 && !owned.disposed) {
        owned.target.dispose();
        owned.allocation.release();
        owned.disposed = true;
        cache!.delete(key);
      }
    },
  };
}
