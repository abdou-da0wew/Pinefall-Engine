import { projectJob } from "./pif-client";
/** Shared local snapshot reader: no editor/React dependency in the standalone player. */
export async function openLocalSnapshot(id: string) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))
    throw Error("Invalid project snapshot identity");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("pinefall-recent-projects-v1", 1);
    let abandoned = false;
    r.onupgradeneeded = () => {
      r.transaction?.abort();
    };
    r.onerror = () => reject(Error("Project snapshot storage is unavailable"));
    r.onblocked = () => {
      abandoned = true;
      reject(Error("Project snapshot storage is blocked by another window"));
    };
    r.onsuccess = () => {
      if (abandoned) {
        r.result.close();
        return;
      }
      resolve(r.result);
    };
  });
  let bytes: Uint8Array;
  try {
    const tx = db.transaction("archives", "readonly"),
      r = tx.objectStore("archives").get(id);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? Error("Snapshot read aborted"));
      tx.onerror = () => {};
    });
    const result = new Promise<Uint8Array>((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    [bytes] = await Promise.all([result, done]);
  } finally {
    db.close();
  }
  if (!(bytes instanceof Uint8Array) || bytes.length > 16 * 1024 * 1024)
    throw Error("Recent snapshot is missing or invalid; open your PIF backup.");
  const scene = await projectJob("unpack", bytes);
  if (scene.project?.id !== id) throw Error("Project snapshot identity mismatch");
  return scene;
}
