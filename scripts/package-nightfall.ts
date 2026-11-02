import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve("build/nightfall/desktop");
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
await cp("build/nightfall/web", root + "/game", { recursive: true });
const result = await Bun.build({
  entrypoints: ["examples/nightfall/desktop.ts"],
  outdir: root,
  target: "node",
  external: ["electron"],
  format: "esm",
  naming: "main.mjs",
});
if (!result.success) throw Error(result.logs.map(String).join("\n"));
await writeFile(
  root + "/package.json",
  JSON.stringify(
    {
      name: "nightfall-keep",
      version: "0.1.0",
      description: "Standalone Pinefall Engine survival horror game",
      author: "abdou-da0wew",
      private: true,
      type: "module",
      main: "main.mjs",
      build: {
        appId: "org.pinefall.nightfallkeep",
        productName: "Nightfall Keep",
        electronVersion: "45.2.1",
        directories: { output: resolve("build/nightfall/releases") },
        files: ["main.mjs", "game/**/*", "package.json"],
        linux: {
          target: "AppImage",
          category: "Game",
          icon: resolve("public/pinefall-app-icon.png"),
        },
        win: { target: "zip", icon: resolve("desktop/icon.ico") },
        npmRebuild: false,
      },
    },
    null,
    2,
  ),
);
const child = Bun.spawn(
  [
    "node",
    resolve("node_modules/electron-builder/cli.js"),
    "--projectDir",
    root,
    "--linux",
    "AppImage",
    "--win",
    "zip",
  ],
  { stdout: "inherit", stderr: "inherit" },
);
if (await child.exited) throw Error("Standalone game packaging failed");
