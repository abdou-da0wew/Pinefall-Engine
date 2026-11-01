import { open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { DiskWorkspace } from "./disk-workspace";
import { projectRelativePath } from "./disk-path";
import { unpackFolder } from "./folder-archive";
import { xzChunks } from "./xz-stream";
import { migrateLegacyFolder, type ArchivedFile } from "./legacy-folder";
const LIMIT = 512 * 1024 * 1024,
  decoder = new TextDecoder("utf-8", { fatal: true });
/** Native bounded opening for both legacy PIF1–7 and raw PIF8. No code execution. */
export async function openProjectArchive(
  source: string,
  disk: DiskWorkspace,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if ((await disk.inventory()).length) throw Error("Extraction requires an empty working folder");
  const file = await open(source, "r"),
    created = new Map<string, ArchivedFile>();
  let complete = false,
    rawFolder = false;
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
      signal?.throwIfAborted();
      const result = new Uint8Array(count);
      let offset = 0;
      while (offset < count) {
        if (!pending.length) {
          const next = await stream.next();
          if (next.done) throw Error("Truncated project archive");
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
    const zeroes = async (count: number) => {
      if ((await read(count)).some((v) => v !== 0)) throw Error("Invalid TAR padding");
    };
    try {
      const paths = new Set<string>();
      while (true) {
        const raw = await read(512);
        if (raw.every((v) => v === 0)) {
          await zeroes(512);
          if (pending.length || !(await stream.next()).done)
            throw Error("Trailing project TAR data");
          break;
        }
        const field = (offset: number, length: number) =>
          decoder.decode(raw.subarray(offset, offset + length)).split("\0")[0];
        const path = projectRelativePath(field(0, 100)),
          sizeText = field(124, 12).trim(),
          checksum = field(148, 8).trim();
        if (
          !/^[0-7]+$/.test(sizeText) ||
          !/^[0-7]+$/.test(checksum) ||
          ![0, 48].includes(raw[156]) ||
          field(157, 100) ||
          field(345, 155) ||
          field(257, 6) !== "ustar" ||
          raw.reduce((sum, n, i) => sum + (i >= 148 && i < 156 ? 32 : n), 0) !==
            parseInt(checksum, 8)
        )
          throw Error("Invalid project TAR header");
        if (!created.size && path === "folder.json") {
          rawFolder = true;
          break;
        }
        if (
          !/^(integrity\.json|project\.json|scene\.json|assets\/[A-Za-z0-9_-]+\.glb|sources\/[A-Za-z0-9_-]+\.bin|scripts\/[A-Za-z0-9_-]+\.ts|shaders\/[A-Za-z0-9_-]+\.(glsl|json)|audio\/[A-Za-z0-9_-]+\.wav)$/.test(
            path,
          )
        )
          throw Error("Unsupported legacy archive path");
        if (created.size >= 100 || paths.has(path.normalize("NFC").toLowerCase()))
          throw Error("Duplicate/non-portable project path or entry budget");
        paths.add(path.normalize("NFC").toLowerCase());
        const bytes = parseInt(sizeText, 8);
        if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > LIMIT)
          throw Error("Legacy entry byte budget");
        const hash = createHash("sha256");
        if (!bytes) {
          await disk.write(path, new Uint8Array(), null);
          created.set(path, { bytes, hash: hash.digest("hex") });
        } else {
          const ticket = await disk.beginUpload(path, bytes, null);
          try {
            for (let offset = 0; offset < bytes;) {
              const chunk = await read(Math.min(65536, bytes - offset));
              hash.update(chunk);
              offset = await disk.appendUpload(ticket, offset, chunk);
            }
            const digest = hash.digest("hex");
            await disk.finishUpload(ticket, digest);
            created.set(path, { bytes, hash: digest });
          } finally {
            await disk.cancelUpload(ticket);
          }
        }
        await zeroes((512 - (bytes % 512)) % 512);
      }
      if (!rawFolder) {
        const migration = await migrateLegacyFolder(disk, created, signal);
        for (const [path, entry] of created) {
          signal?.throwIfAborted();
          if ((await disk.fingerprint(path)) !== entry.hash)
            throw Error("File changed during migration: " + path);
        }
        complete = true;
        return { files: created.size, format: "legacy" as const, ...migration };
      }
    } finally {
      await stream.return?.(undefined);
    }
  } finally {
    await file.close();
    if (!complete)
      for (const [path, entry] of created) {
        try {
          if ((await disk.fingerprint(path)) === entry.hash) await unlink(resolve(disk.root, path));
        } catch {
          /* Preserve concurrent external changes. */
        }
      }
  }
  // Reuse the stricter indexed/hash-checked PIF8 parser, with the same cancellation and empty-root rules.
  const result = await unpackFolder(source, disk, signal);
  return { ...result, format: "folder" as const, version: 8, integrity: "sha256-verified" };
}
