import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createGame } from "../packages/project/src";
import { folderLayout, readFolder } from "../packages/project/src/folder-format";
import { DiskWorkspace } from "../packages/project/src/disk-workspace";
import { registerProjectSource } from "../packages/project/src/source-registration";
import { DEFAULT_SHADER } from "../packages/runtime/src/shader-definition";
import { DEFAULT_SURFACE } from "../packages/runtime/src/graphics-definition";
const encoder = new TextEncoder();
test("source registration preserves files and registers TS, GLSL, metadata and materials without executing or attaching code", async () => {
  const root = await mkdtemp(resolve("build/source-register-")),
    disk = await DiskWorkspace.open(root);
  const write = (path: string, text: string) => disk.write(path, encoder.encode(text), null);
  const read = () =>
    readFolder({
      text: (path) => readFile(join(root, path), "utf8"),
      binary: async () => {
        throw Error("Unexpected binary");
      },
    });
  try {
    const layout = await folderLayout(createGame("Registration"));
    for (const [path, text] of layout.files) {
      if (typeof text !== "string") throw Error("Unexpected binary");
      await write(path, text);
    }
    const code = "throw Error('registration cannot execute'); export default () => ({});";
    await write("scripts/nested/Logic.ts", code);
    const registered = await registerProjectSource(disk, "scripts/nested/Logic.ts", "Logic.ts");
    expect(registered.kind).toBe("script");
    expect((await read()).scripts?.[0].source).toBe(code);
    expect(await readFile(join(root, "scripts/nested/Logic.ts"), "utf8")).toBe(code);
    const before = await disk.fingerprint("scene.json");
    await expect(
      registerProjectSource(disk, "scripts/nested/Logic.ts", "Duplicate.ts"),
    ).rejects.toThrow("Duplicate");
    expect(await disk.fingerprint("scene.json")).toBe(before);
    await write("shaders/raw.glsl", DEFAULT_SHADER.fragment);
    expect((await registerProjectSource(disk, "shaders/raw.glsl", "Raw shader")).kind).toBe(
      "shader",
    );
    let scene = await read();
    expect(scene.graphics?.shaders?.[0].fragment).toBe(DEFAULT_SHADER.fragment);
    expect(scene.entities.every((e) => !e.mesh?.shader)).toBe(true);
    await write("external/second.glsl", DEFAULT_SHADER.fragment);
    await write("external/uniforms.json", JSON.stringify(DEFAULT_SHADER.uniforms));
    await write(
      "external/shader.json",
      JSON.stringify({
        id: "existing-id",
        name: "Existing metadata",
        version: 1,
        source: "external/second.glsl",
        uniforms: "external/uniforms.json",
      }),
    );
    expect((await registerProjectSource(disk, "external/shader.json", "ignored")).id).toBe(
      "existing-id",
    );
    await write(
      "materials/paint.json",
      JSON.stringify({ ...DEFAULT_SURFACE, id: "paint", name: "Paint" }),
    );
    expect((await registerProjectSource(disk, "materials/paint.json", "ignored")).kind).toBe(
      "material",
    );
    scene = await read();
    expect(scene.graphics?.materials[0].name).toBe("Paint");
    expect(scene.graphics?.shaders?.length).toBe(2);
    await expect(registerProjectSource(disk, "external/uniforms.json", "Uniforms")).rejects.toThrow(
      "uniform file alone",
    );
    await write("scripts/types.d.ts", "export interface Example {}");
    await expect(registerProjectSource(disk, "scripts/types.d.ts", "types")).rejects.toThrow(
      "authored",
    );
    const inventory = (await disk.inventory()).map((e) => e.path);
    await write("shaders/oversized.glsl", "x".repeat(16385));
    await expect(registerProjectSource(disk, "shaders/oversized.glsl", "bad")).rejects.toThrow(
      "budget",
    );
    expect((await disk.inventory()).map((e) => e.path)).toEqual(
      [...inventory, "shaders/oversized.glsl"].sort(),
    );
  } finally {
    await disk.close();
    await rm(root, { recursive: true, force: true });
  }
});
