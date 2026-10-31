import { fromDataURI } from "./glb";
import * as T from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { workerJob, type JobUpdate } from "./jobs";
import { decodeModel, disposeModel, closeWire, type ModelWire } from "./wire";
import type { ModelInspection } from "./glb";
export interface ModelLease {
  root: T.Object3D;
  release: () => void;
}
interface Entry {
  root: T.Object3D;
  bytes: number;
  owners: Set<string>;
  touched: number;
}
/** Cache owns shared resources; leases own cloned skeletons, never shared geometry/materials. */
export class ModelCache {
  private entries = new Map<string, Entry>();
  private dead = false;
  readonly metrics = { parses: 0, hits: 0, bytes: 0, leases: 0 };
  async prepare(data: string, signal: AbortSignal, onStage?: (u: JobUpdate) => void) {
    if (this.dead) throw Error("Asset cache disposed");
    signal.throwIfAborted();
    if (this.entries.has(data)) {
      this.metrics.hits++;
      return;
    }
    const result = await workerJob<{ wire: ModelWire; report: ModelInspection; workerMs: number }>(
      () => new Worker(new URL("./model.worker.ts", import.meta.url), { type: "module" }),
      { bytes: fromDataURI(data) },
      signal,
      onStage,
    );
    if (signal.aborted || this.dead) {
      closeWire(result.wire);
      signal.throwIfAborted();
      throw Error("Cache disposed");
    }
    const root = await decodeModel(result.wire, signal);
    if (signal.aborted || this.dead) {
      disposeModel(root);
      signal.throwIfAborted();
      throw Error("Cache disposed");
    }
    if (this.entries.has(data)) {
      disposeModel(root);
      this.metrics.hits++;
      return;
    }
    this.trim(result.wire.bytes);
    if (this.metrics.bytes + result.wire.bytes > 128 * 1024 * 1024) {
      disposeModel(root);
      throw Error("Live model cache exceeds 128 MiB; unload unused assets first");
    }
    this.entries.set(data, {
      root,
      bytes: result.wire.bytes,
      owners: new Set(),
      touched: performance.now(),
    });
    this.metrics.bytes += result.wire.bytes;
    this.metrics.parses++;
  }
  acquire(data: string, owner: string): ModelLease {
    const entry = this.entries.get(data);
    if (!entry || this.dead) throw Error("Model not prepared");
    if (entry.owners.has(owner)) throw Error("Duplicate asset lease owner");
    const root = clone(entry.root);
    entry.owners.add(owner);
    entry.touched = performance.now();
    this.metrics.leases++;
    let released = false;
    return {
      root,
      release: () => {
        if (released) return;
        released = true;
        root.removeFromParent();
        const skeletons = new Set<T.Skeleton>();
        root.traverse((o) => {
          if (o instanceof T.SkinnedMesh) skeletons.add(o.skeleton);
        });
        for (const skeleton of skeletons) skeleton.dispose();
        entry.owners.delete(owner);
        this.metrics.leases--;
      },
    };
  }
  private trim(incoming: number) {
    for (const [key, e] of [...this.entries].sort((a, b) => a[1].touched - b[1].touched)) {
      if (this.metrics.bytes + incoming <= 128 * 1024 * 1024 && this.entries.size < 16) break;
      if (!e.owners.size) {
        disposeModel(e.root);
        this.entries.delete(key);
        this.metrics.bytes -= e.bytes;
      }
    }
  }
  dispose() {
    this.dead = true;
    for (const e of this.entries.values()) disposeModel(e.root);
    this.entries.clear();
    this.metrics.bytes = 0;
  }
}
