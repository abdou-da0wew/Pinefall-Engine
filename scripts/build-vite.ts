/** Bun orchestrates the build; run the vendored Vite bundler with a bounded Node heap.
 * Forcing Vite/Rollup through Bun's JS engine exceeded the 2 GiB build container
 * when additional image workers were included. This does not affect Electron/game runtime. */
const child = Bun.spawn(
  ["node", "--max-old-space-size=1024", "node_modules/vite/bin/vite.js", "build"],
  { stdin: "inherit", stdout: "inherit", stderr: "inherit" },
);
process.exitCode = await child.exited;

export {};
