/** Immutable, content-addressed session blobs. Disk transport must verify hashes before admission. */
export const BLOB_PREFIX = "asset:sha256:";
export const isBlobRef = (value: unknown): value is `asset:sha256:${string}` =>
  typeof value === "string" && /^asset:sha256:[a-f0-9]{64}$/.test(value);
export async function hashBytes(bytes: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export interface BlobEntry {
  ref: string;
  bytes: Uint8Array;
}
export class BlobStore {
  private data = new Map<string, Uint8Array>();
  private size = 0;
  constructor(readonly limit = 64 * 1024 * 1024) {}
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
    if (input.byteLength > 8_000_000) throw Error("Blob exceeds 8 MB admission limit");
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
  read(ref: string) {
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
        entry.bytes.length > 8_000_000
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
  retain(refs: Iterable<string>) {
    const keep = new Set(refs);
    for (const [ref, b] of this.data)
      if (!keep.has(ref)) {
        this.data.delete(ref);
        this.size -= b.length;
      }
  }
}
export const blobs = new BlobStore();
