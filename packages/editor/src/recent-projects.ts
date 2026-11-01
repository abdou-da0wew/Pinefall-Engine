import { ARCHIVE_BYTES } from "../../assets/src/limits";
import type { SceneDocument } from "../../runtime/src/schema";
import { projectJob } from "../../project/src/pif-client";
export interface RecentProject {
  id: string;
  name: string;
  template: string;
  updated: number;
  bytes: number;
}
export function validateRecentRows(input: unknown): RecentProject[] {
  if (!Array.isArray(input) || input.length > 12) throw Error("Invalid recent project inventory");
  const ids = new Set<string>();
  return input.map((row) => {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.id !== "string" ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(row.id) ||
      ids.has(row.id) ||
      typeof row.name !== "string" ||
      !row.name ||
      row.name.length > 100 ||
      !["adventure", "first-person", "driving", "sandbox"].includes(row.template) ||
      !Number.isFinite(row.updated) ||
      row.updated < 0 ||
      !Number.isInteger(row.bytes) ||
      row.bytes < 1 ||
      row.bytes > ARCHIVE_BYTES
    )
      throw Error("Invalid recent project metadata; use your PIF backup");
    ids.add(row.id);
    return {
      id: row.id,
      name: row.name,
      template: row.template,
      updated: row.updated,
      bytes: row.bytes,
    };
  });
}
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("pinefall-recent-projects-v1", 1);
    let blocked = false;
    r.onupgradeneeded = () => {
      r.result.createObjectStore("metadata", { keyPath: "id" });
      r.result.createObjectStore("archives");
    };
    r.onblocked = () => {
      blocked = true;
      reject(Error("Recent projects database is blocked by another window"));
    };
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      if (blocked) {
        r.result.close();
        return;
      }
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
  });
}
function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? Error("Project storage transaction aborted"));
    tx.onerror = () => {};
  });
}
export async function listRecentProjects() {
  const db = await open();
  try {
    const tx = db.transaction("metadata", "readonly"),
      finished = done(tx),
      r = tx.objectStore("metadata").getAll();
    const rows = await new Promise<RecentProject[]>((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await finished;
    return validateRecentRows(rows).sort((a, b) => b.updated - a.updated);
  } finally {
    db.close();
  }
}
export async function rememberProject(
  scene: SceneDocument,
  packed?: Uint8Array,
  signal?: AbortSignal,
) {
  if (!scene.project?.id) throw Error("Project identity missing");
  const archive = packed ?? (await projectJob("pack", scene, signal)),
    entry: RecentProject = {
      id: scene.project.id,
      name: scene.name,
      template: scene.template,
      updated: Date.now(),
      bytes: archive.length,
    };
  validateRecentRows([entry]);
  if (signal?.aborted) throw Error("Recent snapshot cancelled");
  const db = await open();
  try {
    const tx = db.transaction(["metadata", "archives"], "readwrite"),
      finished = done(tx),
      store = tx.objectStore("metadata"),
      r = store.getAll();
    let budget = false;
    r.onsuccess = () => {
      let other: RecentProject[];
      try {
        other = validateRecentRows(r.result).filter((e) => e.id !== entry.id);
      } catch {
        tx.abort();
        return;
      }
      if (
        other.length >= 12 ||
        other.reduce((n, e) => n + e.bytes, archive.length) > ARCHIVE_BYTES * 2
      ) {
        budget = true;
        tx.abort();
        return;
      }
      store.put(entry);
      tx.objectStore("archives").put(new Blob([new Uint8Array(archive)]), entry.id);
    };
    try {
      await finished;
    } catch (error) {
      if (budget)
        throw Error(
          "Recent-project storage full (12 projects / 1 GiB). Remove a saved snapshot or export a PIF backup.",
        );
      throw error;
    }
  } finally {
    db.close();
  }
}
export { openLocalSnapshot as openRecentProject } from "../../project/src/local-snapshot";
export async function removeRecentProject(id: string) {
  const db = await open();
  try {
    const tx = db.transaction(["metadata", "archives"], "readwrite"),
      finished = done(tx);
    tx.objectStore("metadata").delete(id);
    tx.objectStore("archives").delete(id);
    await finished;
  } finally {
    db.close();
  }
}
