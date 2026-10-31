import { blobs } from "../../assets/src/blobs";
import { referenceScene, sceneReferences } from "../../assets/src/documents";
import { packProject, unpackProject } from "./pif";
self.onmessage = async (event: MessageEvent) => {
  try {
    if (event.data.blobs) await blobs.admit(event.data.blobs);
    let result =
      event.data.operation === "pack"
        ? await packProject(event.data.scene)
        : await unpackProject(event.data.bytes);
    if (!(result instanceof Uint8Array)) result = await referenceScene(result);
    const inventory = result instanceof Uint8Array ? [] : blobs.entries(sceneReferences(result));
    self.postMessage(
      {
        result,
        ...(result instanceof Uint8Array ? {} : { blobs: inventory }),
      },
      result instanceof Uint8Array
        ? [result.buffer as ArrayBuffer]
        : inventory.map((entry) => entry.bytes.buffer as ArrayBuffer),
    );
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
