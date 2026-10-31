import { parseImport, verifyImport } from "../../assets/src/record";
import { fromDataURI } from "../../assets/src/glb";
import { newProjectMetadata, parseProjectMetadata } from "./metadata";
import { ensureInlineInit, xzAsync } from "./xz";
import { parseScene } from "../../runtime/src/schema";
import type { SceneDocument } from "../../runtime/src/schema";
import { validateGlb } from "./index";
export const PIF_COMPRESSED_LIMIT = 16 * 1024 * 1024;
export const PIF_EXPANDED_LIMIT = 40 * 1024 * 1024;
const encoder = new TextEncoder(),
  decoder = new TextDecoder("utf-8", { fatal: true });
const safePath = (s: string) =>
  /^(integrity\.json|project\.json|scene\.json|assets\/[A-Za-z0-9_-]+\.glb|sources\/[A-Za-z0-9_-]+\.bin|scripts\/[A-Za-z0-9_-]+\.ts)$/.test(
    s,
  );
export function writeTar(files: Map<string, Uint8Array>): Uint8Array {
  if (files.size > 100) throw Error("PIF entry count limit");
  let size = 1024;
  for (const [path, bytes] of files) {
    if (!safePath(path)) throw Error("Unsafe PIF path");
    size += 512 + Math.ceil(bytes.length / 512) * 512;
  }
  if (size > PIF_EXPANDED_LIMIT) throw Error("Project exceeds expanded PIF limit");
  const tar = new Uint8Array(size);
  let offset = 0;
  const put = (at: number, text: string) => tar.set(encoder.encode(text), offset + at);
  for (const [path, bytes] of files) {
    put(0, path);
    put(100, "0000644\0");
    put(108, "0000000\0");
    put(116, "0000000\0");
    put(124, bytes.length.toString(8).padStart(11, "0") + "\0");
    put(136, "00000000000\0");
    put(148, "        ");
    put(156, "0");
    put(257, "ustar\0");
    put(263, "00");
    const sum = tar.subarray(offset, offset + 512).reduce((a, b) => a + b, 0);
    put(148, sum.toString(8).padStart(6, "0") + "\0 ");
    tar.set(bytes, offset + 512);
    offset += 512 + Math.ceil(bytes.length / 512) * 512;
  }
  return tar;
}
export function readTar(bytes: Uint8Array): Map<string, Uint8Array> {
  if (bytes.length > PIF_EXPANDED_LIMIT || bytes.length % 512)
    throw Error("Invalid PIF archive size");
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  const text = (at: number, length: number) =>
    decoder.decode(bytes.subarray(offset + at, offset + at + length)).split("\0")[0];
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) {
      if (bytes.length - offset < 1024 || !bytes.subarray(offset).every((b) => b === 0))
        throw Error("Invalid TAR terminator");
      return files;
    }
    const path = text(0, 100),
      octal = text(124, 12).trim(),
      checksum = text(148, 8).trim();
    if (
      !safePath(path) ||
      files.has(path) ||
      files.size >= 100 ||
      !/^0?[0-7]+$/.test(octal) ||
      !/^[0-7]+$/.test(checksum) ||
      !["0", ""].includes(text(156, 1)) ||
      text(157, 100) ||
      text(345, 155) ||
      text(257, 6) !== "ustar"
    )
      throw Error("Unsupported or unsafe PIF archive entry");
    const sum = header.reduce((a, b, i) => a + (i >= 148 && i < 156 ? 32 : b), 0);
    if (sum !== parseInt(checksum, 8)) throw Error("TAR checksum mismatch");
    const size = parseInt(octal, 8);
    if (
      !Number.isSafeInteger(size) ||
      size > PIF_EXPANDED_LIMIT ||
      offset + 512 + size > bytes.length
    )
      throw Error("Truncated PIF entry");
    files.set(path, bytes.slice(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw Error("Missing TAR terminator");
}
function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
export function projectFiles(scene: SceneDocument) {
  const checked = parseScene(scene),
    files = new Map<string, Uint8Array>();
  const metadata = parseProjectMetadata(checked.project || newProjectMetadata(checked.name));
  metadata.title = checked.name;
  metadata.modifiedAt = new Date(
    Math.max(Date.now(), Date.parse(metadata.createdAt)),
  ).toISOString();
  metadata.editor.version = "0.5.3";
  const assets = checked.assets.map((asset, i) => {
    const path = `assets/${i}.glb`,
      bytes = Uint8Array.from(atob(asset.data.split(",")[1]), (c) => c.charCodeAt(0));
    validateGlb(bytes);
    files.set(path, bytes);
    const provenance = asset.import
      ? {
          ...asset.import,
          sources: asset.import.sources.map((source, j) => {
            const file = `sources/${i}-${j}.bin`;
            files.set(file, fromDataURI(source.data));
            return { name: source.name, sha256: source.sha256, file };
          }),
        }
      : undefined;
    return {
      id: asset.id,
      name: asset.name,
      file: path,
      ...(provenance ? { import: provenance } : {}),
    };
  });
  const scripts = checked.scripts?.map((script, i) => {
    const path = `scripts/${i}.ts`;
    files.set(path, encoder.encode(script.source));
    return { id: script.id, name: script.name, file: path };
  });
  files.set(
    "project.json",
    encoder.encode(
      JSON.stringify({
        format: "pinefall-project",
        version: checked.assets.some((a) => a.import) ? 3 : 2,
        minimumReader: checked.assets.some((a) => a.import) ? 3 : 2,
        scene: "scene.json",
        project: metadata,
      }),
    ),
  );
  files.set(
    "scene.json",
    encoder.encode(
      JSON.stringify(
        { ...checked, project: undefined, assets, ...(scripts ? { scripts } : {}) },
        null,
        2,
      ),
    ),
  );
  return files;
}
function decodeFiles(files: Map<string, Uint8Array>): SceneDocument {
  const used = new Set<string>();
  const get = (path: unknown) => {
    if (typeof path !== "string" || !safePath(path) || !files.has(path))
      throw Error("Missing/unsafe project resource");
    used.add(path);
    return files.get(path)!;
  };
  const manifest = JSON.parse(decoder.decode(get("project.json")));
  if (
    manifest.format !== "pinefall-project" ||
    ![1, 2, 3].includes(manifest.version) ||
    manifest.scene !== "scene.json"
  )
    throw Error("Unsupported PIF manifest");
  if (manifest.version >= 2) {
    if (manifest.minimumReader !== manifest.version) throw Error("Unsupported minimum PIF reader");
    parseProjectMetadata(manifest.project);
  }
  if (
    Object.keys(manifest).some(
      (k) =>
        !(
          manifest.version >= 2
            ? ["format", "version", "minimumReader", "scene", "project"]
            : ["format", "version", "scene"]
        ).includes(k),
    )
  )
    throw Error("Unknown PIF manifest field");
  const scene = JSON.parse(decoder.decode(get("scene.json")));
  if (manifest.version >= 2) {
    if (scene.project !== undefined) throw Error("Duplicate project metadata");
    scene.project = parseProjectMetadata(manifest.project);
  }

  if (
    !Array.isArray(scene.assets) ||
    scene.assets.length > 16 ||
    (scene.scripts !== undefined && (!Array.isArray(scene.scripts) || scene.scripts.length > 64))
  )
    throw Error("Invalid project resource list");
  scene.assets = scene.assets.map((a: Record<string, unknown>) => {
    if (!a || "data" in a || typeof a.file !== "string" || !a.file.startsWith("assets/"))
      throw Error("PIF assets must reference files");
    const bytes = get(a.file);
    validateGlb(bytes);
    let provenance;
    if (a.import !== undefined) {
      if (manifest.version !== 3) throw Error("Import provenance requires PIF v3");
      const info = a.import as Record<string, unknown>;
      if (!info || !Array.isArray(info.sources) || info.sources.length > 33)
        throw Error("Invalid source inventory");
      provenance = parseImport({
        ...info,
        sources: info.sources.map((source: Record<string, unknown>) => {
          if (
            !source ||
            "data" in source ||
            typeof source.file !== "string" ||
            !source.file.startsWith("sources/")
          )
            throw Error("Unsafe source reference");
          return {
            name: source.name,
            sha256: source.sha256,
            data: "data:application/octet-stream;base64," + base64(get(source.file)),
          };
        }),
      });
    }
    return {
      id: a.id,
      name: a.name,
      data: "data:model/gltf-binary;base64," + base64(bytes),
      ...(provenance ? { import: provenance } : {}),
    };
  });
  if (scene.scripts)
    scene.scripts = scene.scripts.map((s: Record<string, unknown>) => {
      if (!s || "source" in s || typeof s.file !== "string" || !s.file.startsWith("scripts/"))
        throw Error("PIF scripts must reference files");
      return { id: s.id, name: s.name, source: decoder.decode(get(s.file)) };
    });
  if (used.size !== files.size) throw Error("Unreferenced PIF archive entries");
  return parseScene(scene);
}
export const PIF_VERSION = 3;
export async function sha256(bytes: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function sealProjectFiles(files: Map<string, Uint8Array>) {
  const copy = new Map(files);
  copy.delete("integrity.json");
  const entries = [];
  for (const [path, bytes] of [...copy].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    entries.push({ path, size: bytes.length, sha256: await sha256(bytes) });
  const root = await sha256(encoder.encode(JSON.stringify(entries)));
  copy.set(
    "integrity.json",
    encoder.encode(JSON.stringify({ version: 1, algorithm: "SHA-256", entries, root }, null, 2)),
  );
  return copy;
}
export interface PIFReadOptions {
  expectedSha256?: string;
  requireIntegrity?: boolean;
}
export async function sceneFromFiles(
  files: Map<string, Uint8Array>,
  options: PIFReadOptions = {},
): Promise<SceneDocument> {
  const manifestBytes = files.get("project.json");
  if (!manifestBytes || manifestBytes.length > 16384) throw Error("Missing/oversized PIF manifest");
  const manifest = JSON.parse(decoder.decode(manifestBytes));
  if (manifest.version === 1) {
    if (options.requireIntegrity) throw Error("Legacy PIF has no integrity proof");
    if (files.has("integrity.json")) throw Error("Unexpected legacy integrity metadata");
    return decodeFiles(files);
  }
  if (![2, 3].includes(manifest.version)) throw Error("Unsupported PIF manifest version");
  const proofBytes = files.get("integrity.json");
  if (!proofBytes || proofBytes.length > 32768) throw Error("Missing/oversized integrity proof");
  const proof = JSON.parse(decoder.decode(proofBytes));
  if (
    Object.keys(proof).some((k) => !["version", "algorithm", "entries", "root"].includes(k)) ||
    proof.version !== 1 ||
    proof.algorithm !== "SHA-256" ||
    !Array.isArray(proof.entries) ||
    proof.entries.length !== files.size - 1 ||
    proof.entries.length > 99 ||
    typeof proof.root !== "string" ||
    !/^[a-f0-9]{64}$/.test(proof.root)
  )
    throw Error("Invalid integrity proof");
  const canonical: Array<{ path: string; size: number; sha256: string }> = [];
  let previous = "";
  for (const entry of proof.entries) {
    if (
      !entry ||
      Object.keys(entry).some((k) => !["path", "size", "sha256"].includes(k)) ||
      typeof entry.path !== "string" ||
      entry.path <= previous ||
      entry.path === "integrity.json" ||
      !safePath(entry.path) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw Error("Invalid integrity inventory");
    const bytes = files.get(entry.path);
    if (!bytes || bytes.length !== entry.size || (await sha256(bytes)) !== entry.sha256)
      throw Error("PIF integrity mismatch: " + entry.path);
    previous = entry.path;
    canonical.push({ path: entry.path, size: entry.size, sha256: entry.sha256 });
  }
  if ((await sha256(encoder.encode(JSON.stringify(canonical)))) !== proof.root)
    throw Error("PIF root hash mismatch");
  const payload = new Map(files);
  payload.delete("integrity.json");
  const scene = decodeFiles(payload);
  for (const asset of scene.assets) if (asset.import) await verifyImport(asset.data, asset.import);
  return scene;
}
export async function packProject(scene: SceneDocument): Promise<Uint8Array> {
  scene = parseScene(scene);
  for (const asset of scene.assets) if (asset.import) await verifyImport(asset.data, asset.import);
  const tar = writeTar(await sealProjectFiles(projectFiles(scene)));
  await ensureInlineInit();
  const bytes = await xzAsync(tar, { preset: 6 });
  if (bytes.length > PIF_COMPRESSED_LIMIT) throw Error("Compressed project too large");
  return bytes;
}
/** Fixed-size output allocation: malformed XZ cannot expand beyond the project budget. */
export async function inspectProject(
  bytes: Uint8Array,
  options: PIFReadOptions = {},
): Promise<{
  scene: SceneDocument;
  formatVersion: number;
  integrity: "sha256-verified" | "legacy-unverified";
  archiveSha256: string;
}> {
  if (
    bytes.length < 24 ||
    bytes.length > PIF_COMPRESSED_LIMIT ||
    ![253, 55, 122, 88, 90, 0].every((v, i) => bytes[i] === v)
  )
    throw Error("Expected an XZ-compressed .pif project");
  if (
    options.expectedSha256 !== undefined &&
    (!/^[a-fA-F0-9]{64}$/.test(options.expectedSha256) ||
      (await sha256(bytes)) !== options.expectedSha256.toLowerCase())
  )
    throw Error("PIF external SHA-256 mismatch");
  const m = await ensureInlineInit();
  let input = 0,
    output = 0,
    meta = 0;
  try {
    input = m._malloc(bytes.length);
    output = m._malloc(PIF_EXPANDED_LIMIT);
    meta = m._malloc(16);
    if (!input || !output || !meta) throw Error("PIF decoder allocation failed");
    m.HEAPU8.set(bytes, input);
    m.HEAPU8.fill(0, meta, meta + 16);
    m.setValue(meta, BigInt(64 * 1024 * 1024), "i64");
    const code = m._lzma_stream_buffer_decode(
      meta,
      0,
      0,
      input,
      meta + 8,
      bytes.length,
      output,
      meta + 12,
      PIF_EXPANDED_LIMIT,
    );
    if (code !== 0 || m.getValue(meta + 8, "i32") !== bytes.length)
      throw Error(
        "Invalid XZ stream or project exceeds memory/expansion budget (code " + code + ")",
      );
    const size = m.getValue(meta + 12, "i32");
    const files = readTar(m.HEAPU8.slice(output, output + size));
    const scene = await sceneFromFiles(files, options);
    const formatVersion = JSON.parse(decoder.decode(files.get("project.json"))).version;
    return {
      scene,
      formatVersion,
      integrity: formatVersion >= 2 ? "sha256-verified" : "legacy-unverified",
      archiveSha256: await sha256(bytes),
    };
  } finally {
    if (input) m._free(input);
    if (output) m._free(output);
    if (meta) m._free(meta);
  }
}

export async function unpackProject(
  bytes: Uint8Array,
  options: PIFReadOptions = {},
): Promise<SceneDocument> {
  return (await inspectProject(bytes, options)).scene;
}
