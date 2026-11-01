import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { DiskWorkspace } from "../packages/project/src/disk-workspace";
import { packFolder, unpackFolder } from "../packages/project/src/folder-archive";
test("PIF8 streams raw unregistered files and invalid drafts, verifies integrity and preserves prior backups on abort", async () => {
  const parent = await mkdtemp(resolve("build/raw-pif-"));
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(parent, "source"));
  await mkdir(join(parent, "destination"));
  await mkdir(join(parent, "broken"));
  const source = await DiskWorkspace.open(join(parent, "source"));
  const destination = await DiskWorkspace.open(join(parent, "destination"));
  const broken = await DiskWorkspace.open(join(parent, "broken"));
  try {
    await source.write("scene.json", new TextEncoder().encode("{ invalid working JSON"), null);
    await source.write("unused.ts", new TextEncoder().encode("unfinished script"), null);
    await source.write("empty.txt", new Uint8Array(), null);
    const binary = new Uint8Array(800000).fill(37);
    await source.write("texture.bin", binary, null);
    const archive = join(parent, "project.pif");
    expect((await packFolder(source, archive)).files).toBe(4);
    expect((await unpackFolder(archive, destination)).files).toBe(4);
    expect(await readFile(join(destination.root, "scene.json"), "utf8")).toBe(
      "{ invalid working JSON",
    );
    expect(new Uint8Array(await readFile(join(destination.root, "texture.bin")))).toEqual(binary);
    const original = await readFile(archive);
    const abort = new AbortController();
    abort.abort();
    await expect(packFolder(source, archive, abort.signal)).rejects.toThrow();
    expect(await readFile(archive)).toEqual(original);
    await expect(unpackFolder(archive, destination)).rejects.toThrow("empty");
    await writeFile(join(parent, "bad.pif"), original.subarray(0, original.length - 8));
    await expect(unpackFolder(join(parent, "bad.pif"), broken)).rejects.toThrow();
    expect(await broken.inventory()).toEqual([]);
    await expect(packFolder(source, join(source.root, "recursive.pif"))).rejects.toThrow("outside");
  } finally {
    await source.close();
    await destination.close();
    await broken.close();
    await rm(parent, { recursive: true, force: true });
  }
});
