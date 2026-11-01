import { MODEL_BYTES, PROJECT_MODEL_BYTES } from "./limits";
import { assetMemory } from "./budget";
/** Immutable, content-addressed session blobs. Disk transport must verify hashes before admission. */
export const BLOB_PREFIX = "asset:sha256:";
export const isBlobRef = (value: unknown): value is `asset:sha256:${string}` =>
  typeof value === "string" && /^asset:sha256:[a-f0-9]{64}$/.test(value);
export async function hashBytes(bytes: Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        bytes.buffer instanceof ArrayBuffer
          ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
          : new Uint8Array(bytes),
      ),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export interface BlobEntry {
  ref: string;
  bytes: Uint8Array;
}
export class BlobStore {
  readonly persistent: boolean = false;
  private data = new Map<string, Uint8Array>();
  private size = 0;
  constructor(readonly limit = PROJECT_MODEL_BYTES) {}
  get bytes() {
    return this.size;
  }
  get count() {
    return this.data.size;
  }
  has(ref: string) {
    return this.data.has(ref);
  }
  async put(input: Uint8Array, expected?: string) {
    if (input.byteLength > MODEL_BYTES) throw Error("Blob exceeds 200 MB admission limit");
    const bytes = new Uint8Array(input),
      hash = await hashBytes(bytes);
    if (expected !== undefined && expected !== hash) throw Error("Blob hash mismatch");
    const ref = BLOB_PREFIX + hash;
    if (!this.data.has(ref)) {
      if (this.size + bytes.byteLength > this.limit)
        throw Error(
          "Session blob budget exhausted. Save the project and restart to release old history.",
        );
      this.data.set(ref, bytes);
      this.size += bytes.byteLength;
    }
    return ref;
  }
  byteLength(ref: string) {
    const bytes = this.data.get(ref);
    if (!bytes) throw Error("Missing asset blob: " + ref);
    return bytes.length;
  }
  read(ref: string): Uint8Array {
    const bytes = this.data.get(ref);
    if (!bytes) throw Error("Missing asset blob: " + ref + ". Reopen the original PIF.");
    return new Uint8Array(bytes);
  }
  entries(refs: Iterable<string>): BlobEntry[] {
    return [...new Set(refs)].sort().map((ref) => ({ ref, bytes: this.read(ref) }));
  }
  async admit(entries: BlobEntry[]) {
    if (!Array.isArray(entries) || entries.length > 100) throw Error("Blob inventory limit");
    // Validate every entry and the total before making any visible changes.
    const staged = new Map<string, Uint8Array>();
    let stagedBytes = 0;
    for (const entry of entries) {
      if (
        !entry ||
        !isBlobRef(entry.ref) ||
        !(entry.bytes instanceof Uint8Array) ||
        entry.bytes.length > MODEL_BYTES
      )
        throw Error("Invalid blob inventory");
      stagedBytes += entry.bytes.length;
      if (stagedBytes > this.limit) throw Error("Blob inventory exceeds memory budget");
      const bytes = new Uint8Array(entry.bytes);
      if (BLOB_PREFIX + (await hashBytes(bytes)) !== entry.ref) throw Error("Blob hash mismatch");
      if (staged.has(entry.ref)) throw Error("Duplicate blob inventory entry");
      staged.set(entry.ref, bytes);
    }
    const added = [...staged].reduce((n, [ref, b]) => n + (this.data.has(ref) ? 0 : b.length), 0);
    if (this.size + added > this.limit) throw Error("Session blob budget exhausted");
    for (const [ref, b] of staged)
      if (!this.data.has(ref)) {
        this.data.set(ref, b);
        this.size += b.length;
      }
  }
  async readAsync(ref: string) {
    return this.read(ref);
  }
  async readRange(ref: string, offset: number, length: number) {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(length) ||
      length < 1 ||
      length > 1048576
    )
      throw Error("Invalid blob range");
    const bytes = this.data.get(ref);
    if (!bytes) throw Error("Missing asset blob");
    return bytes.slice(offset, offset + length);
  }
  async sizeOf(ref: string) {
    return this.byteLength(ref);
  }
  async entriesAsync(refs: Iterable<string>) {
    return this.entries(refs);
  }
  get references() {
    return [...this.data.keys()];
  }
  async prune(_keep: Iterable<string>) {}
  retain(refs: Iterable<string>) {
    const keep = new Set(refs);
    for (const [ref, b] of this.data)
      if (!keep.has(ref)) {
        this.data.delete(ref);
        this.size -= b.length;
      }
  }
}
/** Durable content-addressed bytes; only reference metadata stays in JavaScript memory. */
export class DiskBlobStore extends BlobStore {
  override readonly persistent = true;
  private known = new Map<string, number>();
  private opening?: Promise<IDBDatabase>;
  private lease?: { ready: Promise<void>; held: Promise<void>; release: () => void };
  private pruning?: Promise<void>;
  private async ensureLease() {
    if (typeof navigator === "undefined" || !navigator.locks) return;
    if (!this.lease) {
      let ready!: () => void, release!: () => void;
      const started = new Promise<void>((resolve) => {
          ready = resolve;
        }),
        gate = new Promise<void>((resolve) => {
          release = resolve;
        });
      const held = navigator.locks.request(
        this.databaseName + ":live",
        { mode: "shared" },
        async () => {
          ready();
          await gate;
        },
      );
      this.lease = { ready: Promise.race([started, held]), held, release };
    }
    await this.lease.ready;
  }
  private async open() {
    await this.pruning;
    await this.ensureLease();
    return this.openDatabase();
  }

