import { inspectGlb } from "./glb";
export interface Normalization {
  unitScale: number;
  outputUp: "Y" | "Z" | "X";
}
export interface ImportRecipe {
  importer: "pinefall-three-185";
  version: 1 | 2;
  settings?: Normalization;
}
export function parseRecipe(value: unknown): ImportRecipe {
  const r = value as ImportRecipe;
  if (r?.importer !== "pinefall-three-185" || ![1, 2].includes(r.version))
    throw Error("Unsupported importer recipe");
  if (Object.keys(r).some((k) => !["importer", "version", "settings"].includes(k)))
    throw Error("Unknown recipe field");
  if (r.version === 1) {
    if (r.settings !== undefined) throw Error("Legacy recipes cannot carry normalization");
    return { importer: r.importer, version: 1 };
  }
  const s = r.settings;
  if (
    !s ||
    !Number.isFinite(s.unitScale) ||
    s.unitScale < 0.000001 ||
    s.unitScale > 1000000 ||
    !["X", "Y", "Z"].includes(s.outputUp) ||
    Object.keys(s).some((k) => !["unitScale", "outputUp"].includes(k))
  )
    throw Error("Invalid normalization recipe");
  return {
    importer: r.importer,
    version: 2,
    settings: { unitScale: s.unitScale, outputUp: s.outputUp },
  };
}
export const defaultRecipe = (): ImportRecipe => ({
  importer: "pinefall-three-185",
  version: 2,
  settings: { unitScale: 1, outputUp: "Y" },
});
/** Correct the converter OUTPUT through a parent transform. Skin bind matrices and animation tracks remain unchanged.
 * FBXLoader r185 already corrects Z-up; outputUp must normally remain Y for FBX. Units are explicit, never guessed. */
export function normalizeGlb(bytes: Uint8Array, recipe: ImportRecipe) {
  const checked = parseRecipe(recipe);
  inspectGlb(bytes);
  if (
    checked.version === 1 ||
    (checked.settings!.unitScale === 1 && checked.settings!.outputUp === "Y")
  )
    return bytes; // Identity normalization is read-only; avoid duplicating large sources.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    length = view.getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  if (!Array.isArray(doc.scenes) || !doc.scenes.length)
    throw Error("Normalization requires explicit glTF scenes");
  doc.nodes ??= [];
  const parents = new Set<number>(),
    wrappers = new Map<string, number>();
  for (const scene of doc.scenes) {
    const roots: number[] = scene.nodes || [],
      key = JSON.stringify(roots);
    let wrapper = wrappers.get(key);
    if (wrapper === undefined) {
      if (roots.some((i) => parents.has(i)))
        throw Error("Normalization does not support scenes with partially shared roots");
      roots.forEach((i) => {
        parents.add(i);
      });
      wrapper = doc.nodes.length;
      const q = Math.SQRT1_2,
        s = checked.settings!;
      doc.nodes.push({
        name: "Pinefall normalization",
        extras: { pinefallNormalization: true },
        children: roots,
        scale: [s.unitScale, s.unitScale, s.unitScale],
        rotation:
          s.outputUp === "Z" ? [-q, 0, 0, q] : s.outputUp === "X" ? [0, 0, q, q] : [0, 0, 0, 1],
      });
      wrappers.set(key, wrapper!);
    }
    scene.nodes = [wrapper];
  }
  const json = new TextEncoder().encode(JSON.stringify(doc)),
    padded = (json.length + 3) & ~3,
    tail = bytes.subarray(20 + length),
    out = new Uint8Array(20 + padded + tail.length),
    v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, out.length, true);
  v.setUint32(12, padded, true);
  v.setUint32(16, 0x4e4f534a, true);
  out.fill(32, 20, 20 + padded);
  out.set(json, 20);
  out.set(tail, 20 + padded);
  inspectGlb(out);
  return out;
}
