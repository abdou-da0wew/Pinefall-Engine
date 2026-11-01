import { PROJECT_MODEL_BYTES } from "./limits";
import { waveBytesAsync } from "../../audio/src/definition";
import { inspectWave } from "../../audio/src/wav";
import { assetMemory } from "./budget";
import type { SceneDocument } from "../../runtime/src/schema";
import { blobs, isBlobRef, BLOB_PREFIX } from "./blobs";
import { fromDataURI, toDataURI } from "./glb";
export function sceneReferences(scene: SceneDocument) {
  const refs = new Set<string>();
  for (const a of scene.assets) {
    if (isBlobRef(a.data)) refs.add(a.data);
    for (const s of a.import?.sources || []) if (isBlobRef(s.data)) refs.add(s.data);
  }
  for (const a of scene.audio?.assets ?? []) if (isBlobRef(a.data)) refs.add(a.data);
  return refs;
}
/** Portable JSON is explicitly materialized. Internal working documents contain only references. */
export function materializeScene(input: SceneDocument): SceneDocument {
  const scene = structuredClone(input);
  scene.version = input.version === 3 ? 3 : 1;
  for (const a of scene.assets) {
    if (isBlobRef(a.data)) a.data = toDataURI(blobs.read(a.data));
    for (const s of a.import?.sources || [])
      if (isBlobRef(s.data)) s.data = toDataURI(blobs.read(s.data), "application/octet-stream");
  }
  for (const a of scene.audio?.assets ?? [])
    if (isBlobRef(a.data)) a.data = toDataURI(blobs.read(a.data), "audio/wav");
  return scene;
}
export async function referenceScene(
  input: SceneDocument,
  signal?: AbortSignal,
): Promise<SceneDocument> {
  const scene = structuredClone(input);
  let total = 0;
  for (const a of scene.assets) {
    signal?.throwIfAborted();
    const intern = async (data: string, hash?: string) => {
      if (isBlobRef(data)) {
        if (hash && data !== BLOB_PREFIX + hash) throw Error("Asset reference/hash mismatch");
        total += await blobs.sizeOf(data);
        return data;
      }
      const bytes = fromDataURI(data);
      total += bytes.length;
      if (total > PROJECT_MODEL_BYTES)
        throw Error("Project encoded source/artifact budget exceeds 480 MB");
      return blobs.put(bytes, hash);
    };
    a.data = await intern(a.data, a.import?.artifactHash);
    for (const s of a.import?.sources || []) {
      signal?.throwIfAborted();
      s.data = await intern(s.data, s.sha256);
    }
    if (total > PROJECT_MODEL_BYTES)
      throw Error("Project encoded source/artifact budget exceeds 480 MB");
  }
  let audioTotal = 0;
  for (const a of scene.audio?.assets ?? []) {
    signal?.throwIfAborted();
    if (isBlobRef(a.data)) audioTotal += await blobs.sizeOf(a.data);
    else {
      const reservation = assetMemory.reserve(12_000_000, "audio-source-intern");
      try {
        const bytes = await waveBytesAsync(a.data, signal ?? new AbortController().signal);
        inspectWave(bytes, a.mode === "stream");
        audioTotal += bytes.length;
        if (audioTotal > 8_000_000) throw Error("Audio source budget");
        a.data = await blobs.put(bytes);
      } finally {
        reservation.release();
      }
    }
    if (audioTotal > 8_000_000) throw Error("Audio source budget");
  }
  signal?.throwIfAborted();
  scene.version = input.version === 3 ? 3 : 2;
  return scene;
}

export async function materializeSceneAsync(input: SceneDocument) {
  const scene = structuredClone(input);
  scene.version = input.version === 3 ? 3 : 1;
  let total = 0,
    audioTotal = 0;
  const model = async (ref: string, mime?: string) => {
    const bytes = await blobs.readAsync(ref);
    total += bytes.length;
    if (total > PROJECT_MODEL_BYTES)
      throw Error("Project encoded source/artifact budget exceeds 480 MB");
    return toDataURI(bytes, mime);
  };
  for (const a of scene.assets) {
    if (isBlobRef(a.data)) a.data = await model(a.data);
    for (const s of a.import?.sources ?? [])
      if (isBlobRef(s.data)) s.data = await model(s.data, "application/octet-stream");
  }
  for (const a of scene.audio?.assets ?? [])
    if (isBlobRef(a.data)) {
      const bytes = await blobs.readAsync(a.data);
      audioTotal += bytes.length;
      if (audioTotal > 8_000_000) throw Error("Audio source budget");
      a.data = toDataURI(bytes, "audio/wav");
    }
  return scene;
}
