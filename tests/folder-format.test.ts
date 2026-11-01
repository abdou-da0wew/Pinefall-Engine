import { test, expect } from "bun:test";
import { createGame } from "../packages/project/src";
import { DEFAULT_SHADER } from "../packages/runtime/src/shader-definition";
import { DEFAULT_SURFACE, emptyGraphics } from "../packages/runtime/src/graphics-definition";
import { folderLayout, readFolder } from "../packages/project/src/folder-format";
import type { FolderReader } from "../packages/project/src/folder-format";

test("folder format separates editable scene, material, TypeScript, GLSL and uniform files", async () => {
  const scene = createGame("Editable folder");
  scene.scripts = [{ id: "player", name: "Player.ts", source: "export default () => ({})" }];
  scene.graphics = emptyGraphics();
  scene.graphics.materials = [{ ...DEFAULT_SURFACE, id: "paint", name: "Paint" }];
  scene.graphics.shaders = [
    { ...DEFAULT_SHADER, id: "checker", name: "Checker", draft: "unfinished", draftUniforms: "{" },
  ];
  const layout = await folderLayout(scene);
  const reader: FolderReader = {
    async text(path, limit) {
      const text = layout.files.get(path);
      if (typeof text !== "string" || new TextEncoder().encode(text).length > limit)
        throw Error("Missing/oversized text");
      return text;
    },
    async binary() {
      throw Error("Unexpected binary read");
    },
  };
  const loaded = await readFolder(reader);
  expect(loaded.scripts).toEqual(scene.scripts);
  expect(loaded.graphics).toEqual(scene.graphics);
  expect(JSON.parse(layout.files.get("scene.json") as string).scripts[0].source).toBeUndefined();
  expect(layout.files.get(layout.scripts.player)).toBe(scene.scripts[0].source);
  expect(layout.files.get(layout.shaders.checker.source)).toBe(DEFAULT_SHADER.fragment);
  layout.files.set(layout.scripts.player, "export default () => ({ start() {} })");
  expect((await readFolder(reader)).scripts?.[0].source).toContain("start()");
  layout.files.set(layout.shaders.checker.uniforms, "{ broken JSON");
  await expect(readFolder(reader)).rejects.toThrow();
});
test("folder references reject traversal and embedded source shortcuts", async () => {
  const scene = createGame("Bad folder");
  scene.scripts = [{ id: "script", name: "Script.ts", source: "export default () => ({})" }];
  const layout = await folderLayout(scene);
  const raw = JSON.parse(layout.files.get("scene.json") as string);
  raw.scripts[0].file = "../outside.ts";
  layout.files.set("scene.json", JSON.stringify(raw));
  const reader: FolderReader = {
    async text(path) {
      return layout.files.get(path) as string;
    },
    async binary() {
      throw Error("Unexpected binary");
    },
  };
  await expect(readFolder(reader)).rejects.toThrow("Unsafe");
});

test("external source path bindings survive adoption and subsequent authoring", async () => {
  const scene = createGame("Paths");
  scene.scripts = [{ id: "main", name: "Main.ts", source: "export default () => ({})" }];
  const layout = await folderLayout(scene, { "script:main": "code/player.ts" });
  const paths: Record<string, string> = {};
  const loaded = await readFolder({
    text: async (path) => layout.files.get(path) as string,
    binary: async () => {
      throw Error("Unexpected binary");
    },
    binding: (id, path) => {
      paths[id] = path;
    },
  });
  loaded.scripts![0].name = "Renamed.ts";
  const saved = await folderLayout(loaded, paths);
  expect(saved.scripts.main).toBe("code/player.ts");
  expect(saved.files.get("code/player.ts")).toBe(scene.scripts[0].source);
  loaded.scripts!.push({ id: "other", name: "Other.ts", source: "export default () => ({})" });
  await expect(
    folderLayout(loaded, { ...paths, "script:other": "code/PLAYER.ts" }),
  ).rejects.toThrow("Duplicate");
  const raw = JSON.parse(layout.files.get("scene.json") as string);
  raw.scripts.push({ ...raw.scripts[0], id: "other", name: "Other.ts", file: "code/PLAYER.ts" });
  layout.files.set("scene.json", JSON.stringify(raw));
  await expect(
    readFolder({
      text: async (path) => layout.files.get(path) as string,
      binary: async () => {
        throw Error("Unexpected binary");
      },
    }),
  ).rejects.toThrow("Duplicate");
});