  constructor(
    readonly databaseName = "pinefall-asset-bytes-v1",
    readonly diskLimit = 512 * 1024 * 1024,
  ) {
    super(0);
  }
  override get bytes() {
    return 0;
  }
  override get count() {
    return this.known.size;
  }
  override get references() {
    return [...this.known.keys()];
  }
  override has(ref: string) {
    return this.known.has(ref);
  }
  override byteLength(ref: string) {
    const size = this.known.get(ref);
    if (size === undefined) throw Error("Asset metadata not loaded; use asynchronous sizeOf");
    return size;
  }
  override read(_ref: string): Uint8Array {
    throw Error("Disk asset requires asynchronous read; source bytes are not resident");
  }
  private openDatabase() {
    return (this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("bytes");
        request.result.createObjectStore("metadata");
      };
      let blocked = false;
      request.onblocked = () => {
        blocked = true;
        reject(Error("Asset disk storage blocked by another window"));
      };
      request.onerror = () => reject(request.error ?? Error("Asset disk storage unavailable"));
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          this.opening = undefined;
        };
        resolve(db);
      };
    }).catch((error) => {
      this.opening = undefined;
      throw error;
    }));
  }
  private done(tx: IDBTransaction) {
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? Error("Asset disk transaction aborted"));
      tx.onerror = () => {};
    });
  }
  private async get<T>(store: string, ref: string): Promise<T | undefined> {
    if (!isBlobRef(ref)) throw Error("Invalid asset reference");
    if (!this.known.has(ref)) this.known.set(ref, 0);
    const db = await this.open(),
      tx = db.transaction(store, "readonly"),
      done = this.done(tx),
      request = tx.objectStore(store).get(ref);
    const result = new Promise<T | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return (await Promise.all([result, done]))[0];
  }
  override async readAsync(ref: string) {
    const stored = await this.get<Uint8Array | Blob>("bytes", ref);
    if (stored instanceof Blob && stored.size > MODEL_BYTES) throw Error("Oversized disk asset");
    const bytes = stored instanceof Blob ? new Uint8Array(await stored.arrayBuffer()) : stored;
    if (!(bytes instanceof Uint8Array) || bytes.length > MODEL_BYTES)
      throw Error("Missing or invalid disk asset. Reopen your PIF backup: " + ref);
    if (BLOB_PREFIX + (await hashBytes(bytes)) !== ref)
      throw Error("Disk asset hash mismatch: " + ref);
    this.known.set(ref, bytes.length);
    return bytes;
  }
  override async readRange(ref: string, offset: number, length: number) {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(length) ||
      length < 1 ||
      length > 1048576
    )
      throw Error("Invalid blob range");
    const stored = await this.get<Uint8Array | Blob>("bytes", ref);
    if (stored instanceof Blob && stored.size <= MODEL_BYTES)
      return new Uint8Array(await stored.slice(offset, offset + length).arrayBuffer());
    if (stored instanceof Uint8Array && stored.length <= MODEL_BYTES)
      return stored.slice(offset, offset + length);
    throw Error("Missing or oversized disk asset");
  }
  override async sizeOf(ref: string) {
    const row = await this.get<{ bytes: number }>("metadata", ref);
    if (!row || !Number.isSafeInteger(row.bytes) || row.bytes < 0 || row.bytes > MODEL_BYTES)
      throw Error("Missing or invalid disk asset metadata: " + ref);
    this.known.set(ref, row.bytes);
    return row.bytes;
  }
  override async put(input: Uint8Array, expected?: string) {
    if (input.byteLength > MODEL_BYTES) throw Error("Blob exceeds 200 MB admission limit");
    const bytes = new Uint8Array(input),
      hash = await hashBytes(bytes);
    if (expected !== undefined && expected !== hash) throw Error("Blob hash mismatch");
    const ref = BLOB_PREFIX + hash;
    await this.write([{ ref, bytes }]);
    return ref;
  }
  private async write(entries: BlobEntry[]) {
    const db = await this.open(),
      tx = db.transaction(["bytes", "metadata"], "readwrite", { durability: "strict" }),
      done = this.done(tx);
    let failure: Error | undefined;
    const req = tx.objectStore("metadata").getAll(undefined, 8193);
    req.onsuccess = () => {
      try {
        const rows = req.result as { ref: string; bytes: number }[],
          existing = new Set(rows.map((r) => r.ref));
        if (
          rows.some(
            (row) =>
              !isBlobRef(row.ref) ||
              !Number.isSafeInteger(row.bytes) ||
              row.bytes < 0 ||
              row.bytes > MODEL_BYTES,
          ) ||
          existing.size !== rows.length
        )
          throw Error("Invalid asset disk index; keep your PIF backups");
        if (rows.length + entries.filter((entry) => !existing.has(entry.ref)).length > 8192)
          throw Error("Asset disk index full; clean unused assets");
        const total =
          rows.reduce((n, r) => n + r.bytes, 0) +
          entries.reduce((n, e) => n + (existing.has(e.ref) ? 0 : e.bytes.length), 0);
        if (!Number.isSafeInteger(total) || total > this.diskLimit)
          throw Error("Asset disk budget exhausted; export a backup and clean unused assets");
        for (const e of entries) {
          // Blob payloads are stored out-of-line by Chromium. Large Uint8Array
          // records hit its ~127 MiB structured-clone value limit.
          tx.objectStore("bytes").put(
            new Blob([
              e.bytes.buffer instanceof ArrayBuffer
                ? new Uint8Array(e.bytes.buffer, e.bytes.byteOffset, e.bytes.byteLength)
                : new Uint8Array(e.bytes),
            ]),
            e.ref,
          );
          tx.objectStore("metadata").put(
            { ref: e.ref, bytes: e.bytes.length, touched: Date.now() },
            e.ref,
          );
        }
      } catch (error) {
        failure = error instanceof Error ? error : Error(String(error));
        tx.abort();
      }
    };
    try {
      await done;
    } catch (error) {
      throw failure ?? error;
    }
    for (const e of entries) this.known.set(e.ref, e.bytes.length);
  }
  override async admit(entries: BlobEntry[]) {
    if (!Array.isArray(entries) || entries.length > 100) throw Error("Blob inventory limit");
    const staged: BlobEntry[] = [],
      seen = new Set<string>();
    let total = 0;
    for (const e of entries) {
      if (
        !e ||
        !isBlobRef(e.ref) ||
        !(e.bytes instanceof Uint8Array) ||
        e.bytes.length > MODEL_BYTES ||
        seen.has(e.ref)
      )
        throw Error("Invalid blob inventory");
      const bytes = new Uint8Array(e.bytes);
      total += bytes.length;
      if (total > PROJECT_MODEL_BYTES) throw Error("Blob inventory exceeds transfer budget");
      if (BLOB_PREFIX + (await hashBytes(bytes)) !== e.ref) throw Error("Blob hash mismatch");
      seen.add(e.ref);
      staged.push({ ref: e.ref, bytes });
    }
    await this.write(staged);
  }
  override async entriesAsync(refs: Iterable<string>) {
    const result: BlobEntry[] = [];
    let total = 0;
    for (const ref of new Set(refs)) {
      const bytes = await this.readAsync(ref);
      total += bytes.length;
      if (total > PROJECT_MODEL_BYTES) throw Error("Blob inventory exceeds transfer budget");
      result.push({ ref, bytes });
    }
    return result;
  }
  override retain(refs: Iterable<string>) {
    const keep = new Set(refs);
    for (const ref of this.known.keys()) if (!keep.has(ref)) this.known.delete(ref);
  }
  override async prune(refs: Iterable<string>) {
    // Keep other live windows/worker sources safe, including suspended tabs. Without
    // Web Locks reclamation is deliberately skipped rather than risking data loss.
    if (typeof navigator === "undefined" || !navigator.locks) return;
    if (this.pruning) return this.pruning;
    const roots = [...refs];
    const task = navigator.locks.request(
      this.databaseName + ":collector",
      { ifAvailable: true },
      async (collector) => {
        if (!collector) return;
        const lease = this.lease;
        this.lease = undefined;
        lease?.release();
        await lease?.held;
        try {
          await navigator.locks.request(
            this.databaseName + ":live",
            { mode: "exclusive", ifAvailable: true },
            async (lock) => {
              if (!lock) return;
              const keep = new Set([...roots, ...this.references]),
                db = await this.openDatabase(),
                tx = db.transaction(["bytes", "metadata"], "readwrite"),
                done = this.done(tx),
                cursor = tx.objectStore("metadata").openCursor();
              cursor.onsuccess = () => {
                const row = cursor.result;
                if (!row) return;
                // Grace protects in-flight workers whose committed bytes have not reached the document yet.
                if (!keep.has(String(row.key)) && row.value.touched < Date.now() - 600_000) {
                  tx.objectStore("bytes").delete(row.key);
                  row.delete();
                }
                row.continue();
              };
              await done;
            },
          );
        } finally {
          await this.ensureLease();
        }
      },
    );
    this.pruning = task;
    try {
      await task;
    } finally {
      if (this.pruning === task) this.pruning = undefined;
    }
  }
}
// Browser and Electron fail closed on disk errors; there is no hidden RAM-only fallback.
export const blobs: BlobStore =
  typeof indexedDB !== "undefined" ? new DiskBlobStore() : new BlobStore();

if (!blobs.persistent) assetMemory.reserve(blobs.limit, "cli-session-blob-pool");
