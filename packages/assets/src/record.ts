import { parseRecipe, normalizeGlb, type ImportRecipe } from "./recipe";
import { parseIdentities, type SubassetKind } from "./identities";
import { isBlobRef, BLOB_PREFIX } from "./blobs";
import { inspectGlb, readAssetBytes, toDataURI, type ModelInspection } from "./glb";
export interface SourceFile {
  name: string;
  data: string;
  sha256: string;
}
export interface AssetImport {
  version: 1 | 2;
  revision: number;
  format: "glb" | "fbx";
  artifactHash: string;
  recipe: ImportRecipe;
  sources: SourceFile[];
  report: ModelInspection;
  subassets: { id: string; key: string; kind: SubassetKind }[];
}
export async function digest(bytes: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function safeName(name: string) {
  if (
    !name ||
    name.length > 100 ||
    /[\\/]/.test(name) ||
    [...name].some((c) => c.charCodeAt(0) < 32) ||
    name === "." ||
    name === ".." ||
    /^[a-z][a-z0-9+.-]*:/i.test(name)
  )
    throw Error("Select local files with simple, unique filenames");
  return name;
}
/** Recipes/reports are inert data, independently validated on project load. */
export function parseImport(value: unknown): AssetImport {
  const v = value as AssetImport;
  if (
    !v ||
    ![1, 2].includes(v.version) ||
    !Number.isSafeInteger(v.revision) ||
    v.revision < 1 ||
    !["glb", "fbx"].includes(v.format) ||
    !v.recipe ||
    v.recipe.importer !== "pinefall-three-185" ||
    v.recipe.version !== v.version ||
    !isHash(v.artifactHash) ||
    !Array.isArray(v.sources) ||
    v.sources.length < 1 ||
    v.sources.length > 33 ||
    !Array.isArray(v.subassets) ||
    v.subassets.length > (v.version === 2 ? 4096 : 512)
  )
    throw Error("Invalid asset import metadata");
  const names = new Set<string>();
  let size = 0;
  const sources = v.sources.map((s) => {
    if (
      !s ||
      !isHash(s.sha256) ||
      typeof s.name !== "string" ||
      typeof s.data !== "string" ||
      (!s.data.startsWith("data:application/octet-stream;base64,") && !isBlobRef(s.data))
    )
      throw Error("Invalid source record");
    const name = safeName(s.name),
      key = name.toLowerCase();
    if (names.has(key)) throw Error("Ambiguous source filenames");
    names.add(key);
    size += s.data.length;
    if (size > 6_000_000) throw Error("Original-source budget exceeded");
    if (
      !isBlobRef(s.data) &&
      (!/^data:application\/octet-stream;base64,[A-Za-z0-9+/]*={0,2}$/.test(s.data) ||
        s.data.split(",")[1].length % 4)
    )
      throw Error("Invalid source encoding");
    if (isBlobRef(s.data) && s.data !== BLOB_PREFIX + s.sha256)
      throw Error("Source reference/hash mismatch");
    return { name, data: s.data, sha256: s.sha256 };
  });
  const r = v.report;
  if (
    !r ||
    ![r.nodes, r.meshes, r.vertices, r.decodedBytes].every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n <= 128 * 1024 * 1024,
    )
  )
    throw Error("Invalid import report");
  const strings = (a: unknown, max: number) => {
    if (
      !Array.isArray(a) ||
      a.length > max ||
      a.some((x) => typeof x !== "string" || x.length > 2000)
    )
      throw Error("Invalid report list");
    return a as string[];
  };
  const keys = new Set<string>(),
    ids = new Set<string>();
  const subassets = v.subassets.map((s) => {
    if (
      !s ||
      typeof s.id !== "string" ||
      !s.id.length ||
      s.id.length > 100 ||
      typeof s.key !== "string" ||
      s.key.length > 2000 ||
      !(
        v.version === 2 ? ["material", "clip", "node", "mesh", "skeleton"] : ["material", "clip"]
      ).includes(s.kind) ||
      ids.has(s.id) ||
      keys.has(s.kind + ":" + s.key)
    )
      throw Error("Invalid subasset identity");
    ids.add(s.id);
    keys.add(s.kind + ":" + s.key);
    return { id: s.id, key: s.key, kind: s.kind };
  });
  return {
    version: v.version,
    revision: v.revision,
    format: v.format,
    artifactHash: v.artifactHash,
    recipe: parseRecipe(v.recipe),
    sources,
    report: {
      ...(v.version === 2 ? { identities: parseIdentities(r.identities) } : {}),
      nodes: r.nodes,
      meshes: r.meshes,
      vertices: r.vertices,
      decodedBytes: r.decodedBytes,
      clips: strings(r.clips, 128),
      materials: strings(r.materials, 256),
      warnings: strings(r.warnings, 128),
    },
    subassets,
  };
}
function isHash(v: unknown) {
  return typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
}
export function reconcileSubassets(
  report: ModelInspection,
  previous?: AssetImport,
  mapping?: Record<string, string>,
) {
  const result: AssetImport["subassets"] = [];
  const entries = [...(report.identities || [])];
  for (const kind of ["material", "clip"] as const) {
    const names = kind === "material" ? report.materials : report.clips;
    for (const [i, name] of names.entries()) {
      const ambiguous =
        name.startsWith("[unnamed:") || names.filter((n) => n === name).length !== 1;
      entries.push({
        kind,
        key: ambiguous ? `ambiguous:${i}:${name}` : `name:${name}`,
        label: name,
        ambiguous,
      });
    }
  }
  if (mapping) {
    const keys = new Set(entries.map((e) => e.kind + ":" + e.key));
    if (
      typeof mapping !== "object" ||
      Array.isArray(mapping) ||
      Object.entries(mapping).some(([key, value]) => !keys.has(key) || typeof value !== "string")
    )
      throw Error("Invalid subasset mapping document");
  }
  for (const { kind, key, ambiguous } of entries) {
    const old = !ambiguous
      ? previous?.subassets.find((s) => s.kind === kind && s.key === key)
      : undefined;
    const selected = mapping?.[kind + ":" + key];
    if (selected && !previous?.subassets.some((s) => s.id === selected && s.kind === kind))
      throw Error("Invalid subasset remap");
    const id = mapping ? selected || crypto.randomUUID() : old?.id || crypto.randomUUID();
    if (result.some((s) => s.id === id)) throw Error("Subasset identity mapped more than once");
    result.push({ id, key, kind });
  }
  return result;
}
export async function verifyImport(data: string, metadata: AssetImport) {
  if ((await digest(await readAssetBytes(data))) !== metadata.artifactHash)
    throw Error("Artifact hash mismatch");
  for (const source of metadata.sources)
    if ((await digest(await readAssetBytes(source.data))) !== source.sha256)
      throw Error("Source hash mismatch");
  inspectGlb(await readAssetBytes(data));
}

export async function prepareGlbRecord(
  name: string,
  bytes: Uint8Array,
  inputRecipe: ImportRecipe = { importer: "pinefall-three-185", version: 1 },
) {
  safeName(name);
  const recipe = parseRecipe(inputRecipe),
    cooked = normalizeGlb(bytes, recipe);
  const report = inspectGlb(cooked),
    hash = await digest(cooked);
  if (recipe.version === 1) delete report.identities;
  const metadata: AssetImport = {
    version: recipe.version,
    revision: 1,
    format: "glb",
    artifactHash: hash,
    recipe,
    sources: [
      { name, data: toDataURI(bytes, "application/octet-stream"), sha256: await digest(bytes) },
    ],
    report,
    subassets: [],
  };
  return { name, data: toDataURI(cooked), metadata };
}
