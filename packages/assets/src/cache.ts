import { cloneModel } from "./clone";
import { assetMemory, type Reservation } from "./budget";
import { readAssetBytes } from "./glb";
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
  reservation: Reservation;
  instanceBytes: number;
}
/** Cache owns shared resources; leases own cloned skeletons, never shared geometry/materials. */
export class ModelCache {
  constructor(readonly budget = assetMemory) {}
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
    // Covers bounded worker output + host reconstruction while old prototypes remain leased.
    const reservation = this.budget.reserve(800 * 1024 * 1024, "model-decode");
    let retained = false;
    try {
      const bytes = await readAssetBytes(data);
      signal.throwIfAborted();
      const result = await workerJob<{
        wire: ModelWire;
        report: ModelInspection;
        workerMs: number;
      }>(
        () => new Worker(new URL("./model.worker.ts", import.meta.url), { type: "module" }),
        { bytes },
        signal,
        onStage,
        0, // the preparation reservation spans both worker and host decode
        [bytes.buffer as ArrayBuffer],
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
      if (this.metrics.bytes + result.wire.bytes > 256 * 1024 * 1024) {
        disposeModel(root);
        throw Error("Live model cache exceeds 256 MiB; unload unused assets first");
      }
      let instanceBytes = 0;
      root.traverse((o) => {
        instanceBytes += 2048 + JSON.stringify(o.userData).length * 2;
        if (o instanceof T.SkinnedMesh) instanceBytes += o.skeleton.bones.length * 256;
      });
      // Keep a conservative host/GPU resource allowance after transient decode ends.
      try {
        reservation.resize(result.wire.bytes * 2 + instanceBytes);
      } catch (error) {
        disposeModel(root);
        throw error;
      }
      this.entries.set(data, {
        root,
        bytes: result.wire.bytes,
        owners: new Set(),
        touched: performance.now(),
        reservation,
        instanceBytes,
      });
      this.metrics.bytes += result.wire.bytes;
      this.metrics.parses++;
      retained = true;
    } finally {
      if (!retained) reservation.release();
    }
  }
  acquire(data: string, owner: string): ModelLease {
    const entry = this.entries.get(data);
    if (!entry || this.dead) throw Error("Model not prepared");
    if (entry.owners.has(owner)) throw Error("Duplicate asset lease owner");
    const reservation = this.budget.reserve(entry.instanceBytes, "model-instance");
    let root: T.Object3D;
    try {
      root = clone(entry.root);
    } catch (error) {
      reservation.release();
      throw error;
    }
    entry.owners.add(owner);
    entry.touched = performance.now();
    this.metrics.leases++;
    return this.finishLease(root, entry, owner, reservation);
  }
  async acquireAsync(data: string, owner: string, signal: AbortSignal): Promise<ModelLease> {
    signal.throwIfAborted();
    const entry = this.entries.get(data);
    if (!entry || this.dead) throw Error("Model not prepared");
    if (entry.owners.has(owner)) throw Error("Duplicate asset lease owner");
    const reservation = this.budget.reserve(entry.instanceBytes, "model-instance");
    entry.owners.add(owner);
    this.metrics.leases++;
    let root: T.Object3D | undefined;
    try {
      root = await cloneModel(entry.root, signal);
      signal.throwIfAborted();
      if (this.dead || this.entries.get(data) !== entry) throw Error("Cache disposed");
      entry.touched = performance.now();
      return this.finishLease(root, entry, owner, reservation);
    } catch (error) {
      if (root)
        root.traverse((o) => {
          if (o instanceof T.SkinnedMesh) o.skeleton.dispose();
        });
      entry.owners.delete(owner);
      this.metrics.leases--;
      reservation.release();
      throw error;
    }
  }
  private finishLease(
    root: T.Object3D,
    entry: Entry,
    owner: string,
    reservation: Reservation,
  ): ModelLease {
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
        reservation.release();
      },
    };
  }
  private trim(incoming: number) {
    for (const [key, e] of [...this.entries].sort((a, b) => a[1].touched - b[1].touched)) {
      if (this.metrics.bytes + incoming <= 256 * 1024 * 1024 && this.entries.size < 16) break;
      if (!e.owners.size) {
        disposeModel(e.root);
        e.reservation.release();
        this.entries.delete(key);
        this.metrics.bytes -= e.bytes;
      }
    }
  }
  /** Small idle working cache avoids decode thrash; never retain the entire asset library. */
  pruneUnused(maxIdleBytes = 8 * 1024 * 1024) {
    let retained = 0,
      count = 0;
    for (const [key, entry] of [...this.entries].sort((a, b) => b[1].touched - a[1].touched)) {
      if (entry.owners.size) continue;
      const cost = entry.bytes * 2 + entry.instanceBytes;
      if (count < 4 && retained + cost <= maxIdleBytes) {
        retained += cost;
        count++;
        continue;
      }
      disposeModel(entry.root);
      entry.reservation.release();
      this.entries.delete(key);
      this.metrics.bytes -= entry.bytes;
    }
  }
  dispose() {
    this.dead = true;
    for (const e of this.entries.values()) {
      disposeModel(e.root);
      e.reservation.release();
    }
    this.entries.clear();
    this.metrics.bytes = 0;
  }
}
