import { mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { SceneDocument } from "../packages/runtime/src/schema";
/** Real tsc checking; operates on copied source and never imports/evaluates user scripts. */
export async function typecheckScripts(scene: SceneDocument) {
  const root = resolve("."),
    dir = join(root, "build", "scriptcheck-" + crypto.randomUUID());
  await mkdir(dir, { recursive: true });
  try {
    const names = new Set<string>();
    for (const script of scene.scripts || []) {
      if (!/^[A-Za-z0-9_.-]+\.ts$/.test(script.name) || names.has(script.name))
        throw Error("Type checking requires unique simple .ts filenames");
      names.add(script.name);
      await Bun.write(join(dir, script.name), script.source);
    }
    if (!names.size) return { typechecked: true, scripts: 0 };
    await Bun.write(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          allowImportingTsExtensions: true,
          esModuleInterop: true,
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          types: ["bun", "vite/client"],
          paths: {
            "@pinefall/sdk": [join(root, "packages/scripting/src/sdk.ts")],
            "@game/*": [join(dir, "*")],
          },
        },
        include: ["*.ts"],
      }),
    );
    const proc = Bun.spawn(
      [
        process.execPath,
        join(root, "node_modules/typescript/bin/tsc"),
        "--project",
        join(dir, "tsconfig.json"),
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    if (code !== 0) throw Error((stdout + stderr).replaceAll(dir, "scene-scripts"));
    return { typechecked: true, scripts: names.size };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
