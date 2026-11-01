import { blobs } from "./blobs";
import { defaultRecipe, parseRecipe, normalizeGlb, type ImportRecipe } from "./recipe";
import { inspectFbx } from "./fbx";
import * as T from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { inspectGlb, imageDimensions, toDataURI, MODEL_LIMIT, LIMITS } from "./glb";
import { digest, safeName, type AssetImport } from "./record";
interface InputFile {
  name: string;
  bytes: Uint8Array;
}
self.onmessage = async (event: MessageEvent<{ files: InputFile[]; recipe?: ImportRecipe }>) => {
  const urls: string[] = [],
    bitmaps: ImageBitmap[] = [];
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...values: unknown[]) => {
    const message = values
      .map((v) => String(v))
      .join(" ")
      .slice(0, 2000);
    if (warnings.length < 120 && !warnings.includes(message)) warnings.push(message);
  };
  try {
    const recipe = parseRecipe(event.data.recipe || defaultRecipe());
    const files = event.data.files;
    if (!Array.isArray(files) || files.length < 1 || files.length > 33)
      throw Error("Select one model with at most 32 companion images");
    const names = new Set<string>();
    let total = 0;
    for (const file of files) {
      safeName(file.name);
      const key = file.name.toLowerCase();
      if (names.has(key)) throw Error("Ambiguous case-insensitive companion filenames");
      names.add(key);
      total += file.bytes.length;
    }
    if (total > 4_000_000) throw Error("Source + companion input limit is 4 MB");
    const models = files.filter((f) => /\.(glb|fbx)$/i.test(f.name));
    if (models.length !== 1)
      throw Error("Import one GLB or FBX at a time, with its companion PNG/JPEG files");
    files.sort((a, b) =>
      a === models[0] ? -1 : b === models[0] ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    const source = models[0],
      format = /\.fbx$/i.test(source.name) ? "fbx" : "glb";
    let bytes = source.bytes;
    self.postMessage({ stage: "inspect" });
    if (format === "glb") {
      if (files.length !== 1)
        throw Error("GLB must embed its images; do not select companion files");
      inspectGlb(bytes);
    } else {
      await inspectFbx(bytes);
      const binary = new TextDecoder().decode(bytes.subarray(0, 23));
      if (
        !binary.startsWith("Kaydara FBX Binary") &&
        !new TextDecoder().decode(bytes.subarray(0, 1024)).includes("FBX")
      )
        throw Error("File signature does not match FBX");
      // Scope window compatibility to this disposable worker; do not weaken Electron security.
      Object.defineProperty(globalThis, "window", {
        value: {
          URL: {
            createObjectURL: (blob: Blob) => {
              const u = URL.createObjectURL(blob);
              urls.push(u);
              return u;
            },
          },
          innerWidth: 1,
          innerHeight: 1,
        },
      });
      const pending: Promise<void>[] = [];
      const manager = new T.LoadingManager();
      let decoded = 0;
      class BitmapTextures extends T.Loader<T.Texture<ImageBitmap>> {
        override load(url: string): T.Texture<ImageBitmap> {
          const texture = new T.Texture<ImageBitmap>();
          const task = (async () => {
            let data: Uint8Array;
            if (url.startsWith("blob:")) {
              if (!urls.includes(url)) throw Error("Unowned blob URI");
              data = new Uint8Array(await (await fetch(url)).arrayBuffer());
            } else if (url.startsWith("data:")) {
              const { fromDataURI } = await import("./glb");
              data = fromDataURI(url);
            } else {
              safeName(url);
              const file = files.find((f) => f.name === url);
              if (!file)
                throw Error("Missing companion texture: " + url + " (exact filename required)");
              data = file.bytes;
            }
            const [w, h] = imageDimensions(data);
            decoded += Math.ceil((w * h * 4 * 4) / 3);
            if (
              !w ||
              !h ||
              w > LIMITS.imageDimension ||
              h > LIMITS.imageDimension ||
              decoded > LIMITS.decoded
            )
              throw Error("FBX decoded image budget");
            // FBX TextureLoader normally flips at upload. ImageBitmap must flip during decode.
            const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)]), {
              imageOrientation: "flipY",
              premultiplyAlpha: "none",
              colorSpaceConversion: "none",
            });
            bitmaps.push(bitmap);
            texture.image = bitmap;
            texture.needsUpdate = true;
          })();
          pending.push(task);
          return texture;
        }
      }
      manager.addHandler(/.*/, new BitmapTextures(manager));
      self.postMessage({ stage: "convert" });
      const root = new FBXLoader(manager).parse(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        "",
      );
      await Promise.all(pending);
      let nodes = 0,
        vertices = 0;
      root.traverse((o) => {
        const sourceId = (o as T.Object3D & { ID?: number }).ID;
        if (Number.isSafeInteger(sourceId)) o.userData.pinefallSourceId = "fbx:" + sourceId;
        if (++nodes > LIMITS.nodes) throw Error("FBX node budget");
        if (o instanceof T.Mesh) {
          vertices += o.geometry.getAttribute("position")?.count || 0;
          if (vertices > LIMITS.vertices) throw Error("FBX vertex budget");
        }
      });
      // r185 FBXLoader emits numeric morph indices, while GLTFExporter expects dictionary names.
      // Rebind the existing target index; never guess a target by order after a reimport.
      for (const clip of root.animations)
        for (const track of clip.tracks) {
          const match = /\.morphTargetInfluences\[(\d+)\]$/.exec(track.name);
          if (!match) continue;
          const binding = T.PropertyBinding.parseTrackName(track.name);
          const mesh = T.PropertyBinding.findNode(root, binding.nodeName) as T.Mesh | null;
          const key = Object.entries(mesh?.morphTargetDictionary || {}).find(
            ([, index]) => index === Number(match[1]),
          )?.[0];
          if (!key || key.includes("[") || key.includes("]"))
            throw Error("Cannot safely bind FBX morph animation target");
          track.name = track.name.slice(0, match.index) + ".morphTargetInfluences[" + key + "]";
        }
      // FBX units/axes are exporter-specific. Do not silently label conversion as exact.
      warnings.push(
        "Experimental FBX conversion: verify units, axes, pivots, materials and animation against the source DCC. Constraints and morph normals are not guaranteed.",
      );
      const output = await new GLTFExporter().parseAsync(root, {
        binary: true,
        onlyVisible: false,
        animations: root.animations,
        maxTextureSize: 2048,
      });
      if (!(output instanceof ArrayBuffer)) throw Error("FBX conversion did not produce GLB");
      bytes = new Uint8Array(output);
    }
    bytes = normalizeGlb(bytes, recipe);
    if (bytes.length > MODEL_LIMIT) throw Error("Converted GLB exceeds 2 MB artifact limit");
    self.postMessage({ stage: "validate" });
    const report = inspectGlb(bytes);
    if (recipe.version === 1) delete report.identities;
    report.warnings = [...new Set([...report.warnings, ...warnings])].slice(0, 126);
    if (
      [...report.materials, ...report.clips].some((name) => name.startsWith("[unnamed:")) ||
      new Set(report.materials).size !== report.materials.length ||
      new Set(report.clips).size !== report.clips.length
    )
      report.warnings.push(
        "Unnamed/duplicate subassets cannot be matched safely on reimport; their IDs will be regenerated.",
      );
    self.postMessage({ stage: "persist-sources" });
    const sources = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        data: blobs.persistent
          ? await blobs.put(f.bytes)
          : toDataURI(f.bytes, "application/octet-stream"),
        sha256: await digest(f.bytes),
      })),
    );
    const metadata: AssetImport = {
      version: recipe.version,
      revision: 1,
      format,
      artifactHash: await digest(bytes),
      recipe,
      sources,
      report,
      subassets: [],
    };
    self.postMessage({
      name: source.name,
      data: blobs.persistent ? await blobs.put(bytes) : toDataURI(bytes),
      metadata,
    });
  } catch (error) {
    self.postMessage({ error: String(error) });
  } finally {
    console.warn = originalWarn;
    for (const url of urls) URL.revokeObjectURL(url);
    for (const bitmap of bitmaps) bitmap.close();
  }
};
