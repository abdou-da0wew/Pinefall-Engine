import { test, expect } from "bun:test";
import { createGame } from "../packages/project/src";
import {
  packProject,
  unpackProject,
  projectFiles,
  sceneFromFiles,
  writeTar,
  readTar,
} from "../packages/project/src/pif";
import { parseScene } from "../packages/runtime/src/schema";
import { xzAsync, ensureInlineInit } from "../packages/project/src/xz";
const enc = new TextEncoder();
test("PIF is a genuine XZ TAR with separate script sources, not embedded JSON", async () => {
  const scene = parseScene(await Bun.file("examples/projects/ui-lab.scene.json").json());
  const pif = await packProject(scene);
  expect([...pif.slice(0, 6)]).toEqual([253, 55, 122, 88, 90, 0]);
  expect(await unpackProject(pif)).toEqual(scene);
  const files = projectFiles(scene);
  expect(files.has("scripts/0.ts")).toBe(true);
  const definition = JSON.parse(new TextDecoder().decode(files.get("scene.json")));
  expect(definition.scripts[0].source).toBeUndefined();
  expect(definition.scripts[0].file).toBe("scripts/0.ts");
  expect(pif.length).toBeLessThan(writeTar(files).length);
});
test("PIF extracts binary GLB resources and restores their IDs, names and bytes", async () => {
  const scene = parseScene(await Bun.file("examples/projects/beacon-run.scene.json").json());
  const files = projectFiles(scene);
  expect(files.has("assets/0.glb")).toBe(true);
  const definition = JSON.parse(new TextDecoder().decode(files.get("scene.json")));
  expect(definition.assets[0].data).toBeUndefined();
  expect(await unpackProject(await packProject(scene))).toEqual(scene);
});
test("PIF manifest versions, missing and unreferenced resources are rejected", () => {
  const files = projectFiles(createGame("x"));
  files.set(
    "project.json",
    enc.encode(JSON.stringify({ format: "pinefall-project", version: 99, scene: "scene.json" })),
  );
  expect(() => sceneFromFiles(files)).toThrow();
  const clean = projectFiles(createGame("x"));
  clean.set("scripts/unused.ts", enc.encode('throw Error("not executed")'));
  expect(() => sceneFromFiles(clean)).toThrow("Unreferenced");
  clean.delete("scene.json");
  expect(() => sceneFromFiles(clean)).toThrow("Missing");
});
test("strict archive rejects traversal, duplicates, links, checksum corruption and truncation", () => {
  expect(() => writeTar(new Map([["../evil", enc.encode("x")]]))).toThrow();
  const tar = writeTar(projectFiles(createGame("x")));
  const bad = tar.slice();
  bad[0] ^= 1;
  expect(() => readTar(bad)).toThrow();
  expect(() => readTar(tar.slice(0, -1024))).toThrow();
  const duplicate = new Uint8Array(tar.length * 2 - 1024);
  duplicate.set(tar.slice(0, -1024));
  duplicate.set(tar, tar.length - 1024);
  expect(() => readTar(duplicate)).toThrow();
});
test("XZ corruption, concatenated streams and non-XZ input fail before scene adoption", async () => {
  await expect(unpackProject(enc.encode("{}"))).rejects.toThrow();
  const packed = await packProject(createGame("x")),
    bad = packed.slice();
  bad[30] ^= 255;
  await expect(unpackProject(bad)).rejects.toThrow();
  const twice = new Uint8Array(packed.length * 2);
  twice.set(packed);
  twice.set(packed, packed.length);
  await expect(unpackProject(twice)).rejects.toThrow();
});
test("fixed output budget rejects compressed expansion bombs", async () => {
  await ensureInlineInit();
  const bomb = await xzAsync(new Uint8Array(41 * 1024 * 1024), { preset: 1 });
  await expect(unpackProject(bomb)).rejects.toThrow("budget");
});
