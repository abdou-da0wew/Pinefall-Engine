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
        total += blobs.byteLength(data);
        return data;
      }
      const bytes = fromDataURI(data);
      total += bytes.length;
      if (total > 8_000_000) throw Error("Project decoded source/artifact budget exceeds 8 MB");
      return blobs.put(bytes, hash);
    };
    a.data = await intern(a.data, a.import?.artifactHash);
    for (const s of a.import?.sources || []) {
      signal?.throwIfAborted();
      s.data = await intern(s.data, s.sha256);
    }
    if (total > 8_000_000) throw Error("Project decoded source/artifact budget exceeds 8 MB");
  }
  let audioTotal = 0;
  for (const a of scene.audio?.assets ?? []) {
    signal?.throwIfAborted();
    if (isBlobRef(a.data)) audioTotal += blobs.byteLength(a.data);
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
