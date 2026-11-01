import { SourceDiagnostics, type SourceDiagnostic } from "../../scripting/src/diagnostics-client";
import type { DiskProjectAPI, DiskProjectGrant } from "./disk-api";
import { folderLayout, type FolderLayout } from "./folder-format";
import type { SceneDocument } from "../../runtime/src/schema";
import { referenceScene } from "../../assets/src/documents";
import { blobs, hashBytes, BLOB_PREFIX } from "../../assets/src/blobs";
import { assetMemory } from "../../assets/src/budget";
export interface FolderSnapshot {
  scene: SceneDocument;
  hashes: Record<string, string>;
  paths: Record<string, string>;
  resources: Record<string, { ref: string; bytes: number }>;
  diagnostics: SourceDiagnostic[];
}
export class FolderSession {
  readonly hashes = new Map<string, string>();
  layout?: FolderLayout;
  boundProjectId?: string;
  private saving = false;
  private lifetime = new AbortController();
  private checker = new SourceDiagnostics();
  private dirty = new Set<string>();
  private resources: Record<string, { ref: string; bytes: number }> = {};
  constructor(
    readonly api: DiskProjectAPI,
    readonly grant: DiskProjectGrant,
  ) {}
  async save(scene: SceneDocument, signal?: AbortSignal) {
    signal = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal;
    signal.throwIfAborted();
    if (!this.boundProjectId && this.grant.entries.length)
      throw Error("Apply the selected disk project before saving editor changes");
    if (this.boundProjectId && this.boundProjectId !== scene.project?.id)
      throw Error("The folder belongs to a different project");
    if (this.saving) throw Error("Project folder save already running");
    this.saving = true;
    try {
      const layout = await folderLayout(await referenceScene(scene, signal), this.layout?.paths);
      // Write the manifest last. Existing external edits are never force-overwritten.
      const entries = [...layout.files].sort(
        ([a], [b]) => Number(a === "project.json") - Number(b === "project.json"),
      );
      for (const [path, value] of entries) {
        signal?.throwIfAborted();
        const desired =
          typeof value === "string"
            ? await hashBytes(new TextEncoder().encode(value))
            : value.ref.slice(BLOB_PREFIX.length);
        const baseline = this.hashes.get(path);
        // Preserve unapplied external edits when the editor has not changed this file.
        if (baseline === desired) continue;
        const actual = await this.api.hash(this.grant.id, path);
        if (actual === desired) {
          this.hashes.set(path, desired);
          continue;
        }
        if (actual !== (baseline ?? null))
          throw Error("External edit conflict; validate/apply before saving: " + path);
        const encoded = typeof value === "string" ? new TextEncoder().encode(value) : undefined;
        if (encoded && encoded.length <= 1048576) {
          await this.api.write(this.grant.id, path, encoded, actual);
        } else {
          const ref = typeof value === "string" ? undefined : value.ref;
          const total = encoded?.length ?? (await blobs.sizeOf(ref!));
          const ticket = await this.api.beginUpload(this.grant.id, path, total, actual);
          try {
            for (let offset = 0; offset < total;) {
              signal?.throwIfAborted();
              const length = Math.min(1048576, total - offset);
              const bytes = encoded
                ? encoded.subarray(offset, offset + length)
                : await blobs.readRange(ref!, offset, length);
              if (!bytes.length) throw Error("Source file truncated during export");
              offset = await this.api.appendUpload(this.grant.id, ticket, offset, bytes);
            }
            signal?.throwIfAborted();
            await this.api.finishUpload(this.grant.id, ticket, desired);
          } finally {
            await this.api.cancelUpload(this.grant.id, ticket);
          }
        }
        this.hashes.set(path, desired);
        if (typeof value !== "string")
          this.resources[path] = { ref: value.ref, bytes: await blobs.sizeOf(value.ref) };
      }
      this.layout = layout;
      this.boundProjectId = scene.project?.id;
    } finally {
      this.saving = false;
    }
  }
  read(signal?: AbortSignal, changedPaths?: string[]): Promise<FolderSnapshot> {
    signal = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal;
    for (const path of changedPaths ?? []) this.dirty.add(path);
    return new Promise((resolve, reject) => {
      let settled = false;
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const reservation = assetMemory.reserve(1024 * 1024 * 1024, "folder-reader-worker");
      let worker: Worker;
      try {
        worker = new Worker(new URL("./folder.worker.ts", import.meta.url), { type: "module" });
      } catch (error) {
        reservation.release();
        reject(error);
        return;
      }
      const cleanup = () => {
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        worker.terminate();
        reservation.release();
      };
      const abort = () => {
        cleanup();
        reject(signal?.reason ?? Error("Folder validation cancelled"));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(Error("Folder validation deadline"));
      }, 600000);
      signal?.addEventListener("abort", abort, { once: true });
      worker.onerror = (event) => {
        cleanup();
        reject(Error(event.message));
      };
      worker.onmessageerror = () => {
        cleanup();
        reject(Error("Folder worker response invalid"));
      };
      worker.onmessage = async (event) => {
        if (settled) return;
        cleanup();
        if (event.data.error) reject(Error(event.data.error));
        else {
          try {
            const snapshot = event.data as FolderSnapshot;
            const semantic = await this.checker.check(
              snapshot.scene.scripts ?? [],
              snapshot.paths,
              signal,
            );
            signal?.throwIfAborted();
            snapshot.diagnostics = [...snapshot.diagnostics, ...semantic].slice(0, 128);
            this.resources = snapshot.resources;
            this.dirty.clear();
            resolve(snapshot);
          } catch (error) {
            reject(error);
          }
        }
      };
      const cached = changedPaths
        ? Object.fromEntries(
            Object.entries(this.resources).filter(
              ([path]) =>
                ![...this.dirty].some(
                  (changed) => path === changed || path.startsWith(changed + "/"),
                ),
            ),
          )
        : undefined;
      worker.postMessage({ id: this.grant.id, cached });
    });
  }
  dispose() {
    this.lifetime.abort(Error("Folder session closed"));
    this.checker.dispose();
    void this.api.close(this.grant.id).catch(() => {});
  }
  async accept(snapshot: FolderSnapshot, signal?: AbortSignal) {
    signal = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal;
    signal.throwIfAborted();
    if (snapshot.diagnostics.length) throw Error("Resolve file diagnostics before applying");
    for (const [path, hash] of Object.entries(snapshot.hashes)) {
      signal?.throwIfAborted();
      if ((await this.api.hash(this.grant.id, path)) !== hash)
        throw Error("File changed after validation: " + path);
    }
    signal?.throwIfAborted();
    return folderLayout(snapshot.scene, snapshot.paths);
  }
  adopt(snapshot: FolderSnapshot, layout: FolderLayout) {
    this.resources = snapshot.resources;
    this.boundProjectId = snapshot.scene.project?.id;
    this.hashes.clear();
    for (const [path, hash] of Object.entries(snapshot.hashes)) this.hashes.set(path, hash);
    this.layout = layout;
  }
}
