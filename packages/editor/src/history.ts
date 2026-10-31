import { cloneScene, parseScene } from "../../runtime/src/schema";
import type { SceneDocument } from "../../runtime/src/schema";
/** Snapshot history with binary-string interning. No repeated GLB/source payload per transform edit. */
export class History {
  private past: string[] = [];
  private future: string[] = [];
  private blobs = new Map<string, string>();
  private blobSizes = new Map<string, number>();
  private encoder = new TextEncoder();
  private sequence = 0;
  private encode(scene: SceneDocument) {
    const snapshot = cloneScene(scene);
    const intern = (data: string) => {
      for (const [id, value] of this.blobs) if (value === data) return id;
      const id = `history-blob:${++this.sequence}`;
      this.blobs.set(id, data);
      this.blobSizes.set(id, this.encoder.encode(data).byteLength);
      return id;
    };
    for (const asset of snapshot.assets) {
      asset.data = intern(asset.data);
      if (asset.import)
        for (const source of asset.import.sources) source.data = intern(source.data);
    }
    return JSON.stringify(snapshot);
  }
  private decode(text: string) {
    const snapshot = JSON.parse(text) as SceneDocument;
    const get = (id: string) => {
      const data = this.blobs.get(id);
      if (data === undefined) throw Error("History blob missing");
      return data;
    };
    for (const asset of snapshot.assets) {
      asset.data = get(asset.data);
      if (asset.import) for (const source of asset.import.sources) source.data = get(source.data);
    }
    return parseScene(snapshot);
  }
  private collect() {
    const refs = new Set<string>();
    for (const text of [...this.past, ...this.future])
      for (const match of text.matchAll(/history-blob:\d+/g)) refs.add(match[0]);
    for (const key of this.blobs.keys())
      if (!refs.has(key)) {
        this.blobs.delete(key);
        this.blobSizes.delete(key);
      }
  }
  get retainedBytes() {
    return (
      [...this.past, ...this.future].reduce(
        (n, text) => n + this.encoder.encode(text).byteLength,
        0,
      ) + [...this.blobSizes.values()].reduce((n, bytes) => n + bytes, 0)
    );
  }
  private trim() {
    this.collect();
    while (this.past.length + this.future.length > 20 || this.retainedBytes > 32 * 1024 * 1024) {
      if (this.past.length) this.past.shift();
      else if (this.future.length) this.future.shift();
      else break;
      this.collect();
    }
  }
  commit(scene: SceneDocument) {
    this.past.push(this.encode(scene));
    this.future = [];
    this.trim();
  }
  undo(current: SceneDocument) {
    const previous = this.past.pop();
    if (!previous) return null;
    const result = this.decode(previous);
    this.future.push(this.encode(current));
    this.trim();
    return result;
  }
  redo(current: SceneDocument) {
    const next = this.future.pop();
    if (!next) return null;
    const result = this.decode(next);
    this.past.push(this.encode(current));
    this.trim();
    return result;
  }
  reset() {
    this.past = [];
    this.future = [];
    this.blobs.clear();
    this.blobSizes.clear();
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  copy(scene: SceneDocument) {
    return cloneScene(scene);
  }
}
