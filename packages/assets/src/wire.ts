import { encodeClip, decodeTrack, type WireClip } from "./animation-wire";
import * as T from "three";
import { LIMITS } from "./glb";
export interface WireAttribute {
  array: Float32Array | Uint32Array;
  itemSize: number;
}
export interface WireGeometry {
  id: string;
  attributes: Record<string, WireAttribute>;
  index?: WireAttribute;
  morph: Record<string, WireAttribute[]>;
  relative: boolean;
  groups: T.BufferGeometry["groups"];
  bounds: { min: number[]; max: number[]; center: number[]; radius: number };
}
export interface ModelWire {
  json: T.Object3DJSON & Record<string, unknown>;
  geometries: WireGeometry[];
  images: { id: string; bitmap: ImageBitmap }[];
  bytes: number;
  animations: WireClip[];
}
function attribute(
  a: T.BufferAttribute | T.InterleavedBufferAttribute,
  index = false,
): WireAttribute {
  if (a.count > LIMITS.vertices * 3 || a.itemSize > 16 || a.count < 0)
    throw Error("Geometry attribute budget");
  const array = index
    ? new Uint32Array(a.count * a.itemSize)
    : new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++)
    for (let j = 0; j < a.itemSize; j++) {
      const n = a.getComponent(i, j);
      if (!Number.isFinite(n) || Math.abs(n) > 1e9 || (index && (!Number.isInteger(n) || n < 0)))
        throw Error("Non-finite/invalid geometry");
      array[i * a.itemSize + j] = n;
    }
  return { array, itemSize: a.itemSize };
}
/** Worker-only: buffers and bitmaps have one owner after postMessage transfer. */
export function encodeModel(root: T.Object3D): ModelWire {
  const meta: T.JSONMeta = {
    geometries: {},
    materials: {},
    textures: {},
    images: {},
    shapes: {},
    skeletons: {},
    animations: {},
    nodes: {},
  };
  const geometries: WireGeometry[] = [],
    images: ModelWire["images"] = [];
  let bytes = 0,
    nodes = 0;
  root.traverse((o) => {
    if (++nodes > LIMITS.nodes) throw Error("Model node budget");
    o.updateMatrix();
    if (o.matrix.elements.some((x) => !Number.isFinite(x) || Math.abs(x) > 1e9))
      throw Error("Invalid model transform");
    if (!(o instanceof T.Mesh || o instanceof T.Line || o instanceof T.Points)) return;
    const g: T.BufferGeometry = o.geometry;
    if (!meta.geometries[g.uuid]) {
      if (geometries.length >= LIMITS.meshes) throw Error("Geometry budget");
      const attributes = Object.fromEntries(
        Object.entries(g.attributes).map(([key, a]) => [key, attribute(a)]),
      );
      const index = g.index ? attribute(g.index, true) : undefined;
      const position = attributes.position;
      if (!position || position.itemSize !== 3) throw Error("Missing position");
      if (index && index.array.some((x) => x >= position.array.length / 3))
        throw Error("Geometry index out of bounds");
      const morph = Object.fromEntries(
        Object.entries(g.morphAttributes).map(([key, attrs]) => [
          key,
          attrs!.map((a) => attribute(a)),
        ]),
      );
      for (const a of [
        ...Object.values(attributes),
        ...(index ? [index] : []),
        ...Object.values(morph).flat(),
      ])
        bytes += a.array.byteLength;
      g.computeBoundingBox();
      g.computeBoundingSphere();
      geometries.push({
        id: g.uuid,
        attributes,
        index,
        morph,
        relative: g.morphTargetsRelative,
        groups: g.groups,
        bounds: {
          min: g.boundingBox!.min.toArray(),
          max: g.boundingBox!.max.toArray(),
          center: g.boundingSphere!.center.toArray(),
          radius: g.boundingSphere!.radius,
        },
      });
      meta.geometries[g.uuid] = { uuid: g.uuid, type: "BufferGeometry", data: { attributes: {} } };
    }
    for (const m of Array.isArray(o.material) ? o.material : [o.material])
      for (const value of Object.values(m))
        if (value instanceof T.Texture && !meta.images[value.source.uuid]) {
          const bitmap = value.source.data;
          if (!(bitmap instanceof ImageBitmap))
            throw Error("Unsupported decoded texture representation");
          if (bitmap.width > LIMITS.imageDimension || bitmap.height > LIMITS.imageDimension)
            throw Error("Texture dimension budget");
          if (images.length >= LIMITS.images) throw Error("Texture count budget");
          bytes += Math.ceil((bitmap.width * bitmap.height * 4 * 4) / 3);
          images.push({ id: value.source.uuid, bitmap });
          meta.images[value.source.uuid] = { uuid: value.source.uuid, url: "" };
        }
    if (bytes > LIMITS.decoded) throw Error("Decoded model budget exceeded");
  });
  for (const clip of root.animations) {
    if (!Number.isFinite(clip.duration) || clip.tracks.length > 4096)
      throw Error("Invalid animation clip");
    for (const track of clip.tracks) {
      if (
        track.times.length > 500000 ||
        track.values.length > 1500000 ||
        track.times.some((x) => !Number.isFinite(x)) ||
        track.values.some((x) => !Number.isFinite(x))
      )
        throw Error("Animation value/budget");
      bytes += track.times.byteLength + track.values.byteLength;
    }
  }
  if (bytes > LIMITS.decoded) throw Error("Animation/geometry/image budget");
  const animations = root.animations.map(encodeClip);
  for (const clip of root.animations)
    meta.animations[clip.uuid] = { uuid: clip.uuid } as ReturnType<T.AnimationClip["toJSON"]>;
  const json: T.Object3DJSON & Record<string, unknown> = { ...root.toJSON(meta) };
  for (const key of ["materials", "textures", "skeletons"] as const)
    json[key] = Object.values(meta[key]);
  // Geometries/images are supplied by the staged loader, not reconstructed from JSON arrays.
  json.animations = [];
  bytes += JSON.stringify(json).length * 2;
  if (bytes > LIMITS.decoded) throw Error("Model metadata/decoded budget");
  return { json, geometries, images, bytes, animations };
}
export function transfers(wire: ModelWire): Transferable[] {
  const set = new Set<Transferable>();
  for (const g of wire.geometries)
    for (const a of [
      ...Object.values(g.attributes),
      ...(g.index ? [g.index] : []),
      ...Object.values(g.morph).flat(),
    ])
      set.add(a.array.buffer);
  for (const clip of wire.animations)
    for (const track of clip.tracks) {
      set.add(track.times.buffer);
      set.add(track.values.buffer);
    }
  for (const image of wire.images) set.add(image.bitmap);
  return [...set];
}
export function closeWire(wire: ModelWire) {
  for (const i of wire.images) i.bitmap.close();
}
export function disposeModel(root: T.Object3D) {
  const resources = new Set<T.BufferGeometry | T.Material | T.Texture | T.Skeleton>(),
    images = new Set<ImageBitmap>();
  root.traverse((o) => {
    if (o instanceof T.SkinnedMesh) resources.add(o.skeleton);
    if (o instanceof T.Mesh || o instanceof T.Line || o instanceof T.Points) {
      resources.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        resources.add(m);
        for (const v of Object.values(m))
          if (v instanceof T.Texture) {
            resources.add(v);
            if (typeof ImageBitmap !== "undefined" && v.source.data instanceof ImageBitmap)
              images.add(v.source.data);
          }
      }
    }
  });
  for (const r of resources) r.dispose();
  for (const image of images) image.close();
}
const yieldHost = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
export async function decodeModel(wire: ModelWire, signal: AbortSignal): Promise<T.Object3D> {
  const geometries: Record<string, T.BufferGeometry> = {},
    images: Record<string, T.Source<unknown>> = {};
  let root: T.Object3D | undefined;
  const allocated = new Set<T.Material | T.Texture>();
  try {
    let slice = performance.now();
    for (const g of wire.geometries) {
      signal.throwIfAborted();
      const geometry = new T.BufferGeometry();
      geometries[g.id] = geometry;
      for (const [name, a] of Object.entries(g.attributes))
        geometry.setAttribute(name, new T.BufferAttribute(a.array, a.itemSize));
      if (g.index) geometry.setIndex(new T.BufferAttribute(g.index.array, 1));
      geometry.morphAttributes = Object.fromEntries(
        Object.entries(g.morph).map(([key, attrs]) => [
          key,
          attrs.map((a) => new T.BufferAttribute(a.array, a.itemSize)),
        ]),
      );
      geometry.morphTargetsRelative = g.relative;
      geometry.groups = g.groups;
      geometry.boundingBox = new T.Box3(
        new T.Vector3().fromArray(g.bounds.min),
        new T.Vector3().fromArray(g.bounds.max),
      );
      geometry.boundingSphere = new T.Sphere(
        new T.Vector3().fromArray(g.bounds.center),
        g.bounds.radius,
      );
      if (performance.now() - slice > 2) {
        await yieldHost();
        slice = performance.now();
      }
    }
    for (const i of wire.images) images[i.id] = new T.Source(i.bitmap);
    const textures: Record<string, T.Texture> = {},
      materials: Record<string, T.Material> = {},
      animations: Record<string, T.AnimationClip> = {};
    let finalPass = false;
    const checkpoint = async () => {
      signal.throwIfAborted();
      if (performance.now() - slice > 2) {
        await yieldHost();
        slice = performance.now();
      }
    };
    class StagedLoader extends T.ObjectLoader {
      override parseAnimations() {
        return animations;
      }
      override parseObject(...args: Parameters<T.ObjectLoader["parseObject"]>) {
        return finalPass ? root! : super.parseObject(...args);
      }
      shallow(data: unknown) {
        // Pinned r185 runtime has five arguments; its declaration mistakenly omits textures.
        return Reflect.apply(T.ObjectLoader.prototype.parseObject, this, [
          data,
          geometries,
          materials,
          textures,
          animations,
        ]) as T.Object3D;
      }
      override parseGeometries() {
        return geometries;
      }
      override parseImages() {
        return images;
      }
      override parseTextures(json: unknown, sources: Record<string, T.Source<unknown>>) {
        if (finalPass) return textures;
        const texturesResult = super.parseTextures(json, sources);
        for (const t of Object.values(texturesResult)) allocated.add(t);
        return texturesResult;
      }
      override parseMaterials(json: unknown, textureSources: Record<string, T.Texture>) {
        if (finalPass) return materials;
        const materialsResult = super.parseMaterials(json, textureSources);
        for (const m of Object.values(materialsResult)) allocated.add(m);
        return materialsResult;
      }
    }
    signal.throwIfAborted();
    const loader = new StagedLoader();
    for (const clip of wire.animations) {
      const tracks: T.KeyframeTrack[] = [];
      for (const track of clip.tracks) {
        tracks.push(decodeTrack(track));
        await checkpoint();
      }
      const restored = new T.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
      Object.assign(restored, { uuid: clip.id });
      animations[clip.id] = restored;
    }
    for (const texture of (wire.json.textures || []) as unknown[]) {
      Object.assign(textures, loader.parseTextures([texture], images));
      await checkpoint();
    }
    for (const material of (wire.json.materials || []) as unknown[]) {
      Object.assign(materials, loader.parseMaterials([material], textures));
      await checkpoint();
    }
    type NodeData = Record<string, unknown> & { children?: NodeData[] };
    const stack: { data: NodeData; parent?: T.Object3D }[] = [
      { data: wire.json.object as unknown as NodeData },
    ];
    while (stack.length) {
      const { data, parent } = stack.pop()!;
      const object = loader.shallow({ ...data, children: undefined });
      if (parent) parent.add(object);
      else root = object;
      const children = data.children || [];
      for (let i = children.length - 1; i >= 0; i--)
        stack.push({ data: children[i], parent: object });
      await checkpoint();
    }
    signal.throwIfAborted();
    finalPass = true;
    // The final supported parse entry binds skeletons/light targets to the already assembled tree.
    root = loader.parse(wire.json);
    return root;
  } catch (error) {
    if (root) {
      const skeletons = new Set<T.Skeleton>();
      root.traverse((o) => {
        if (o instanceof T.SkinnedMesh && o.skeleton) skeletons.add(o.skeleton);
      });
      for (const skeleton of skeletons) skeleton.dispose();
    }
    for (const geometry of Object.values(geometries)) geometry.dispose();
    for (const resource of allocated) resource.dispose();
    closeWire(wire);
    throw error;
  }
}
