import { packProject, unpackProject } from "./pif";
self.onmessage = async (event: MessageEvent) => {
  try {
    const result =
      event.data.operation === "pack"
        ? await packProject(event.data.scene)
        : await unpackProject(event.data.bytes);
    self.postMessage(
      { result },
      result instanceof Uint8Array ? [result.buffer as ArrayBuffer] : [],
    );
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
