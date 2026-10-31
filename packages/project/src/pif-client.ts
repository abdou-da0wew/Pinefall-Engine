import { blobs } from "../../assets/src/blobs";
import { sceneReferences } from "../../assets/src/documents";
import type { SceneDocument } from "../../runtime/src/schema";
export function projectJob(
  operation: "pack",
  value: SceneDocument,
  signal?: AbortSignal,
): Promise<Uint8Array>;
export function projectJob(
  operation: "unpack",
  value: Uint8Array,
  signal?: AbortSignal,
): Promise<SceneDocument>;
export function projectJob(
  operation: "pack" | "unpack",
  value: SceneDocument | Uint8Array,
  signal?: AbortSignal,
): Promise<Uint8Array | SceneDocument> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Project operation cancelled"));
      return;
    }
    const worker = new Worker(new URL("./pif.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
      clearTimeout(timeout);
    };
    const abort = () => {
      cleanup();
      reject(new Error("Project operation cancelled"));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Project operation timed out"));
    }, 120000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = async (event) => {
      worker.terminate();
      try {
        if (event.data.error) throw Error(event.data.error);
        if (event.data.blobs) await blobs.admit(event.data.blobs);
        signal?.throwIfAborted();
        resolve(event.data.result);
      } catch (e) {
        reject(e);
      } finally {
        cleanup();
      }
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message));
    };
    try {
      worker.postMessage(
        operation === "pack"
          ? {
              operation,
              scene: value,
              blobs: blobs.entries(sceneReferences(value as SceneDocument)),
            }
          : { operation, bytes: value },
        value instanceof Uint8Array ? [value.buffer] : [],
      );
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
