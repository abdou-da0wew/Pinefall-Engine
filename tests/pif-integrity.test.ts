import { test, expect } from "bun:test";
import {
  projectFiles,
  sealProjectFiles,
  sceneFromFiles,
  packProject,
  unpackProject,
  sha256,
  writeTar,
} from "../packages/project/src/pif";
import { newProjectMetadata, parseProjectMetadata } from "../packages/project/src/metadata";
import { createGame } from "../packages/project/src";
import { ensureInlineInit, xzAsync } from "../packages/project/src/xz";
const enc = new TextEncoder(),
  dec = new TextDecoder();
test("v2 validates portable project/editor metadata and persists stable project identity", async () => {
  const scene = createGame("Metadata");
  scene.project = newProjectMetadata(scene.name);
  scene.project.author = "Example";
  scene.project.description = "Portable project";
  scene.project.editor.activeTool = "scale";
  const loaded = await unpackProject(await packProject(scene));
  expect(loaded.project?.id).toBe(scene.project.id);
  expect(loaded.project?.author).toBe("Example");
  expect(loaded.project?.editor.activeTool).toBe("scale");
  expect((await unpackProject(await packProject(loaded))).project?.id).toBe(scene.project.id);
  const files = await sealProjectFiles(projectFiles(scene));
  const manifest = JSON.parse(dec.decode(files.get("project.json")));
  expect(manifest.version).toBe(2);
  expect(manifest.minimumReader).toBe(2);
  expect(files.has("integrity.json")).toBe(true);
});
test("all payload files including metadata are covered, and mutations are rejected before adoption", async () => {
  const files = await sealProjectFiles(projectFiles(createGame("Protected")));
  for (const path of ["scene.json", "project.json"]) {
    const changed = new Map(files);
    const bytes = changed.get(path)!.slice();
    bytes[bytes.length - 2] ^= 1;
    changed.set(path, bytes);
    await expect(sceneFromFiles(changed)).rejects.toThrow();
  }
  const added = new Map(files);
  added.set("scripts/extra.ts", enc.encode('throw Error("must not execute")'));
  await expect(sceneFromFiles(added)).rejects.toThrow();
  const missing = new Map(files);
  missing.delete("scene.json");
  await expect(sceneFromFiles(missing)).rejects.toThrow();
  const root = new Map(files),
    proof = JSON.parse(dec.decode(root.get("integrity.json")));
  proof.root = "0".repeat(64);
  root.set("integrity.json", enc.encode(JSON.stringify(proof)));
  await expect(sceneFromFiles(root)).rejects.toThrow("root hash");
  const absent = new Map(files);
  absent.delete("integrity.json");
  await expect(sceneFromFiles(absent)).rejects.toThrow("integrity");
});
test("metadata types, version compatibility and timestamps are validated even after resealing", async () => {
  for (const mutate of [
    (v: Record<string, unknown>) => (v.id = "invalid"),
    (v: Record<string, unknown>) => (v.schemaVersion = 9),
    (v: Record<string, unknown>) => (v.createdAt = "yesterday"),
    (v: Record<string, unknown>) => ((v.editor as Record<string, unknown>).sceneSchema = 2),
    (v: Record<string, unknown>) => ((v.editor as Record<string, unknown>).activeTool = "execute"),
  ]) {
    const m = newProjectMetadata("test");
    mutate(m as unknown as Record<string, unknown>);
    expect(() => parseProjectMetadata(m)).toThrow();
  }
  const files = projectFiles(createGame("future"));
  const manifest = JSON.parse(dec.decode(files.get("project.json")));
  manifest.minimumReader = 999;
  files.set("project.json", enc.encode(JSON.stringify(manifest)));
  await expect(sceneFromFiles(await sealProjectFiles(files))).rejects.toThrow("minimum");
});
test("trusted external digest detects fully resealed replacements; embedded hashes alone are not signatures", async () => {
  const scene = createGame("Original"),
    a = await packProject(scene),
    digest = await sha256(a);
  expect((await unpackProject(a, { expectedSha256: digest })).name).toBe("Original");
  scene.name = "Replacement";
  const b = await packProject(scene);
  expect((await unpackProject(b)).name).toBe("Replacement");
  await expect(unpackProject(b, { expectedSha256: digest })).rejects.toThrow("external");
});
test("legacy v1 remains readable but strict-integrity mode rejects it", async () => {
  const files = projectFiles(createGame("legacy"));
  files.set(
    "project.json",
    enc.encode(JSON.stringify({ format: "pinefall-project", version: 1, scene: "scene.json" })),
  );
  await ensureInlineInit();
  const bytes = await xzAsync(writeTar(files));
  expect((await unpackProject(bytes)).name).toBe("legacy");
  await expect(unpackProject(bytes, { requireIntegrity: true })).rejects.toThrow("Legacy");
});

test("script and asset bytes are checked individually", async () => {
  for (const [fixture, path] of [
    ["ui-lab", "scripts/0.ts"],
    ["beacon-run", "assets/0.glb"],
  ]) {
    const files = await sealProjectFiles(
      projectFiles(await Bun.file("examples/projects/" + fixture + ".scene.json").json()),
    );
    const changed = files.get(path)!.slice();
    changed[0] ^= 1;
    files.set(path, changed);
    await expect(sceneFromFiles(files)).rejects.toThrow("integrity mismatch: " + path);
  }
});
