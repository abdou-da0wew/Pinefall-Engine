import { readFolder } from "./folder-format";
import { blobs, hashBytes, isBlobRef } from "../../assets/src/blobs";
import { projectRelativePath } from "./disk-path";
import { compileScript } from "../../scripting/src/compiler";

self.onmessage = async (
  event: MessageEvent<{ id: string; cached?: Record<string, { ref: string; bytes: number }> }>,
) => {
  try {
    if (!/^[a-f0-9-]{36}$/.test(event.data.id) || !blobs.persistent)
      throw Error("Native disk project reader unavailable");
    const hashes: Record<string, string> = Object.create(null);
    const paths: Record<string, string> = Object.create(null);
    const refs = new Map<string, { ref: string; bytes: number }>();
    const read = async (path: string, limit: number) => {
      projectRelativePath(path);
      const response = await fetch(
        `pinefall-project://${event.data.id}/${path.split("/").map(encodeURIComponent).join("/")}`,
        { cache: "no-store" },
      );
      if (!response.ok || !response.body)
        throw Error(`${path}: file unavailable (${response.status})`);
      const stream = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { value, done } = await stream.read();
          if (done) break;
          total += value.length;
          if (total > limit) throw Error(`${path}: file budget exceeded`);
          chunks.push(value);
        }
      } finally {
        await stream.cancel();
        stream.releaseLock();
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      chunks.length = 0;
      return bytes;
    };
    const scene = await readFolder({
      binding(identity, path) {
        paths[identity] = path;
      },
      async text(path, limit) {
        const bytes = await read(path, limit);
        hashes[path] = await hashBytes(bytes);
        try {
          return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          throw Error(`${path}: expected UTF-8 text`);
        }
      },
      async binary(path, limit) {
        const existing = refs.get(path);
        if (existing) return existing;
        const cached = event.data.cached?.[path];
        if (
          cached &&
          isBlobRef(cached.ref) &&
          cached.bytes <= limit &&
          (await blobs.sizeOf(cached.ref).catch(() => -1)) === cached.bytes
        ) {
          hashes[path] = cached.ref.slice("asset:sha256:".length);
          refs.set(path, cached);
          return cached;
        }
        const bytes = await read(path, limit);
        const ref = await blobs.put(bytes);
        const result = { ref, bytes: bytes.length };
        hashes[path] = ref.slice("asset:sha256:".length);
        refs.set(path, result);
        return result;
      },
    });
    const diagnostics: Array<{ file: string; message: string; severity: "error" }> = [];
    for (const script of scene.scripts ?? []) {
      try {
        compileScript(script.source, script.name);
      } catch (error) {
        diagnostics.push({
          file: paths[`script:${script.id}`] ?? script.name,
          message: String(error),
          severity: "error",
        });
      }
    }
    self.postMessage({ scene, hashes, paths, diagnostics, resources: Object.fromEntries(refs) });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
