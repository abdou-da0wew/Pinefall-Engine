import { inspectIdentities, type SourceIdentity } from "./identities";
import { blobs, isBlobRef } from "./blobs";
/** Allocation admission for self-contained glTF 2.0. No browser/Three dependencies. */
export const MODEL_LIMIT = 2_000_000;
export const LIMITS = {
  nodes: 2048,
  meshes: 512,
  accessors: 4096,
  vertices: 500_000,
  decoded: 64 * 1024 * 1024,
  imageDimension: 2048,
  images: 32,
} as const;
const supported = new Set([
  "KHR_materials_unlit",
  "KHR_texture_transform",
  "KHR_materials_clearcoat",
  "KHR_materials_transmission",
  "KHR_materials_volume",
  "KHR_materials_ior",
  "KHR_materials_specular",
  "KHR_materials_sheen",
  "KHR_materials_iridescence",
  "KHR_materials_anisotropy",
  "KHR_materials_emissive_strength",
  "KHR_materials_dispersion",
  "KHR_mesh_quantization",
  "KHR_lights_punctual",
]);
type Obj = Record<string, unknown>;
const object = (v: unknown): Obj => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("Invalid GLB object");
  return v as Obj;
};
const integer = (v: unknown, max = Number.MAX_SAFE_INTEGER): number => {
  if (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > max)
    throw Error("Invalid GLB integer/budget");
  return v as number;
};
const list = (v: unknown, max: number): Obj[] => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > max) throw Error("GLB collection budget");
  return v.map(object);
};
export function fromDataURI(uri: string): Uint8Array {
  if (isBlobRef(uri)) return blobs.read(uri);
  const m =
    /^data:(?:model\/gltf-binary|application\/octet-stream|application\/gltf-buffer|image\/png|image\/jpeg);base64,([A-Za-z0-9+/]*={0,2})$/.exec(
      uri,
    );
  if (!m || m[1].length % 4 || m[1].length > 12_000_000) throw Error("Invalid embedded resource");
  return Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
}
export function toDataURI(bytes: Uint8Array, mime = "model/gltf-binary") {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${mime};base64,${btoa(s)}`;
}
export function imageDimensions(bytes: Uint8Array): [number, number] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 24 &&
    v.getUint32(0) === 0x89504e47 &&
    v.getUint32(4) === 0x0d0a1a0a &&
    v.getUint32(12) === 0x49484452
  )
    return [v.getUint32(16), v.getUint32(20)];
  if (bytes.length > 4 && v.getUint16(0) === 0xffd8) {
    let at = 2;
    while (at + 4 <= bytes.length) {
      if (bytes[at++] !== 0xff) break;
      while (bytes[at] === 0xff) at++;
      const marker = bytes[at++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (at + 2 > bytes.length) break;
      const n = v.getUint16(at);
      if (n < 2 || at + n > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && n >= 8)
        return [v.getUint16(at + 5), v.getUint16(at + 3)];
      at += n;
    }
  }
  throw Error("Only bounded PNG and baseline/progressive JPEG images are supported");
}
export interface ModelInspection {
  identities?: SourceIdentity[];
  nodes: number;
  meshes: number;
  vertices: number;
  clips: string[];
  materials: string[];
  decodedBytes: number;
  warnings: string[];
}
export function inspectGlb(bytes: Uint8Array): ModelInspection {
  if (bytes.length < 20 || bytes.length > MODEL_LIMIT)
    throw Error("GLB truncated or exceeds 2 MB source limit");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    v.getUint32(0, true) !== 0x46546c67 ||
    v.getUint32(4, true) !== 2 ||
    v.getUint32(8, true) !== bytes.length
  )
    throw Error("Expected a complete GLB 2.0 file");
  const length = v.getUint32(12, true);
  if (v.getUint32(16, true) !== 0x4e4f534a || length % 4 || length + 20 > bytes.length)
    throw Error("Invalid GLB JSON chunk");
  const doc = object(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(20, 20 + length))),
  );
  if (object(doc.asset).version !== "2.0") throw Error("Missing glTF 2.0 asset metadata");
  let bin = new Uint8Array(0),
    seenBin = false;
  for (let at = 20 + length; at < bytes.length;) {
    if (at + 8 > bytes.length) throw Error("Truncated GLB chunk");
    const n = v.getUint32(at, true),
      type = v.getUint32(at + 4, true);
    if (n % 4 || at + 8 + n > bytes.length || type !== 0x004e4942 || seenBin)
      throw Error("Invalid/unsupported GLB chunk");
    seenBin = true;
    bin = bytes.slice(at + 8, at + 8 + n);
    at += 8 + n;
  }
  if (
    doc.extensionsRequired !== undefined &&
    (!Array.isArray(doc.extensionsRequired) ||
      doc.extensionsRequired.some((x) => typeof x !== "string" || !supported.has(x)))
  )
    throw Error("Unsupported required GLB extension/decoder");
  const buffers = list(doc.buffers, 16).map((b, i) => {
    const data =
      b.uri === undefined ? (i === 0 ? bin : new Uint8Array()) : fromDataURI(String(b.uri));
    const n = integer(b.byteLength, LIMITS.decoded);
    if (data.length < n || (b.uri === undefined && data.length > n + 3))
      throw Error("GLB buffer length mismatch");
    return data.subarray(0, n);
  });
  const views = list(doc.bufferViews, 4096).map((b) => {
    const data = buffers[integer(b.buffer)],
      offset = integer(b.byteOffset ?? 0),
      n = integer(b.byteLength);
    if (!data || offset + n > data.length) throw Error("GLB bufferView out of bounds");
    const stride = b.byteStride === undefined ? 0 : integer(b.byteStride, 252);
    if (stride && (stride < 4 || stride % 4)) throw Error("GLB byte stride");
    return { data: data.subarray(offset, offset + n), stride, offset };
  });
  let decodedBytes = 0;
  const accessors = list(doc.accessors, LIMITS.accessors).map((a) => {
    const count = integer(a.count, LIMITS.vertices * 3),
      size = ({ 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 } as Record<string, number>)[
        String(a.componentType)
      ],
      components = (
        { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 } as Record<
          string,
          number
        >
      )[String(a.type)];
    if (!size || !components || !count) throw Error("GLB accessor type/count");
    // Matrix columns are aligned to four-byte boundaries in glTF.
    const columns = String(a.type).startsWith("MAT") ? Math.sqrt(components) : 1;
    const packed = columns > 1 ? columns * Math.ceil((columns * size) / 4) * 4 : components * size;
    decodedBytes += count * components * Math.max(size, 4);
    if (decodedBytes > LIMITS.decoded) throw Error("GLB decoded accessor budget");
    if (a.sparse !== undefined)
      throw Error("Sparse accessors are not supported by the bounded importer yet");
    if (a.bufferView !== undefined) {
      const view = views[integer(a.bufferView)],
        offset = integer(a.byteOffset ?? 0);
      if (
        !view ||
        offset % size ||
        (offset + view.offset) % size ||
        (view.stride && (view.stride < packed || view.stride % size)) ||
        offset + (count - 1) * (view.stride || packed) + packed > view.data.length
      )
        throw Error("GLB accessor out of bounds");
      if (a.componentType === 5126) {
        const floats = new DataView(view.data.buffer, view.data.byteOffset, view.data.byteLength);
        for (let i = 0; i < count; i++)
          for (let j = 0; j < components; j++)
            if (
              !Number.isFinite(
                floats.getFloat32(offset + i * (view.stride || packed) + j * 4, true),
              )
            )
              throw Error("Non-finite GLB accessor");
      }
    } else throw Error("GLB accessor has no storage");
    const storage = views[a.bufferView as number],
      offset = Number(a.byteOffset || 0);
    const data = new DataView(
      storage.data.buffer,
      storage.data.byteOffset,
      storage.data.byteLength,
    );
    const read = (i: number, j = 0) => {
      const at = offset + i * (storage.stride || packed) + j * size;
      switch (a.componentType) {
        case 5120:
          return data.getInt8(at);
        case 5121:
          return data.getUint8(at);
        case 5122:
          return data.getInt16(at, true);
        case 5123:
          return data.getUint16(at, true);
        case 5125:
          return data.getUint32(at, true);
        default:
          return data.getFloat32(at, true);
      }
    };
    return { count, type: a.type, componentType: a.componentType, components, read };
  });
  const nodes = list(doc.nodes, LIMITS.nodes),
    meshes = list(doc.meshes, LIMITS.meshes),
    materials = list(doc.materials, 256),
    animations = list(doc.animations, 128),
    skins = list(doc.skins, 512);
  let vertices = 0;
  for (const mesh of meshes)
    for (const p of list(mesh.primitives, 512)) {
      const attrs = object(p.attributes);
      for (const index of Object.values(attrs))
        if (!accessors[integer(index)]) throw Error("Missing GLB attribute");
      const position = accessors[integer(attrs.POSITION)];
      if (!position || position.type !== "VEC3") throw Error("GLB requires VEC3 positions");
      for (const index of Object.values(attrs))
        if (accessors[integer(index)].count !== position.count)
          throw Error("Vertex attribute counts differ");
      for (const target of list(p.targets, 128))
        for (const index of Object.values(target)) {
          const accessor = accessors[integer(index)];
          if (!accessor || accessor.type !== "VEC3" || accessor.count !== position.count)
            throw Error("Invalid morph target accessor");
        }
      vertices += position.count;
      if (vertices > LIMITS.vertices) throw Error("GLB vertex budget");
      if (p.indices !== undefined) {
        const a = accessors[integer(p.indices)];
        if (!a || a.type !== "SCALAR" || ![5121, 5123, 5125].includes(Number(a.componentType)))
          throw Error("Invalid index accessor");
        for (let i = 0; i < a.count; i++)
          if (a.read(i) >= position.count) throw Error("Index exceeds vertex count");
      }
      if (p.material !== undefined && !materials[integer(p.material)])
        throw Error("Missing material");
    }
  const parent = new Map<number, number>();
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.mesh !== undefined && !meshes[integer(n.mesh)]) throw Error("Missing mesh");
    if (n.extensions !== undefined && object(n.extensions).EXT_mesh_gpu_instancing !== undefined)
      throw Error(
        "GPU instancing extension is unsupported by the bounded importer; place engine instances instead",
      );
    if (n.skin !== undefined && !skins[integer(n.skin)]) throw Error("Missing skin");
    if (n.children !== undefined) {
      if (!Array.isArray(n.children)) throw Error("Invalid children");
      for (const c of n.children) {
        const child = integer(c, nodes.length - 1);
        if (parent.has(child)) throw Error("GLB node has multiple parents");
        parent.set(child, i);
      }
    }
    for (const [key, length] of [
      ["matrix", 16],
      ["translation", 3],
      ["rotation", 4],
      ["scale", 3],
    ] as const)
      if (
        n[key] !== undefined &&
        (!Array.isArray(n[key]) ||
          n[key].length !== length ||
          n[key].some((x) => typeof x !== "number" || !Number.isFinite(x) || Math.abs(x) > 1e9))
      )
        throw Error("Invalid node transform");
  }
  for (let i = 0; i < nodes.length; i++) {
    const seen = new Set<number>();
    let at: number | undefined = i;
    while (at !== undefined) {
      if (seen.has(at) || seen.size > 128) throw Error("Cyclic/deep GLB hierarchy");
      seen.add(at);
      at = parent.get(at);
    }
  }
  const scenes = list(doc.scenes, 32);
  if (doc.scene !== undefined && !scenes[integer(doc.scene)]) throw Error("Missing default scene");
  for (const scene of scenes) {
    if (scene.nodes === undefined) continue;
    if (
      !Array.isArray(scene.nodes) ||
      scene.nodes.length > LIMITS.nodes ||
      new Set(scene.nodes).size !== scene.nodes.length
    )
      throw Error("Invalid scene roots");
    for (const root of scene.nodes) if (!nodes[integer(root)]) throw Error("Missing scene root");
  }
  let expandedNodes = nodes.length;
  for (const node of nodes)
    if (node.mesh !== undefined) {
      const count = list(meshes[integer(node.mesh)].primitives, 512).length;
      if (count > 1) expandedNodes += count;
    }
  if (expandedNodes > LIMITS.nodes) throw Error("Expanded model object budget");
  let jointBindings = 0;
  for (const skin of skins) {
    if (
      !Array.isArray(skin.joints) ||
      !skin.joints.length ||
      skin.joints.length > LIMITS.nodes ||
      new Set(skin.joints).size !== skin.joints.length
    )
      throw Error("Invalid skin joints");
    jointBindings += skin.joints.length;
    if (jointBindings > 8192) throw Error("Aggregate skeleton joint budget");
    for (const joint of skin.joints)
      if (!nodes[integer(joint)]) throw Error("Missing skin joint node");
    if (skin.skeleton !== undefined && !nodes[integer(skin.skeleton)])
      throw Error("Missing skeleton root");
    if (skin.inverseBindMatrices !== undefined) {
      const accessor = accessors[integer(skin.inverseBindMatrices)];
      if (
        !accessor ||
        accessor.type !== "MAT4" ||
        accessor.componentType !== 5126 ||
        accessor.count !== skin.joints.length
      )
        throw Error("Invalid inverse bind matrices");
    }
  }
  let instanceJoints = 0;
  for (const node of nodes)
    if (node.skin !== undefined) {
      const skin = skins[integer(node.skin)],
        mesh = meshes[integer(node.mesh)];
      instanceJoints += (skin.joints as number[]).length * list(mesh?.primitives, 512).length;
      if (instanceJoints > 8192) throw Error("Expanded skeleton joint budget");
      if (!mesh) throw Error("Skin requires a mesh");
      for (const primitive of list(mesh.primitives, 512)) {
        const attrs = object(primitive.attributes),
          joints = accessors[integer(attrs.JOINTS_0)],
          weights = accessors[integer(attrs.WEIGHTS_0)];
        if (
          !joints ||
          !weights ||
          joints.type !== "VEC4" ||
          weights.type !== "VEC4" ||
          ![5121, 5123].includes(Number(joints.componentType))
        )
          throw Error("Invalid skin attributes");
        for (let i = 0; i < joints.count; i++)
          for (let c = 0; c < 4; c++)
            if (joints.read(i, c) >= (skin.joints as unknown[]).length || weights.read(i, c) < 0)
              throw Error("Invalid skin joint index/weight");
      }
    }
  for (const animation of animations) {
    const samplers = list(animation.samplers, 4096),
      channels = list(animation.channels, 4096);
    for (const sampler of samplers) {
      const input = accessors[integer(sampler.input)];
      if (!input || input.type !== "SCALAR" || input.componentType !== 5126)
        throw Error("Invalid animation times");
      for (let i = 0; i < input.count; i++)
        if (input.read(i) < 0 || (i > 0 && input.read(i) <= input.read(i - 1)))
          throw Error("Animation times must increase");
      if (
        sampler.interpolation !== undefined &&
        !["LINEAR", "STEP", "CUBICSPLINE"].includes(String(sampler.interpolation))
      )
        throw Error("Unsupported interpolation");
    }
    for (const channel of channels) {
      const sampler = samplers[integer(channel.sampler)],
        target = object(channel.target);
      if (
        !sampler ||
        !nodes[integer(target.node)] ||
        !["translation", "rotation", "scale", "weights"].includes(String(target.path))
      )
        throw Error("Invalid animation target");
      const input = accessors[integer(sampler.input)],
        output = accessors[integer(sampler.output)];
      if (!output || output.componentType !== 5126) throw Error("Invalid animation values");
      const multiplier = sampler.interpolation === "CUBICSPLINE" ? 3 : 1;
      if (target.path === "weights") {
        const mesh = meshes[integer(nodes[integer(target.node)].mesh)];
        if (!mesh) throw Error("Morph animation requires mesh");
        const count = list(list(mesh.primitives, 512)[0]?.targets, 128).length;
        if (!count || output.type !== "SCALAR" || output.count !== input.count * multiplier * count)
          throw Error("Invalid morph animation values");
      } else if (
        output.type !== (target.path === "rotation" ? "VEC4" : "VEC3") ||
        output.count !== input.count * multiplier
      )
        throw Error("Animation value/time count mismatch");
    }
  }
  for (const image of list(doc.images, LIMITS.images)) {
    const data =
      image.uri !== undefined
        ? fromDataURI(String(image.uri))
        : views[integer(image.bufferView)]?.data;
    if (!data) throw Error("Missing GLB image");
    const [w, h] = imageDimensions(data);
    if (!w || !h || w > LIMITS.imageDimension || h > LIMITS.imageDimension)
      throw Error("Image exceeds 2048 dimension budget");
    decodedBytes += Math.ceil((w * h * 4 * 4) / 3);
    if (decodedBytes > LIMITS.decoded) throw Error("Decoded image/geometry budget exceeded");
  }
  return {
    identities: inspectIdentities(doc),
    nodes: nodes.length,
    meshes: meshes.length,
    vertices,
    clips: animations.map((a, i) => String(a.name || `[unnamed:clip:${i}]`)),
    materials: materials.map((a, i) => String(a.name || `[unnamed:material:${i}]`)),
    decodedBytes,
    warnings: Array.isArray(doc.extensionsUsed)
      ? doc.extensionsUsed
          .filter((x) => typeof x === "string" && !supported.has(x))
          .map((x) => `Optional extension not guaranteed: ${x}`)
      : [],
  };
}

export async function readAssetBytes(data: string) {
  return isBlobRef(data) ? blobs.readAsync(data) : fromDataURI(data);
}
