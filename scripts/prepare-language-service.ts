// Prebundle the trusted compiler as a lazy asset. Keeping its large AST out of
// Vite/Rollup prevents multi-gigabyte build spikes on small development machines.
const result = await Bun.build({
  entrypoints: ["node_modules/typescript-language-service/lib/typescript.js"],
  outdir: "build/language-service",
  naming: "compiler.mjs",
  target: "browser",
  format: "esm",
  minify: true,
  external: ["fs", "path", "os", "crypto", "perf_hooks", "inspector", "source-map-support"],
});
if (!result.success) throw Error(result.logs.map(String).join("\n"));

export {};
