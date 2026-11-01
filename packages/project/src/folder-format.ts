import { parseScene, type SceneDocument } from "../../runtime/src/schema";
import { hashBytes, isBlobRef, BLOB_PREFIX } from "../../assets/src/blobs";
import { projectRelativePath } from "./disk-path";
import { parseProjectMetadata, newProjectMetadata } from "./metadata";
const encoder = new TextEncoder();
export interface FolderLayout {
  files: Map<string, string | { ref: string }>;
  paths: Record<string, string>;
  scripts: Record<string, string>;
  shaders: Record<string, { source: string; uniforms: string; metadata: string }>;
}
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
async function key(id: string, name: string) {
  return (
    (name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 32) || "asset") +
    "-" +
    (await hashBytes(encoder.encode(id))).slice(0, 20)
  );
}
/** Layout only; binary resources stay as lazy content-addressed references. */
export async function folderLayout(
  input: SceneDocument,
  overrides: Record<string, string> = {},
): Promise<FolderLayout> {
  const scene = parseScene(input);
  const files: FolderLayout["files"] = new Map();
  const paths: Record<string, string> = Object.create(null);
  const occupied = new Set<string>();
  const scripts: FolderLayout["scripts"] = Object.create(null),
    shaders: FolderLayout["shaders"] = Object.create(null);
  const put = (path: string, data: string | { ref: string }, identity = path) => {
    path = overrides[identity] ?? path;
    projectRelativePath(path);
    paths[identity] = path;
    if (occupied.has(path.toLowerCase())) throw Error("Duplicate folder resource path");
    occupied.add(path.toLowerCase());
    files.set(path, data);
    return path;
  };
  const binary = (path: string, ref: string, identity: string) => {
    if (!isBlobRef(ref))
      throw Error("Disk export requires referenced assets; intern source bytes first");
    return put(path, { ref }, identity);
  };
  const assets = [];
  for (const asset of scene.assets) {
    const name = await key(asset.id, asset.name);
    const sources = [];
    for (const [index, source] of (asset.import?.sources ?? []).entries()) {
      const filename = source.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "source.bin";
      sources.push({
        ...source,
        data: undefined,
        file: binary(
          `sources/${name}/${index}-${filename}`,
          source.data,
          `source:${asset.id}:${index}`,
        ),
      });
    }
    assets.push({
      ...asset,
      data: undefined,
      file: binary(`assets/${name}.glb`, asset.data, `asset:${asset.id}`),
      ...(asset.import ? { import: { ...asset.import, sources } } : {}),
    });
  }
  const scriptEntries = [];
  for (const script of scene.scripts ?? []) {
    const file = put(
      `scripts/${await key(script.id, script.name)}.ts`,
      script.source,
      `script:${script.id}`,
    );
    scripts[script.id] = file;
    scriptEntries.push({ id: script.id, name: script.name, file });
  }
  const images = [];
  for (const image of scene.graphics?.images ?? [])
    images.push({
      ...image,
      data: undefined,
      file: binary(
        `images/${await key(image.id, image.name)}.${image.format}`,
        image.data,
        `image:${image.id}`,
      ),
    });
  const materials = [];
  for (const material of scene.graphics?.materials ?? [])
    materials.push({
      file: put(
        `materials/${await key(material.id, material.name)}.json`,
        json(material),
        `material:${material.id}`,
      ),
    });
  const shaderEntries = [];
  for (const shader of scene.graphics?.shaders ?? []) {
    const name = await key(shader.id, shader.name);
    const source = put(`shaders/${name}.glsl`, shader.fragment, `shader:${shader.id}:source`);
    const uniforms = put(
      `shaders/${name}.uniforms.json`,
      json(shader.uniforms),
      `shader:${shader.id}:uniforms`,
    );
    const draft =
      shader.draft === undefined
        ? undefined
        : put(`shaders/${name}.draft.glsl`, shader.draft, `shader:${shader.id}:draft`);
    const draftUniforms =
      shader.draftUniforms === undefined
        ? undefined
        : put(
            `shaders/${name}.uniforms-draft.json`,
            shader.draftUniforms,
            `shader:${shader.id}:draftUniforms`,
          );
    const metadata = put(
      `shaders/${name}.json`,
      json({
        id: shader.id,
        name: shader.name,
        version: shader.version,
        source,
        uniforms,
        ...(draft ? { draft } : {}),
        ...(draftUniforms ? { draftUniforms } : {}),
      }),
      `shader:${shader.id}:metadata`,
    );
    shaders[shader.id] = { source, uniforms, metadata };
    shaderEntries.push({ file: metadata });
  }
  const audio = [];
  for (const asset of scene.audio?.assets ?? [])
    audio.push({
      ...asset,
      data: undefined,
      file: binary(`audio/${await key(asset.id, asset.name)}.wav`, asset.data, `audio:${asset.id}`),
    });
  put(
    "project.json",
    json({
      format: "pinefall-folder",
      version: 1,
      scene: "scene.json",
      project: scene.project ?? newProjectMetadata(scene.name),
    }),
  );
  put(
    "scene.json",
    json({
      ...scene,
      project: undefined,
      assets,
      ...(scene.scripts ? { scripts: scriptEntries } : {}),
      ...(scene.graphics
        ? {
            graphics: {
              ...scene.graphics,
              materials,
              ...(scene.graphics.images ? { images } : {}),
              ...(scene.graphics.shaders ? { shaders: shaderEntries } : {}),
            },
          }
        : {}),
      ...(scene.audio ? { audio: { ...scene.audio, assets: audio } } : {}),
    }),
  );
  return { files, scripts, shaders, paths };
}
export interface FolderReader {
  binding?(identity: string, path: string): void;
  text(path: string, limit: number): Promise<string>;
  binary(path: string, limit: number): Promise<{ ref: string; bytes: number }>;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid folder metadata object");
  return value as Record<string, unknown>;
}
function inventory(value: unknown, limit: number): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > limit) throw Error("Folder inventory budget");
  return value.map(object);
}
/** No execution occurs here. Invalid external files never mutate the live document. */
export async function readFolder(reader: FolderReader): Promise<SceneDocument> {
  const occupied = new Set(["scene.json", "project.json"]);
  const binding = (identity: string, value: unknown) => {
    const path = projectRelativePath(value);
    if (occupied.has(path.toLowerCase())) throw Error("Duplicate folder resource path: " + path);
    occupied.add(path.toLowerCase());
    reader.binding?.(identity, path);
  };
  const text = (path: unknown, limit: number) => reader.text(projectRelativePath(path), limit);
  const readJSON = async (path: unknown, limit = 1024 * 1024) => {
    try {
      return JSON.parse(await text(path, limit)) as unknown;
    } catch (error) {
      throw Error(String(path) + ": " + String(error));
    }
  };
  const project = object(await readJSON("project.json"));
  if (
    project.format !== "pinefall-folder" ||
    project.version !== 1 ||
    project.scene !== "scene.json" ||
    Object.keys(project).some((k) => !["format", "version", "scene", "project"].includes(k))
  )
    throw Error("Unsupported folder project manifest");
  const scene = object(await readJSON("scene.json", 4 * 1024 * 1024));
  scene.project = parseProjectMetadata(project.project);
  let modelBytes = 0,
    audioBytes = 0;
  const binary = async (path: unknown, audio = false) => {
    const value = await reader.binary(projectRelativePath(path), audio ? 8000000 : 200000000);
    if (!isBlobRef(value.ref) || !Number.isSafeInteger(value.bytes) || value.bytes < 0)
      throw Error("Invalid folder binary resource");
    if (audio) {
      audioBytes += value.bytes;
      if (audioBytes > 8000000) throw Error("Folder audio budget");
    } else {
      modelBytes += value.bytes;
      if (modelBytes > 480000000) throw Error("Folder model/source budget");
    }
    return value.ref;
  };
  const assets = [];
  for (const asset of inventory(scene.assets, 16)) {
    if ("data" in asset) throw Error("Folder assets must be separate files");
    binding(`asset:${asset.id}`, asset.file);
    const data = await binary(asset.file);
    const imported = asset.import === undefined ? undefined : object(asset.import);
    if (imported) {
      const sources = [];
      for (const [index, source] of inventory(imported.sources, 33).entries()) {
        binding(`source:${asset.id}:${index}`, source.file);
        if ("data" in source) throw Error("Folder sources must be separate files");
        const data = await binary(source.file);
        sources.push({ name: source.name, data, sha256: data.slice(BLOB_PREFIX.length) });
      }
      imported.sources = sources;
      if ("artifactHash" in imported) imported.artifactHash = data.slice(BLOB_PREFIX.length);
    }
    assets.push({
      id: asset.id,
      name: asset.name,
      data,
      ...(imported ? { import: imported } : {}),
    });
  }
  scene.assets = assets;
  if (scene.scripts !== undefined) {
    const scripts = [];
    for (const script of inventory(scene.scripts, 64)) {
      if ("source" in script) throw Error("Folder script source must be a file");
      binding(`script:${script.id}`, script.file);
      scripts.push({ id: script.id, name: script.name, source: await text(script.file, 256000) });
    }
    scene.scripts = scripts;
  }
  if (scene.graphics !== undefined) {
    const graphics = object(scene.graphics);
    if (graphics.images !== undefined) {
      let total = 0;
      const images = [];
      for (const image of inventory(graphics.images, 32)) {
        if ("data" in image) throw Error("Folder images must be separate files");
        binding(`image:${image.id}`, image.file);
        const value = await reader.binary(projectRelativePath(image.file), 16 * 1024 * 1024);
        total += value.bytes;
        if (!isBlobRef(value.ref) || value.bytes < 1 || total > 128 * 1024 * 1024)
          throw Error("Graphics image source budget");
        images.push({
          id: image.id,
          name: image.name,
          format: image.format,
          width: image.width,
          height: image.height,
          data: value.ref,
        });
      }
      graphics.images = images;
    }
    const materials = [];
    for (const entry of inventory(graphics.materials, 64)) {
      const material = object(await readJSON(entry.file, 65536));
      binding(`material:${material.id}`, entry.file);
      materials.push(material);
    }
    graphics.materials = materials;
    if (graphics.shaders !== undefined) {
      const shaders = [];
      for (const entry of inventory(graphics.shaders, 16)) {
        const metadata = object(await readJSON(entry.file, 65536));
        binding(`shader:${metadata.id}:metadata`, entry.file);
        for (const field of ["source", "uniforms", "draft", "draftUniforms"])
          if (metadata[field] !== undefined)
            binding(`shader:${metadata.id}:${field}`, metadata[field]);
        shaders.push({
          id: metadata.id,
          name: metadata.name,
          version: metadata.version,
          fragment: await text(metadata.source, 65536),
          uniforms: await readJSON(metadata.uniforms, 65536),
          ...(metadata.draft === undefined ? {} : { draft: await text(metadata.draft, 65536) }),
          ...(metadata.draftUniforms === undefined
            ? {}
            : { draftUniforms: await text(metadata.draftUniforms, 16384) }),
        });
      }
      graphics.shaders = shaders;
    }
  }
  if (scene.audio !== undefined) {
    const audio = object(scene.audio),
      entries = [];
    for (const asset of inventory(audio.assets, 16)) {
      binding(`audio:${asset.id}`, asset.file);
      entries.push({
        id: asset.id,
        name: asset.name,
        data: await binary(asset.file, true),
        ...(asset.mode === undefined ? {} : { mode: asset.mode }),
      });
    }
    audio.assets = entries;
  }
  return parseScene(scene);
}
