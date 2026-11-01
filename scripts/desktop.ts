import { copyFile, mkdir } from "node:fs/promises";
import "./prepare-sdk";
await Bun.build({
  entrypoints: ["desktop/main.ts"],
  outdir: "build-desktop",
  target: "node",
  external: ["electron"],
  naming: "main.mjs",
});
await Bun.build({
  entrypoints: ["desktop/preload.ts"],
  outdir: "build-desktop",
  target: "node",
  format: "cjs",
  external: ["electron"],
  naming: "preload.cjs",
});

await mkdir("dist/sdk", { recursive: true });
await copyFile("build/sdk/manifest.json", "dist/sdk/manifest.json");

const archive = await Bun.build({
  entrypoints: ["desktop/archive-worker.ts"],
  outdir: "build-desktop",
  target: "node",
  naming: "archive-worker.mjs",
});
if (!archive.success) throw Error(archive.logs.map(String).join("\n"));
