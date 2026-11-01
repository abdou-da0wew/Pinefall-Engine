import { createHash, randomUUID } from "node:crypto";
import { open, rename, unlink, lstat, realpath } from "node:fs/promises";
import { resolve, sep, dirname, basename, join } from "node:path";
import { type DiskWorkspace, projectRelativePath } from "./disk-workspace";
import { xzChunks } from "./xz-stream";
const LIMIT = 512 * 1024 * 1024;
const encoder = new TextEncoder(),
  decoder = new TextDecoder("utf-8", { fatal: true });
interface Entry {
  path: string;
  bytes: number;
  sha256: string;
}
function header(name: string, bytes: number) {
  const result = new Uint8Array(512);
  const put = (offset: number, value: string) => result.set(encoder.encode(value), offset);
  put(0, name);
  put(100, "0000644\0");
  put(108, "0000000\0");
  put(116, "0000000\0");
  put(124, bytes.toString(8).padStart(11, "0") + "\0");
  put(136, "00000000000\0");
  put(148, "        ");
  put(156, "0");
  put(257, "ustar\0");
  put(263, "00");
  put(
    148,
    result
      .reduce((a, b) => a + b, 0)
      .toString(8)
      .padStart(6, "0") + "\0 ",
  );
  return result;
}
const padding = (bytes: number) => new Uint8Array((512 - (bytes % 512)) % 512);
async function* readDisk(disk: DiskWorkspace, path: string, bytes: number) {
  for (let offset = 0; offset < bytes;) {
    const read = await disk.read(path, offset, Math.min(65536, bytes - offset));
    if (read.total !== bytes || !read.bytes.length)
      throw Error("File changed while archiving: " + path);
    offset += read.bytes.length;
    yield read.bytes;
  }
}
/** PIF8 raw folder transport. Invalid authored JSON/source is preserved, not evaluated. */
export async function packFolder(disk: DiskWorkspace, destination: string, signal?: AbortSignal) {
  destination = join(await realpath(dirname(resolve(destination))), basename(destination));
  if (destination === disk.root || destination.startsWith(disk.root + sep))
    throw Error("Save the PIF archive outside its working folder");
  const destinationState = async () => {
    const info = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (info && !info.isFile()) throw Error("Archive destination must be a regular file");
    return info ? `${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}` : null;
  };
  const previous = await destinationState();
  const inventory = await disk.inventory();
  const entries: Entry[] = [];
  const occupied = new Set<string>();
  let size = 1024;
  for (const item of inventory) {
    signal?.throwIfAborted();
    const key = item.path.normalize("NFC").toLowerCase();
    if (occupied.has(key)) throw Error("Non-portable duplicate folder path: " + item.path);
    occupied.add(key);
    size += 512 + Math.ceil(item.bytes / 512) * 512;
    if (size > LIMIT) throw Error("Expanded folder archive budget");
    const sha256 = await disk.fingerprint(item.path);
    if (!sha256) throw Error("File disappeared: " + item.path);
    entries.push({ path: item.path, bytes: item.bytes, sha256 });
  }
  const manifest = encoder.encode(
    JSON.stringify({ format: "pinefall-folder", version: 8, files: entries }),
  );
  if (manifest.length > 4 * 1024 * 1024 || size + manifest.length + 1024 > LIMIT)
    throw Error("Folder manifest budget");
  async function* tar() {
    yield header("folder.json", manifest.length);
    yield manifest;
    yield padding(manifest.length);
    for (const [index, item] of entries.entries()) {
      yield header(`files/${index}.bin`, item.bytes);
      const hash = createHash("sha256");
      for await (const bytes of readDisk(disk, item.path, item.bytes)) {
        hash.update(bytes);
        yield bytes;
      }
      if (hash.digest("hex") !== item.sha256)
        throw Error("File changed while archiving: " + item.path);
      yield padding(item.bytes);
    }
    yield new Uint8Array(1024);
  }
  const temporary = destination + ".tmp-" + randomUUID();
  let committed = false;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      let compressed = 0;
      for await (const chunk of xzChunks(tar(), true, signal)) {
        compressed += chunk.length;
        if (compressed > LIMIT) throw Error("Compressed archive budget");
        await file.writeFile(chunk);
      }
      const after = await disk.inventory();
      if (
        after.length !== entries.length ||
        after.some(
          (item, index) => item.path !== entries[index].path || item.bytes !== entries[index].bytes,
        )
      )
        throw Error("Folder changed during backup");
      for (const item of entries)
        if ((await disk.fingerprint(item.path)) !== item.sha256)
          throw Error("Folder changed during backup: " + item.path);
      await file.sync();
    } finally {
      await file.close();
    }
    signal?.throwIfAborted();
    if ((await destinationState()) !== previous)
      throw Error("Archive destination changed during backup");
    await rename(temporary, destination);
    committed = true;
    return { files: entries.length, expandedBytes: size };
  } finally {
    if (!committed) await unlink(temporary).catch(() => {});
  }
}
export async function unpackFolder(source: string, disk: DiskWorkspace, signal?: AbortSignal) {
  if ((await disk.inventory()).length) throw Error("Extraction requires an empty working folder");
  const file = await open(source, "r");
  const created = new Map<string, string>();
  let complete = false;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > LIMIT) throw Error("Compressed archive budget");
    async function* compressed() {
      for await (const chunk of file.createReadStream({ autoClose: false, highWaterMark: 65536 }))
        yield new Uint8Array(chunk);
    }
    const stream = xzChunks(compressed(), false, signal)[Symbol.asyncIterator]();
    let pending = new Uint8Array(),
      expanded = 0;
    const read = async (count: number) => {
      const result = new Uint8Array(count);
      let offset = 0;
      while (offset < count) {
        if (!pending.length) {
          const next = await stream.next();
          if (next.done) throw Error("Truncated folder archive");
          expanded += next.value.length;
          if (expanded > LIMIT) throw Error("Expanded archive budget");
          pending = new Uint8Array(next.value);
        }
        const take = Math.min(count - offset, pending.length);
        result.set(pending.subarray(0, take), offset);
        pending = pending.subarray(take);
        offset += take;
      }
      return result;
    };
    const expectHeader = async (name: string) => {
      const raw = await read(512);
      const text = (offset: number, count: number) =>
        decoder
          .decode(raw.subarray(offset, offset + count))
          .split("\0")[0]
          .trim();
      const checksum = text(148, 8),
        size = text(124, 12);
      if (
        text(0, 100) !== name ||
        raw[156] !== 48 ||
        text(257, 6) !== "ustar" ||
        !/^[0-7]+$/.test(checksum) ||
        !/^[0-7]+$/.test(size)
      )
        throw Error("Invalid folder TAR header");
      const sum = raw.reduce((n, v, i) => n + (i >= 148 && i < 156 ? 32 : v), 0);
      if (sum !== parseInt(checksum, 8)) throw Error("Folder TAR checksum mismatch");
      return parseInt(size, 8);
    };
    const zeroes = async (count: number) => {
      if ((await read(count)).some((v) => v !== 0)) throw Error("Invalid TAR padding");
    };
    try {
      const length = await expectHeader("folder.json");
      if (length > 4 * 1024 * 1024) throw Error("Folder manifest budget");
      const manifest = JSON.parse(decoder.decode(await read(length)));
      await zeroes(padding(length).length);
      if (
        manifest.format !== "pinefall-folder" ||
        manifest.version !== 8 ||
        !Array.isArray(manifest.files) ||
        manifest.files.length > 10000
      )
        throw Error("Unsupported folder manifest");
      const paths = new Set<string>();
      let total = 0;
      for (const item of manifest.files as Entry[]) {
        const path = projectRelativePath(item.path);
        if (
          paths.has(path.normalize("NFC").toLowerCase()) ||
          !Number.isSafeInteger(item.bytes) ||
          item.bytes < 0 ||
          !/^[a-f0-9]{64}$/.test(item.sha256)
        )
          throw Error("Invalid folder entry");
        paths.add(path.normalize("NFC").toLowerCase());
        total += item.bytes;
        if (total > LIMIT) throw Error("Expanded archive budget");
      }
      for (const [index, item] of (manifest.files as Entry[]).entries()) {
        if ((await expectHeader(`files/${index}.bin`)) !== item.bytes)
          throw Error("Folder entry size mismatch");
        if (!item.bytes) {
          if (item.sha256 !== createHash("sha256").digest("hex"))
            throw Error("Empty file hash mismatch");
          await disk.write(item.path, new Uint8Array(), null);
          created.set(item.path, item.sha256);
        } else {
          const ticket = await disk.beginUpload(item.path, item.bytes, null);
          try {
            for (let offset = 0; offset < item.bytes;) {
              const bytes = await read(Math.min(65536, item.bytes - offset));
              offset = await disk.appendUpload(ticket, offset, bytes);
            }
            await disk.finishUpload(ticket, item.sha256);
            created.set(item.path, item.sha256);
          } finally {
            await disk.cancelUpload(ticket);
          }
        }
        await zeroes(padding(item.bytes).length);
      }
      await zeroes(1024);
      if (pending.length || !(await stream.next()).done) throw Error("Trailing folder TAR data");
      complete = true;
      return { files: created.size };
    } finally {
      await stream.return?.(undefined);
    }
  } finally {
    await file.close();
    // Extraction only owns newly created files in the explicitly empty destination.
    if (!complete)
      for (const [path, hash] of created) {
        try {
          if ((await disk.fingerprint(path)) === hash) await unlink(resolve(disk.root, path));
        } catch {
          /* Concurrent external changes are preserved. */
        }
      }
  }
}
