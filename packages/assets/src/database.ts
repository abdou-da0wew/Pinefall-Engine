import { blobs, type BlobEntry, isBlobRef } from "./blobs";
import { sceneReferences, referenceScene } from "./documents";
import { parseScene, type SceneDocument } from "../../runtime/src/schema";
export interface StoredArtifact {
  key: string;
  refs: string[];
  value: unknown;
  created: number;
  bytes: number;
}
interface Checkpoint {
  scene: SceneDocument;
  refs: string[];
  revision: number;
}
/** One origin-local database. Portable PIF remains the backup, not this evictable browser store. */
export class AssetDatabase {
  private recoveredPrevious = false;
  private opening?: Promise<IDBDatabase>;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(readonly name = "pinefall-assets-v1") {}
  private open() {
    if (!this.opening)
      this.opening = new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
          reject(Error("Persistent asset storage unavailable"));
          return;
        }
        let abandoned = false;
        const request = indexedDB.open(this.name, 1);
        request.onupgradeneeded = () => {
          for (const store of ["blobs", "artifacts", "checkpoints"])
            request.result.createObjectStore(store);
        };
        request.onerror = () => reject(request.error || Error("Asset database open failed"));
        request.onblocked = () => {
          abandoned = true;
          reject(Error("Asset database upgrade blocked by another window"));
        };
        request.onsuccess = () => {
          const db = request.result;
          if (abandoned) {
            db.close();
            return;
          }
          db.onversionchange = () => {
            db.close();
            this.opening = undefined;
          };
          resolve(db);
        };
      }).catch((e) => {
        this.opening = undefined;
        throw e;
      });
    return this.opening;
  }
  private done(tx: IDBTransaction) {
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || Error("Asset transaction aborted"));
      tx.onerror = () => {
        /* abort owns final failure */
      };
    });
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const p = this.tail.catch(() => {}).then(work);
    this.tail = p;
    return p;
  }
  private async read<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    const db = await this.open(),
      tx = db.transaction(store, "readonly"),
      done = this.done(tx),
      request = tx.objectStore(store).get(key);
    const result = new Promise<T | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return (await Promise.all([result, done]))[0];
  }
  private async hydrate(refs: string[]) {
    if (!Array.isArray(refs) || refs.length > 100 || refs.some((r) => !isBlobRef(r)))
      throw Error("Invalid database references");
    const entries: BlobEntry[] = [];
    let total = 0;
    // Hash verification occurs after readonly transactions finish, never across an active write transaction.
    for (const ref of refs) {
      const bytes = await this.read<Uint8Array>("blobs", ref);
      if (!(bytes instanceof Uint8Array)) throw Error("Missing stored blob: " + ref);
      total += bytes.length;
      if (total > 8_000_000) throw Error("Stored blob inventory exceeds project budget");
      entries.push({ ref, bytes });
    }
    await blobs.admit(entries);
  }
  saveCheckpoint(scene: SceneDocument, revision: number) {
    return this.serial(async () => {
      const normalized = await referenceScene(parseScene(scene)),
        refs = [...sceneReferences(normalized)],
        entries = blobs.entries(refs),
        db = await this.open();
      const tx = db.transaction(["blobs", "checkpoints"], "readwrite", { durability: "strict" }),
        done = this.done(tx),
        store = tx.objectStore("checkpoints");
      const old = store.get("current");
      old.onsuccess = () => {
        try {
          if (old.result && !this.recoveredPrevious) store.put(old.result, "previous");
          store.put({ scene: normalized, refs, revision } satisfies Checkpoint, "current");
        } catch {
          tx.abort();
        }
      };
      try {
        for (const entry of entries) tx.objectStore("blobs").put(entry.bytes, entry.ref);
      } catch {
        tx.abort();
      }
      await done;
      this.recoveredPrevious = false;
      try {
        await this.prune();
      } catch {
        /* committed checkpoint remains valid if cache maintenance fails */
      }
    });
  }
  async restoreCheckpoint() {
    let last: unknown;
    for (const slot of ["current", "previous"]) {
      const record = await this.read<Checkpoint>("checkpoints", slot);
      if (!record) continue;
      try {
        const scene = parseScene(record.scene);
        await this.hydrate([...sceneReferences(scene)]);
        this.recoveredPrevious = slot === "previous";
        return { scene, recovered: slot === "previous", revision: record.revision };
      } catch (e) {
        last = e;
      }
    }
    if (last) throw last;
    return undefined;
  }
  async getArtifact(key: string) {
    const item = await this.read<StoredArtifact>("artifacts", key);
    if (!item) return undefined;
    try {
      await this.hydrate(item.refs);
      return item.value;
    } catch {
      await this.serial(async () => {
        const db = await this.open(),
          tx = db.transaction("artifacts", "readwrite"),
          done = this.done(tx);
        tx.objectStore("artifacts").delete(key);
        await done;
      });
      return undefined;
    }
  }
  putArtifact(key: string, value: unknown, refs: Iterable<string>) {
    return this.serial(async () => {
      const entries = blobs.entries(refs),
        bytes = entries.reduce((n, e) => n + e.bytes.length, 0);
      if (bytes > 8_000_000) throw Error("Artifact cache entry exceeds budget");
      const db = await this.open(),
        tx = db.transaction(["blobs", "artifacts"], "readwrite"),
        done = this.done(tx),
        store = tx.objectStore("artifacts");
      try {
        for (const e of entries) tx.objectStore("blobs").put(e.bytes, e.ref);
        store.put(
          {
            key,
            value,
            refs: entries.map((e) => e.ref),
            created: Date.now(),
            bytes,
          } satisfies StoredArtifact,
          key,
        );
      } catch {
        tx.abort();
      }
      await done;
      await this.prune();
    });
  }
  /** Delete only unreferenced blobs: current+previous checkpoints survive cache eviction. */
  private async prune() {
    const db = await this.open(),
      tx = db.transaction(["artifacts", "checkpoints", "blobs"], "readwrite"),
      done = this.done(tx);
    const artifacts = tx.objectStore("artifacts").getAll(),
      checkpoints = tx.objectStore("checkpoints").getAll();
    let a: StoredArtifact[] | undefined, c: Checkpoint[] | undefined;
    const process = () => {
      if (!a || !c) return;
      const keep = new Set(c.flatMap((x) => x.refs));
      let total = 0,
        count = 0;
      for (const item of a.sort((x, y) => y.created - x.created)) {
        if (++count > 32 || total + item.bytes > 64 * 1024 * 1024)
          tx.objectStore("artifacts").delete(item.key);
        else {
          total += item.bytes;
          for (const ref of item.refs) keep.add(ref);
        }
      }
      const cursor = tx.objectStore("blobs").openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        if (!keep.has(String(row.key))) row.delete();
        row.continue();
      };
    };
    artifacts.onsuccess = () => {
      a = artifacts.result;
      process();
    };
    checkpoints.onsuccess = () => {
      c = checkpoints.result;
      process();
    };
    await done;
  }
  clearArtifacts() {
    return this.serial(async () => {
      const db = await this.open(),
        tx = db.transaction("artifacts", "readwrite"),
        done = this.done(tx);
      tx.objectStore("artifacts").clear();
      await done;
      await this.prune();
    });
  }
}
export const assetDatabase = new AssetDatabase();
