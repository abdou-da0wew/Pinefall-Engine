import { open, rename, unlink, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
/** Native/CLI boundary only. Stage beside the target, flush, then replace by same-filesystem rename.
 * Directory fsync is best effort; network filesystems and sudden hardware failure have different guarantees. */
export async function atomicWrite(path: string, data: string | Uint8Array, signal?: AbortSignal) {
  signal?.throwIfAborted();
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + ".tmp-" + crypto.randomUUID();
  let committed = false;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(data);
      await file.sync();
    } finally {
      await file.close();
    }
    signal?.throwIfAborted();
    await rename(temporary, path);
    committed = true;
    try {
      const directory = await open(dirname(path), "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } catch {
      /* Directory sync is not portable to all supported filesystems. */
    }
  } finally {
    if (!committed) await unlink(temporary).catch(() => {});
  }
}
