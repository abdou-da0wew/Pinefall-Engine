export {};
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
