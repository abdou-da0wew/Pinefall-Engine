import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { inspectGlb, fromDataURI } from "./glb";
import { encodeModel, transfers } from "./wire";
import { LoadingManager } from "three";
// One request per disposable worker: no re-entrant loader state, no stale result after termination.
self.onmessage = async (event: MessageEvent<{ data?: string; bytes?: Uint8Array }>) => {
  const started = performance.now();
  try {
    self.postMessage({ stage: "inspect" });
    const bytes = event.data.bytes || fromDataURI(event.data.data!),
      report = inspectGlb(bytes);
    const manager = new LoadingManager();
    manager.setURLModifier((url) => {
      if (!url.startsWith("blob:") && !url.startsWith("data:"))
        throw Error("External model resources forbidden");
      return url;
    });
    self.postMessage({ stage: "parse" });
    const gltf = await new GLTFLoader(manager).parseAsync(bytes.buffer as ArrayBuffer, "");
    gltf.scene.animations = gltf.animations;
    self.postMessage({ stage: "validate" });
    const wire = encodeModel(gltf.scene);
    self.postMessage(
      { wire, report, workerMs: performance.now() - started },
      { transfer: transfers(wire) },
    );
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
