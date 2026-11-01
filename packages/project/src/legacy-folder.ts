import { needsPIF9 } from "./graphics-format";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { DiskWorkspace } from "./disk-workspace";
import { projectRelativePath } from "./disk-path";
import { readFolder } from "./folder-format";
import { newProjectMetadata, parseProjectMetadata } from "./metadata";
export interface ArchivedFile {
  bytes: number;
  hash: string;
}
const encoder = new TextEncoder(),
  decoder = new TextDecoder("utf-8", { fatal: true });
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Invalid legacy metadata object");
  return input as Record<string, unknown>;
}
function list(input: unknown, limit: number) {
  if (!Array.isArray(input) || input.length > limit) throw Error("Legacy inventory budget");
  return input.map(object);
}
const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
/** Integrity is checked over streamed file hashes before any legacy metadata is rewritten.
 * Only bounded metadata/source text is loaded, never the binary source inventory. */
export async function migrateLegacyFolder(
  disk: DiskWorkspace,
  files: Map<string, ArchivedFile>,
  signal?: AbortSignal,
) {
  const original = new Map(files),
    used = new Set<string>();
  const text = async (path: string, limit: number) => {
    signal?.throwIfAborted();
    projectRelativePath(path);
    const entry = files.get(path);
    if (!entry || entry.bytes > limit) throw Error("Missing/oversized legacy resource: " + path);
    used.add(path);
    const bytes = new Uint8Array(entry.bytes);
    for (let offset = 0; offset < entry.bytes;) {
      signal?.throwIfAborted();
      const result = await disk.read(path, offset, Math.min(65536, entry.bytes - offset));
      if (result.total !== entry.bytes || !result.bytes.length)
        throw Error("Legacy resource changed");
      bytes.set(result.bytes, offset);
      offset += result.bytes.length;
    }
    if (sha(bytes) !== entry.hash) throw Error("Legacy file changed during migration: " + path);
    return decoder.decode(bytes);
  };
  const json = async (path: string, limit: number) => object(JSON.parse(await text(path, limit)));
  const manifest = await json("project.json", 16384),
    version = manifest.version;
  if (
    manifest.format !== "pinefall-project" ||
    ![1, 2, 3, 4, 5, 6, 7, 9].includes(Number(version)) ||
    typeof version !== "number" ||
    manifest.scene !== "scene.json" ||
    Object.keys(manifest).some(
      (k) =>
        !(
          version === 1
            ? ["format", "version", "scene"]
            : ["format", "version", "minimumReader", "scene", "project"]
        ).includes(k),
    )
  )
    throw Error("Unsupported legacy PIF manifest");
  if (version === 1) {
    if (files.has("integrity.json")) throw Error("Unexpected legacy integrity proof");
  } else {
    if (manifest.minimumReader !== version) throw Error("Unsupported legacy minimum reader");
    parseProjectMetadata(manifest.project);
    const proof = await json("integrity.json", 32768);
    const entries = list(proof.entries, 99);
    if (
      proof.version !== 1 ||
      proof.algorithm !== "SHA-256" ||
      entries.length !== files.size - 1 ||
      Object.keys(proof).some((k) => !["version", "algorithm", "entries", "root"].includes(k))
    )
      throw Error("Invalid legacy integrity proof");
    let previous = "";
    const canonical = [];
    for (const entry of entries) {
      const path = projectRelativePath(entry.path),
        file = files.get(path);
      if (
        path <= previous ||
        path === "integrity.json" ||
        Object.keys(entry).some((k) => !["path", "size", "sha256"].includes(k)) ||
        !file ||
        file.bytes !== entry.size ||
        file.hash !== entry.sha256
      )
        throw Error("Legacy integrity mismatch: " + path);
      previous = path;
      canonical.push({ path, size: entry.size, sha256: entry.sha256 });
    }
    if (sha(JSON.stringify(canonical)) !== proof.root) throw Error("Legacy root hash mismatch");
  }
  const scene = await json("scene.json", 4 * 1024 * 1024);
  if (version >= 2 && scene.project !== undefined) throw Error("Duplicate legacy project metadata");
  if (version !== 9 && needsPIF9(scene)) throw Error("Extended graphics require PIF9");
  const entities = list(scene.entities, 10000);
  if (version < 5 && (scene.version === 3 || entities.some((e) => e.animator !== undefined)))
    throw Error("Animator definitions require PIF v5");
  if (version < 6 && scene.audio !== undefined) throw Error("Authored audio requires PIF v6");
  if (
    version < 7 &&
    (scene.graphics !== undefined ||
      entities.some((e) => {
        const mesh = e.mesh ? object(e.mesh) : {};
        const light = e.light ? object(e.light) : {};
        return (
          mesh.surface !== undefined ||
          mesh.material !== undefined ||
          mesh.castShadow !== undefined ||
          mesh.receiveShadow !== undefined ||
          light.type === "directional" ||
          Object.keys(light).some((k) => !["type", "color", "intensity", "range"].includes(k))
        );
      }))
  )
    throw Error("Graphics definitions require PIF v7");
  for (const asset of list(scene.assets, 16)) {
    if (asset.import !== undefined) {
      const info = object(asset.import);
      if (version < 3 || (info.version === 2 && version < 4))
        throw Error("Unsupported legacy provenance version");
      const file = files.get(projectRelativePath(asset.file));
      if (info.artifactHash !== undefined && info.artifactHash !== file?.hash)
        throw Error("Legacy artifact hash mismatch");
      for (const source of list(info.sources, 33)) {
        if (files.get(projectRelativePath(source.file))?.hash !== source.sha256)
          throw Error("Legacy source hash mismatch");
      }
    }
  }
  const write = async (path: string, value: unknown) => {
    signal?.throwIfAborted();
    const bytes = encoder.encode(JSON.stringify(value, null, 2) + "\n");
    if (bytes.length > 4 * 1024 * 1024) throw Error("Migrated metadata budget");
    const expected = files.get(path)?.hash ?? null,
      hash = sha(bytes);
    if (bytes.length <= 1048576) await disk.write(path, bytes, expected);
    else {
      const ticket = await disk.beginUpload(path, bytes.length, expected);
      try {
        for (let offset = 0; offset < bytes.length;) {
          signal?.throwIfAborted();
          offset = await disk.appendUpload(ticket, offset, bytes.subarray(offset, offset + 65536));
        }
        await disk.finishUpload(ticket, hash);
      } finally {
        await disk.cancelUpload(ticket);
      }
    }
    files.set(path, { bytes: bytes.length, hash });
  };
  const generated = (path: string) => {
    if (original.has(path)) throw Error("Legacy migration path collision");
    return path;
  };
  if (scene.graphics !== undefined) {
    const graphics = object(scene.graphics),
      materials = [];
    for (const [index, material] of list(graphics.materials, 64).entries()) {
      const file = generated(`migration/material-${index}.json`);
      await write(file, material);
      materials.push({ file });
    }
    graphics.materials = materials;
    if (graphics.shaders !== undefined) {
      const shaders = [];
      for (const [index, shader] of list(graphics.shaders, 16).entries()) {
        if (
          "fragment" in shader ||
          "draft" in shader ||
          "draftUniforms" in shader ||
          Object.keys(shader).some(
            (k) =>
              ![
                "id",
                "name",
                "version",
                "uniforms",
                "file",
                "draftFile",
                "draftUniformsFile",
              ].includes(k),
          )
        )
          throw Error("Invalid legacy shader reference");
        const source = projectRelativePath(shader.file);
        if (!/^shaders\/[A-Za-z0-9_-]+\.glsl$/.test(source))
          throw Error("Unsafe legacy shader source");
        const uniforms = generated(`migration/shader-${index}.uniforms.json`),
          file = generated(`migration/shader-${index}.json`);
        await write(uniforms, shader.uniforms);
        await write(file, {
          id: shader.id,
          name: shader.name,
          version: shader.version,
          source,
          uniforms,
          ...(shader.draftFile === undefined ? {} : { draft: shader.draftFile }),
          ...(shader.draftUniformsFile === undefined
            ? {}
            : { draftUniforms: shader.draftUniformsFile }),
        });
        shaders.push({ file });
      }
      graphics.shaders = shaders;
    }
  }
  const metadata =
    version === 1
      ? scene.project === undefined
        ? newProjectMetadata(String(scene.name))
        : parseProjectMetadata(scene.project)
      : manifest.project;
  delete scene.project;
  await write("scene.json", scene);
  await write("project.json", {
    format: "pinefall-folder",
    version: 1,
    scene: "scene.json",
    project: metadata,
  });
  // Validate the final schema using lazy hash references, without reading every binary into JS RAM.
  await readFolder({
    text,
    async binary(path, limit) {
      const file = files.get(path);
      if (!file || file.bytes > limit) throw Error("Missing/oversized migrated binary: " + path);
      signal?.throwIfAborted();
      used.add(path);
      return { ref: "asset:sha256:" + file.hash, bytes: file.bytes };
    },
  });
  for (const path of original.keys())
    if (!used.has(path)) throw Error("Unreferenced legacy archive entry: " + path);
  // Preserve the verified original proof as historical evidence, not a current folder signature.
  if (files.has("integrity.json")) {
    const proof = await json("integrity.json", 32768);
    const destination = generated("migration/legacy-integrity.json");
    await write(destination, {
      ...proof,
      note: "Verified before conversion; hashes refer to the original PIF, not the editable folder.",
    });
    if ((await disk.fingerprint("integrity.json")) !== files.get("integrity.json")!.hash)
      throw Error("Integrity proof changed during conversion");
    await unlink(resolve(disk.root, "integrity.json"));
    files.delete("integrity.json");
  }
  return { version, integrity: version === 1 ? "legacy-unverified" : "sha256-verified" };
}
