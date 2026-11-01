import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
const root = "build/sdk";
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
const process = Bun.spawn(
  [
    "bun",
    "node_modules/typescript/bin/tsc",
    "--ignoreConfig",
    "packages/scripting/src/sdk.ts",
    "--declaration",
    "--emitDeclarationOnly",
    "--outDir",
    root + "/packages",
    "--rootDir",
    "packages",
    "--skipLibCheck",
    "--moduleResolution",
    "bundler",
    "--target",
    "ES2022",
    "--module",
    "esnext",
    "--types",
    "vite/client",
    "--allowImportingTsExtensions",
    "--strict",
  ],
  { stdout: "inherit", stderr: "inherit" },
);
if (await process.exited) throw Error("SDK declaration generation failed");
const files: Record<string, string> = {};
async function collect(directory: string, prefix: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) await collect(join(directory, entry.name), prefix + entry.name + "/");
    else if (entry.name.endsWith(".d.ts"))
      files[prefix + entry.name] = await readFile(join(directory, entry.name), "utf8");
  }
}
await collect(root + "/packages", "pinefall-sdk/packages/");
await collect("node_modules/@types/three", "pinefall-sdk/types/three/");
await collect("node_modules/@dimforge/rapier3d-compat", "pinefall-sdk/types/rapier/");
files["pinefall-sdk/README.md"] =
  "# Pinefall IDE typing kit\n\nGenerated declarations for the installed engine. No package installation or project code execution is required. These files provide editor types, not runtime implementations. Editing them does not change the installed engine. Regenerate in a clean kit directory when upgrading.\n";
for (const [source, target] of [
  ["node_modules/@types/three/LICENSE", "three-types-license.txt"],
  ["docs/licenses/typescript-Apache-2.0.txt", "rapier-Apache-2.0.txt"],
])
  files["pinefall-sdk/" + target] = await readFile(source, "utf8");
await Bun.write(root + "/manifest.json", JSON.stringify(files));
console.log("Portable SDK:", Object.keys(files).length, "files");
