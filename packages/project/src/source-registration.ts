import { randomUUID, createHash } from "node:crypto";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { DiskWorkspace } from "./disk-workspace";
import { projectRelativePath } from "./disk-path";
import { readFolder } from "./folder-format";
import { DEFAULT_SHADER } from "../../runtime/src/shader-definition";
const encoder = new TextEncoder(),
  decoder = new TextDecoder("utf-8", { fatal: true });
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Expected source metadata object");
  return value as Record<string, unknown>;
}
/** Registers authored source on disk only. Never executes, attaches, or applies it to a running world.
 * The scene catalog is the final CAS write; unrelated external edits and the source file are preserved. */
export async function registerProjectSource(disk: DiskWorkspace, path: string, name: string) {
  projectRelativePath(path);
  if (path.startsWith("pinefall-sdk/") || path.endsWith(".d.ts") || !/\.(ts|glsl|json)$/.test(path))
    throw Error("Choose an authored TypeScript, GLSL, shader metadata or material JSON source");
  if (typeof name !== "string" || !name.trim() || name.length > 100)
    throw Error("Source name must contain 1–100 characters");
  const hashes = new Map<string, string>(),
    created = new Map<string, string>();
  let committed = false;
  const text = async (path: string, limit: number) => {
    projectRelativePath(path);
    const first = await disk.read(path, 0, Math.min(limit, 65536));
    if (first.total > limit) throw Error("Source metadata budget: " + path);
    const bytes = new Uint8Array(first.total);
    bytes.set(first.bytes);
    let offset = first.bytes.length;
    while (offset < bytes.length) {
      const chunk = await disk.read(path, offset, Math.min(65536, bytes.length - offset));
      if (chunk.total !== bytes.length || !chunk.bytes.length)
        throw Error("Source changed while reading");
      bytes.set(chunk.bytes, offset);
      offset += chunk.bytes.length;
    }
    hashes.set(path, createHash("sha256").update(bytes).digest("hex"));
    return decoder.decode(bytes);
  };
  const writeNew = async (path: string, value: unknown) => {
    const bytes = encoder.encode(JSON.stringify(value, null, 2) + "\n");
    const hash = await disk.write(path, bytes, null);
    created.set(path, hash);
  };
  try {
    const scene = object(JSON.parse(await text("scene.json", 4 * 1024 * 1024)));
    const originalSceneHash = hashes.get("scene.json")!;
    const id = randomUUID();
    let registeredId: string = id;
    let kind: "script" | "shader" | "material";
    if (path.endsWith(".ts")) {
      const scripts = scene.scripts ?? [];
      if (!Array.isArray(scripts) || scripts.length >= 64) throw Error("Script catalog budget");
      if (
        scripts.some(
          (entry) => String(object(entry).name).toLowerCase() === name.trim().toLowerCase(),
        )
      )
        throw Error("Choose a unique script module name");
      scripts.push({ id, name: name.trim(), file: path });
      scene.scripts = scripts;
      kind = "script";
    } else {
      const graphics =
        scene.graphics === undefined ? { version: 1, materials: [] } : object(scene.graphics);
      scene.graphics = graphics;
      let metadataPath = path;
      if (path.endsWith(".glsl")) {
        const uniforms = `shaders/registered-${id}.uniforms.json`;
        metadataPath = `shaders/registered-${id}.json`;
        await writeNew(uniforms, DEFAULT_SHADER.uniforms);
        await writeNew(metadataPath, { version: 1, id, name: name.trim(), source: path, uniforms });
        kind = "shader";
      } else {
        const metadata = object(JSON.parse(await text(path, 65536)));
        registeredId = String(metadata.id);
        if (typeof metadata.source === "string" && typeof metadata.uniforms === "string")
          kind = "shader";
        else if (metadata.family === "pbr" || metadata.family === "unlit") kind = "material";
        else
          throw Error(
            "JSON must be a material asset or shader metadata with source/uniform file references; a uniform file alone is not an asset",
          );
      }
      const catalog = kind === "shader" ? (graphics.shaders ?? []) : graphics.materials;
      if (!Array.isArray(catalog)) throw Error("Invalid source catalog");
      catalog.push({ file: metadataPath });
      if (kind === "shader") graphics.shaders = catalog;
      else graphics.materials = catalog;
    }
    const encoded = encoder.encode(JSON.stringify(scene, null, 2) + "\n");
    if (encoded.length > 4 * 1024 * 1024) throw Error("Scene metadata budget");
    // Resolves all source paths and enforces schema, duplicate binding and catalog bounds.
    await readFolder({
      text: (file, limit) =>
        file === "scene.json" ? Promise.resolve(decoder.decode(encoded)) : text(file, limit),
      async binary(file, limit) {
        const first = await disk.read(file, 0, 1);
        if (first.total > limit) throw Error("Binary resource budget");
        const hash = await disk.fingerprint(file);
        if (!hash) throw Error("Missing binary resource");
        hashes.set(file, hash);
        return { ref: "asset:sha256:" + hash, bytes: first.total };
      },
    });
    for (const [file, hash] of hashes)
      if ((await disk.fingerprint(file)) !== hash)
        throw Error("External edit conflict during registration: " + file);
    if (encoded.length <= 1048576) await disk.write("scene.json", encoded, originalSceneHash);
    else {
      const ticket = await disk.beginUpload("scene.json", encoded.length, originalSceneHash);
      try {
        for (let offset = 0; offset < encoded.length;)
          offset = await disk.appendUpload(
            ticket,
            offset,
            encoded.subarray(offset, offset + 65536),
          );
        await disk.finishUpload(ticket, createHash("sha256").update(encoded).digest("hex"));
      } finally {
        await disk.cancelUpload(ticket);
      }
    }
    committed = true;
    return { kind, path, id: registeredId };
  } finally {
    if (!committed)
      for (const [file, hash] of created)
        try {
          if ((await disk.fingerprint(file)) === hash) await unlink(resolve(disk.root, file));
        } catch {
          /* Never delete an externally edited source. */
        }
  }
}
