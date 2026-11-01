import { createHash } from "node:crypto";
import type { DiskWorkspace } from "./disk-workspace";
import { projectRelativePath } from "./disk-path";
const encode = (text: string) => new TextEncoder().encode(text);
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
/** Installs declarations only. Existing user files are never force-overwritten. */
export async function installIdeKit(disk: DiskWorkspace, files: Record<string, string>) {
  const entries = Object.entries(files);
  if (
    entries.length > 2000 ||
    entries.some(
      ([path, text]) =>
        !path.startsWith("pinefall-sdk/") ||
        typeof text !== "string" ||
        encode(text).length > 1048576,
    )
  )
    throw Error("Invalid SDK kit");
  for (const [path, text] of entries) {
    projectRelativePath(path);
    const actual = await disk.fingerprint(path);
    if (actual !== null && actual !== hash(text))
      throw Error(
        "Modified SDK file preserved: " +
          path +
          ". Move the existing pinefall-sdk directory aside before installing the new kit.",
      );
  }
  const bytes = await disk.read("scene.json", 0, 1048576);
  if (bytes.total > bytes.bytes.length)
    throw Error("Scene metadata exceeds SDK configuration budget");
  const scene = JSON.parse(new TextDecoder().decode(bytes.bytes));
  const paths: Record<string, string[]> = {
    "@pinefall/sdk": ["./pinefall-sdk/packages/scripting/src/sdk.d.ts"],
    three: ["./pinefall-sdk/types/three/index.d.ts"],
    "three/*": ["./pinefall-sdk/types/three/*"],
    "three/addons/*": ["./pinefall-sdk/types/three/examples/jsm/*"],
    "@dimforge/rapier3d-compat": ["./pinefall-sdk/types/rapier/rapier.d.ts"],
  };
  for (const script of scene.scripts ?? []) {
    if (typeof script.name !== "string") throw Error("Invalid script module name");
    const file = "./" + projectRelativePath(script.file);
    paths["@game/" + script.name] = [file];
    paths["@game/" + script.name.replace(/\.ts$/, "")] = [file];
  }
  const config =
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          allowImportingTsExtensions: true,
          esModuleInterop: true,
          types: [],
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          paths,
        },
        include: ["**/*.ts"],
        exclude: ["pinefall-sdk", "node_modules"],
      },
      null,
      2,
    ) + "\n";
  const configPath = "tsconfig.pinefall.json",
    stampPath = "pinefall-sdk/config-hash.txt";
  const previous = await disk.fingerprint(configPath);
  let baseline: string | null = null;
  if (await disk.fingerprint(stampPath))
    baseline = new TextDecoder().decode((await disk.read(stampPath, 0, 128)).bytes);
  if (previous !== null && previous !== hash(config) && previous !== baseline)
    throw Error("Edited tsconfig.pinefall.json preserved; move it aside before regeneration");
  for (const [path, text] of entries)
    if ((await disk.fingerprint(path)) === null) await disk.write(path, encode(text), null);
  if (previous !== hash(config)) await disk.write(configPath, encode(config), previous);
  await disk.write(stampPath, encode(hash(config)), await disk.fingerprint(stampPath));
  if ((await disk.fingerprint("tsconfig.json")) === null)
    await disk.write("tsconfig.json", encode('{"extends":"./tsconfig.pinefall.json"}\n'), null);
  return "Portable IDE typings installed. Existing tsconfig.json was preserved; if customized, extend ./tsconfig.pinefall.json. Refresh this kit after changing registered script names.";
}
