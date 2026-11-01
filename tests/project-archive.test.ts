import { test, expect } from "bun:test";
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createGame } from "../packages/project/src";
import { projectFiles, sealProjectFiles, writeTar } from "../packages/project/src/pif";
import { xzChunks } from "../packages/project/src/xz-stream";
import { DiskWorkspace } from "../packages/project/src/disk-workspace";
import { openProjectArchive } from "../packages/project/src/project-archive";
import { packFolder } from "../packages/project/src/folder-archive";
import { readFolder } from "../packages/project/src/folder-format";
import { DEFAULT_SHADER } from "../packages/runtime/src/shader-definition";
import { DEFAULT_SURFACE, emptyGraphics } from "../packages/runtime/src/graphics-definition";
const encoder = new TextEncoder();
async function archive(path: string, files: Map<string, Uint8Array>) {
  async function* input() {
    const bytes = writeTar(files);
    for (let i = 0; i < bytes.length; i += 65536) yield bytes.subarray(i, i + 65536);
  }
  const chunks = [];
  for await (const chunk of xzChunks(input(), true)) chunks.push(chunk);
  await writeFile(path, Buffer.concat(chunks));
}
test("one native opener migrates legacy scripts/materials/shaders and accepts raw PIF8 without executing source", async () => {
  const parent = await mkdtemp(resolve("build/unified-pif-"));
  await mkdir(join(parent, "legacy"));
  await mkdir(join(parent, "raw"));
  const disk = await DiskWorkspace.open(join(parent, "legacy")),
    raw = await DiskWorkspace.open(join(parent, "raw"));
  try {
    const scene = createGame("Legacy migration");
    scene.scripts = [
      {
        id: "logic",
        name: "Logic.ts",
        source: "throw Error('must never execute'); export default () => ({});",
      },
    ];
    scene.graphics = emptyGraphics();
    scene.graphics.materials = [{ ...DEFAULT_SURFACE, id: "paint", name: "Paint" }];
    scene.graphics.shaders = [
      { ...DEFAULT_SHADER, id: "shade", name: "Shade", draft: "broken draft", draftUniforms: "{" },
    ];
    const path = join(parent, "legacy.pif");
    await archive(path, await sealProjectFiles(projectFiles(scene)));
    const before = await readFile(path);
    const result = await openProjectArchive(path, disk);
    expect(result.format).toBe("legacy");
    expect(result.version).toBe(7);
    expect(result.integrity).toBe("sha256-verified");
    const loaded = await readFolder({
      text: async (path) => readFile(join(disk.root, path), "utf8"),
      binary: async () => {
        throw Error("Unexpected binary");
      },
    });
    expect(loaded.name).toBe(scene.name);
    expect(loaded.scripts).toEqual(scene.scripts);
    expect(loaded.graphics).toEqual(scene.graphics);
    expect(await readFile(path)).toEqual(before);
    expect(await disk.fingerprint("migration/legacy-integrity.json")).not.toBeNull();
    await disk.write("unregistered.ts", encoder.encode("unfinished external source"), null);
    const backup = join(parent, "raw.pif");
    await packFolder(disk, backup);
    expect((await openProjectArchive(backup, raw)).format).toBe("folder");
    expect(await readFile(join(raw.root, "unregistered.ts"), "utf8")).toBe(
      "unfinished external source",
    );
  } finally {
    await disk.close();
    await raw.close();
    await rm(parent, { recursive: true, force: true });
  }
});
test("unified opening rolls back hash mismatch, unknown resources, unsupported readers and cancellation", async () => {
  const parent = await mkdtemp(resolve("build/unified-invalid-"));
  await mkdir(join(parent, "dest"));
  const disk = await DiskWorkspace.open(join(parent, "dest"));
  try {
    const scene = createGame("Invalid archive"),
      path = join(parent, "test.pif");
    const files = await sealProjectFiles(projectFiles(scene));
    files.set("scene.json", encoder.encode("{}"));
    await archive(path, files);
    await expect(openProjectArchive(path, disk)).rejects.toThrow("integrity mismatch");
    expect(await disk.inventory()).toEqual([]);
    const extra = projectFiles(scene);
    extra.set("scripts/unused.ts", encoder.encode("unfinished"));
    await archive(path, await sealProjectFiles(extra));
    await expect(openProjectArchive(path, disk)).rejects.toThrow("Unreferenced");
    expect(await disk.inventory()).toEqual([]);
    const future = projectFiles(scene),
      manifest = JSON.parse(new TextDecoder().decode(future.get("project.json")));
    manifest.minimumReader = 999;
    future.set("project.json", encoder.encode(JSON.stringify(manifest)));
    await archive(path, await sealProjectFiles(future));
    await expect(openProjectArchive(path, disk)).rejects.toThrow("minimum reader");
    expect(await disk.inventory()).toEqual([]);
    const controller = new AbortController();
    controller.abort();
    await expect(openProjectArchive(path, disk, controller.signal)).rejects.toThrow();
    expect(await disk.inventory()).toEqual([]);
  } finally {
    await disk.close();
    await rm(parent, { recursive: true, force: true });
  }
});

test("legacy format versions 1–7 migrate with accurate integrity status", async () => {
  const parent = await mkdtemp(resolve("build/legacy-versions-"));
  try {
    for (let version = 1; version <= 7; version++) {
      const root = join(parent, String(version));
      await mkdir(root);
      const disk = await DiskWorkspace.open(root);
      try {
        const files = projectFiles(createGame("Version " + version));
        const original = JSON.parse(new TextDecoder().decode(files.get("project.json")));
        files.set(
          "project.json",
          encoder.encode(
            JSON.stringify(
              version === 1
                ? { format: "pinefall-project", version, scene: "scene.json" }
                : { ...original, version, minimumReader: version },
            ),
          ),
        );
        const path = join(parent, version + ".pif");
        await archive(path, version === 1 ? files : await sealProjectFiles(files));
        const result = await openProjectArchive(path, disk);
        expect(result.version).toBe(version);
        expect(result.integrity).toBe(version === 1 ? "legacy-unverified" : "sha256-verified");
      } finally {
        await disk.close();
      }
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("cancellation during streamed upload removes only extraction-owned files", async () => {
  const parent = await mkdtemp(resolve("build/legacy-cancel-"));
  await mkdir(join(parent, "dest"));
  const disk = await DiskWorkspace.open(join(parent, "dest"));
  try {
    const files = await sealProjectFiles(projectFiles(createGame("Cancel"))),
      path = join(parent, "cancel.pif");
    await archive(path, files);
    const controller = new AbortController(),
      append = disk.appendUpload.bind(disk);
    disk.appendUpload = async (...args) => {
      const offset = await append(...args);
      controller.abort(Error("test mid-upload cancellation"));
      return offset;
    };
    await expect(openProjectArchive(path, disk, controller.signal)).rejects.toThrow("cancellation");
    expect(await disk.inventory()).toEqual([]);
  } finally {
    await disk.close();
    await rm(parent, { recursive: true, force: true });
  }
});
