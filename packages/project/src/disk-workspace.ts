import { watch, type FSWatcher } from "node:fs";
import { constants } from "node:fs";
import { lstat, mkdir, open, opendir, realpath, rename, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";

export const DISK_CHUNK_BYTES = 1024 * 1024;
const MAX_FILES = 10000;
const MAX_FILE_BYTES = 512 * 1024 * 1024;
export interface DiskChange {
  paths: string[];
  rescan: boolean;
}
export interface DiskEntry {
  path: string;
  bytes: number;
  modified: number;
}
import { projectRelativePath } from "./disk-path";
export { projectRelativePath } from "./disk-path";
/** An explicitly granted directory, not unrestricted renderer filesystem access.
 * No eager asset reads: inventory is metadata-only and reads are capped at 1 MiB.
 * Writes detect ordinary external-edit conflicts; this is not an OS sandbox against
 * a hostile same-user process racing directory replacement at syscall boundaries.
 */
export class DiskWorkspace {
  private watcher?: FSWatcher;
  private timer?: ReturnType<typeof setTimeout>;
  private pending = new Set<string>();
  private rescan = false;
  private closed = false;
  private writes = 0;
  private openingUploads = 0;
  private uploads = new Map<
    string,
    {
      path: string;
      temporary: string;
      file: Awaited<ReturnType<typeof open>>;
      expected: string | null;
      total: number;
      received: number;
      hash: ReturnType<typeof createHash>;
      busy: boolean;
    }
  >();
  private tail: Promise<unknown> = Promise.resolve();
  private io = new AbortController();
  private constructor(readonly root: string) {}
  static async open(root: string) {
    const path = resolve(root);
    if ((await lstat(path)).isSymbolicLink()) throw Error("Project root cannot be a symlink");
    if (!(await lstat(path)).isDirectory()) throw Error("Project root must be a directory");
    return new DiskWorkspace(await realpath(path));
  }
  private live() {
    if (this.closed) throw Error("Disk project session closed");
  }
  private async path(input: unknown, createParents = false): Promise<string> {
    this.live();
    const name = projectRelativePath(input);
    if ((await realpath(this.root)) !== this.root || (await lstat(this.root)).isSymbolicLink())
      throw Error("Project root changed");
    let current = this.root;
    const parts = name.split("/");
    for (let i = 0; i < parts.length; i++) {
      current = join(current, parts[i]);
      let info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return undefined;
      });
      if (!info && i < parts.length - 1 && createParents) {
        await mkdir(current);
        info = await lstat(current);
      }
      if (info?.isSymbolicLink()) throw Error("Symlinks are not project files");
      if (info && (i < parts.length - 1 ? !info.isDirectory() : !info.isFile()))
        throw Error("Invalid project file type");
      if (info && i === parts.length - 1 && info.size > MAX_FILE_BYTES)
        throw Error("Project file exceeds budget");
    }
    this.live();
    return current;
  }
  async inventory(): Promise<DiskEntry[]> {
    this.live();
    const result: DiskEntry[] = [];
    let entries = 0;
    const visit = async (directory: string, depth: number) => {
      if (depth > 16) throw Error("Project directory depth budget");
      for await (const entry of await opendir(directory)) {
        if (++entries > MAX_FILES) throw Error("Project inventory budget");
        this.live();
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const path = join(directory, entry.name);
        const name = relative(this.root, path).split(sep).join("/");
        projectRelativePath(name);
        const info = await lstat(path);
        if (info.isSymbolicLink()) throw Error("Symlink in project inventory: " + name);
        if (info.isDirectory()) await visit(path, depth + 1);
        else if (info.isFile()) {
          if (info.size > MAX_FILE_BYTES || result.length >= MAX_FILES)
            throw Error("Project inventory budget");
          result.push({ path: name, bytes: info.size, modified: info.mtimeMs });
        }
      }
    };
    await visit(this.root, 0);
    return result.sort((a, b) => a.path.localeCompare(b.path));
  }
  async read(path: string, offset: number, length: number) {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(length) ||
      length < 1 ||
      length > DISK_CHUNK_BYTES
    )
      throw Error("Invalid disk read range");
    const file = await open(await this.path(path), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > MAX_FILE_BYTES) throw Error("Project file exceeds budget");
      const bytes = new Uint8Array(Math.min(length, Math.max(0, info.size - offset)));
      const read = await file.read(bytes, 0, bytes.length, offset);
      this.live();
      return { bytes: bytes.subarray(0, read.bytesRead), total: info.size, modified: info.mtimeMs };
    } finally {
      await file.close();
    }
  }
  async fingerprint(path: string): Promise<string | null> {
    const full = await this.path(path);
    const hash = createHash("sha256");
    let count = 0;
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      file = await open(full, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stream = file.createReadStream({
        signal: this.io.signal,
        highWaterMark: 65536,
      });
      for await (const chunk of stream) {
        count += chunk.length;
        if (count > MAX_FILE_BYTES) {
          stream.destroy();
          throw Error("Project file exceeds budget");
        }
        hash.update(chunk);
      }
      this.live();
      return hash.digest("hex");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    } finally {
      await file?.close();
    }
  }
  /** Small metadata/source writes only. Asset streaming has a separate import path. */
  write(path: string, bytes: Uint8Array, expected: string | null): Promise<string> {
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length > DISK_CHUNK_BYTES ||
      (expected !== null && !/^[a-f0-9]{64}$/.test(expected))
    )
      return Promise.reject(Error("Invalid disk write"));
    if (this.closed || this.writes >= 8)
      return Promise.reject(Error("Disk write queue unavailable/full"));
    this.writes++;
    const owned = bytes.slice();
    const task = this.tail
      .catch(() => {})
      .then(async () => {
        const full = await this.path(path, true);
        if ((await this.fingerprint(path)) !== expected)
          throw Error("External edit conflict: " + path);
        const temporary = join(dirname(full), ".pinefall-write-" + randomUUID());
        try {
          const file = await open(temporary, "wx", 0o600);
          try {
            await file.writeFile(owned);
            await file.sync();
          } finally {
            await file.close();
          }
          await this.path(path);
          if ((await this.fingerprint(path)) !== expected)
            throw Error("External edit conflict: " + path);
          this.live();
          await rename(temporary, full);
          return createHash("sha256").update(owned).digest("hex");
        } finally {
          await unlink(temporary).catch(() => {});
        }
      });
    const tracked = task.finally(() => {
      this.writes--;
    });
    this.tail = tracked;
    return tracked;
  }
  beginUpload(path: string, total: number, expected: string | null): Promise<string> {
    if (
      this.closed ||
      this.uploads.size + this.openingUploads >= 2 ||
      !Number.isSafeInteger(total) ||
      total < 0 ||
      total > MAX_FILE_BYTES ||
      (expected !== null && !/^[a-f0-9]{64}$/.test(expected))
    )
      return Promise.reject(Error("Invalid upload/budget"));
    this.openingUploads++;
    const task = this.tail
      .catch(() => {})
      .then(async () => {
        let temporary: string | undefined;
        let file: Awaited<ReturnType<typeof open>> | undefined;
        try {
          const id = randomUUID();
          const full = await this.path(path, true);
          temporary = join(dirname(full), ".pinefall-upload-" + id);
          file = await open(temporary, "wx", 0o600);
          this.live();
          this.uploads.set(id, {
            path,
            temporary,
            file,
            expected,
            total,
            received: 0,
            hash: createHash("sha256"),
            busy: false,
          });
          return id;
        } catch (error) {
          await file?.close();
          if (temporary) await unlink(temporary).catch(() => {});
          throw error;
        } finally {
          this.openingUploads--;
        }
      });
    this.tail = task;
    return task;
  }
  async appendUpload(id: string, offset: number, bytes: Uint8Array) {
    this.live();
    const upload = this.uploads.get(id);
    if (
      !upload ||
      upload.busy ||
      !(bytes instanceof Uint8Array) ||
      bytes.length < 1 ||
      bytes.length > DISK_CHUNK_BYTES ||
      offset !== upload.received ||
      offset + bytes.length > upload.total
    )
      throw Error("Invalid upload chunk/order");
    upload.busy = true;
    const owned = bytes.slice();
    try {
      await upload.file.writeFile(owned);
      this.live();
      upload.hash.update(owned);
      upload.received += owned.length;
      return upload.received;
    } finally {
      upload.busy = false;
    }
  }
  async cancelUpload(id: string) {
    const upload = this.uploads.get(id);
    if (!upload) return;
    this.uploads.delete(id);
    await upload.file.close();
    await unlink(upload.temporary).catch(() => {});
  }
  finishUpload(id: string, contentHash?: string): Promise<string> {
    const upload = this.uploads.get(id);
    if (
      !upload ||
      upload.busy ||
      upload.received !== upload.total ||
      (contentHash !== undefined && !/^[a-f0-9]{64}$/.test(contentHash))
    )
      return Promise.reject(Error("Incomplete/invalid upload"));
    upload.busy = true;
    const task = this.tail
      .catch(() => {})
      .then(async () => {
        try {
          this.live();
          const hash = upload.hash.digest("hex");
          if (contentHash !== undefined && hash !== contentHash)
            throw Error("Upload content hash mismatch");
          await upload.file.sync();
          await upload.file.close();
          const full = await this.path(upload.path);
          if ((await this.fingerprint(upload.path)) !== upload.expected)
            throw Error("External edit conflict: " + upload.path);
          this.live();
          await rename(upload.temporary, full);
          return hash;
        } finally {
          await this.cancelUpload(id);
        }
      });
    this.tail = task;
    return task;
  }
  /** Reports paths only: validation/import decides which changed bytes to read. */
  watch(listener: (event: DiskChange) => void) {
    this.live();
    this.watcher?.close();
    const schedule = () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = undefined;
        if (this.closed) return;
        const event = { paths: [...this.pending].sort(), rescan: this.rescan };
        this.pending.clear();
        this.rescan = false;
        listener(event);
      }, 200);
    };
    this.watcher = watch(this.root, { recursive: true }, (_event, filename) => {
      if (this.closed) return;
      try {
        if (!filename) this.rescan = true;
        else {
          const path = filename.toString().split(sep).join("/");
          if (path.split("/").some((p) => p.startsWith(".") || p === "node_modules")) return;
          projectRelativePath(path);
          if (this.pending.size < 128) this.pending.add(path);
          else this.rescan = true;
        }
      } catch {
        this.rescan = true;
      }
      schedule();
    });
    this.watcher.on("error", () => {
      this.rescan = true;
      schedule();
    });
  }
  async externalPath(path: string) {
    const full = await this.path(path);
    if (!(await lstat(full)).isFile()) throw Error("External target must be a project file");
    return full;
  }
  async close() {
    this.closed = true;
    this.io.abort();
    this.watcher?.close();
    if (this.timer) clearTimeout(this.timer);
    this.pending.clear();
    await this.tail.catch(() => {});
    await Promise.all([...this.uploads.keys()].map((id) => this.cancelUpload(id)));
  }
}
