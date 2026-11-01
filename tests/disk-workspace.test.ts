import { test, expect } from "bun:test";
import { mkdtemp, writeFile, readFile, rename, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DiskWorkspace,
  DISK_CHUNK_BYTES,
  projectRelativePath,
} from "../packages/project/src/disk-workspace";

async function fixture(run: (disk: DiskWorkspace, root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "pinefall-disk-test-"));
  const disk = await DiskWorkspace.open(root);
  try {
    await run(disk, root);
  } finally {
    await disk.close();
    await rm(root, { recursive: true, force: true });
  }
}
const bytes = (text: string) => new TextEncoder().encode(text);
test("disk paths reject traversal, platform tricks, hidden control files and absolute paths", () => {
  for (const path of [
    "",
    "../a",
    "a/../../b",
    "/tmp/a",
    "C:/a",
    "a\\b",
    "a//b",
    "a/./b",
    ".git/config",
    "a/NUL.ts",
    "a/foo.",
    "a/foo ",
    "a\0b",
  ])
    expect(() => projectRelativePath(path)).toThrow();
  expect(projectRelativePath("scripts/Player controller.ts")).toBe("scripts/Player controller.ts");
});
test("source writes are serialized, hash-checked and retain external edits on conflict", () =>
  fixture(async (disk, root) => {
    const first = await disk.write("scripts/player.ts", bytes("original"), null);
    expect(first).toHaveLength(64);
    await writeFile(join(root, "scripts/player.ts"), "external edit");
    await expect(
      disk.write("scripts/player.ts", bytes("stale editor write"), first),
    ).rejects.toThrow("conflict");
    expect(await readFile(join(root, "scripts/player.ts"), "utf8")).toBe("external edit");
    const current = await disk.fingerprint("scripts/player.ts");
    const pending = disk.write("scripts/player.ts", bytes("accepted"), current);
    const stale = disk.write("scripts/player.ts", bytes("wrong"), current);
    await pending;
    await expect(stale).rejects.toThrow("conflict");
    expect(await readFile(join(root, "scripts/player.ts"), "utf8")).toBe("accepted");
    expect((await disk.inventory()).map((e) => e.path)).toEqual(["scripts/player.ts"]);
  }));
test("asset reads are chunked and source files are not copied into metadata inventories", () =>
  fixture(async (disk, root) => {
    const data = new Uint8Array(DISK_CHUNK_BYTES + 41).fill(7);
    await writeFile(join(root, "asset.glb"), data);
    expect((await disk.inventory())[0].bytes).toBe(data.length);
    const chunk = await disk.read("asset.glb", DISK_CHUNK_BYTES, 128);
    expect(chunk.bytes.length).toBe(41);
    expect([...chunk.bytes]).toEqual(Array(41).fill(7));
    await expect(disk.read("asset.glb", 0, DISK_CHUNK_BYTES + 1)).rejects.toThrow();
    await expect(disk.read("asset.glb", -1, 1)).rejects.toThrow();
    await expect(disk.write("large.bin", data, null)).rejects.toThrow();
  }));
test("symlinks cannot read or overwrite files outside the granted project", () =>
  fixture(async (disk, root) => {
    const outside = await mkdtemp(join(tmpdir(), "pinefall-outside-test-"));
    try {
      await writeFile(join(outside, "secret.ts"), "outside");
      await symlink(outside, join(root, "linked"), "dir");
      await expect(disk.read("linked/secret.ts", 0, 100)).rejects.toThrow("Symlinks");
      await expect(disk.write("linked/secret.ts", bytes("overwritten"), null)).rejects.toThrow(
        "Symlinks",
      );
      await expect(disk.inventory()).rejects.toThrow("Symlink");
      expect(await readFile(join(outside, "secret.ts"), "utf8")).toBe("outside");
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  }));
test("watcher notices external atomic rename and releases its session on close", () =>
  fixture(async (disk, root) => {
    await disk.write("shader.glsl", bytes("old"), null);
    let events = 0;
    let settle: (() => void) | undefined;
    const changed = new Promise<void>((resolve) => {
      settle = resolve;
    });
    disk.watch((event) => {
      events++;
      if (event.paths.includes("shader.glsl")) settle?.();
    });
    await writeFile(join(root, ".external-temp"), "new shader");
    await rename(join(root, ".external-temp"), join(root, "shader.glsl"));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        changed,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error("Watcher deadline")), 5000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    expect(events).toBe(1);
    expect(new TextDecoder().decode((await disk.read("shader.glsl", 0, 100)).bytes)).toBe(
      "new shader",
    );
    await disk.close();
    await expect(disk.read("shader.glsl", 0, 100)).rejects.toThrow("closed");
    await expect(disk.write("shader.glsl", bytes("bad"), null)).rejects.toThrow();
  }));

test("streamed asset writes enforce order, content hashes, bounded sessions and complete-file commit", () =>
  fixture(async (disk, root) => {
    const ticket = await disk.beginUpload("assets/model.glb", DISK_CHUNK_BYTES + 3, null);
    await expect(disk.appendUpload(ticket, 1, bytes("bad"))).rejects.toThrow();
    await disk.appendUpload(ticket, 0, new Uint8Array(DISK_CHUNK_BYTES).fill(9));
    await expect(disk.finishUpload(ticket)).rejects.toThrow("Incomplete");
    expect(await disk.fingerprint("assets/model.glb")).toBeNull();
    await disk.appendUpload(ticket, DISK_CHUNK_BYTES, bytes("end"));
    const hash = await disk.finishUpload(ticket);
    expect(await disk.fingerprint("assets/model.glb")).toBe(hash);
    expect((await readFile(join(root, "assets/model.glb"))).length).toBe(DISK_CHUNK_BYTES + 3);
    const bad = await disk.beginUpload("assets/bad.glb", 3, null);
    await disk.appendUpload(bad, 0, bytes("bad"));
    await expect(disk.finishUpload(bad, "0".repeat(64))).rejects.toThrow("hash");
    expect(await disk.fingerprint("assets/bad.glb")).toBeNull();
    const a = disk.beginUpload("a.bin", 0, null),
      b = disk.beginUpload("b.bin", 0, null);
    await expect(disk.beginUpload("c.bin", 0, null)).rejects.toThrow("budget");
    await disk.cancelUpload(await a);
    await disk.cancelUpload(await b);
    expect((await disk.inventory()).map((e) => e.path)).toEqual(["assets/model.glb"]);
  }));
