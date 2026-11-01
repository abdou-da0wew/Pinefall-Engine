import type * as TS from "typescript-language-service";
import compilerURL from "/build/language-service/compiler.mjs?url";
let ts: typeof TS;
import type { ScriptAsset } from "../../runtime/src/schema";
const sources = import.meta.glob<string>(
  "/packages/{runtime,scripting,assets,audio,animation,ui,project}/src/**/*.ts",
  { query: "?raw", import: "default", eager: true },
);
const declarations = import.meta.glob<string>("/node_modules/@types/three/**/*.d.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});
const physics = import.meta.glob<string>("/node_modules/@dimforge/rapier3d-compat/**/*.d.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});
const libraries = import.meta.glob<string>(
  "/node_modules/typescript-language-service/lib/lib.*.d.ts",
  { query: "?raw", import: "default", eager: true },
);
const files = new Map<string, string>(Object.entries({ ...sources, ...declarations, ...physics }));
for (const [path, value] of Object.entries(libraries))
  files.set("/lib/" + path.split("/").at(-1), value);
const directories = new Set<string>(["/", "/project"]);
for (const path of files.keys()) {
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join("/") || "/");
}
let generation = 0;
let roots: string[] = [];
let options: TS.CompilerOptions = {};
const host: TS.LanguageServiceHost = {
  getScriptFileNames: () => roots,
  getScriptVersion: (path) => (path.startsWith("/project/") ? String(generation) : "0"),
  getScriptSnapshot: (path) => {
    const source = files.get(path);
    return source === undefined ? undefined : ts.ScriptSnapshot.fromString(source);
  },
  getCurrentDirectory: () => "/project",
  getCompilationSettings: () => options,
  getDefaultLibFileName: () => "/lib/lib.d.ts",
  fileExists: (path) => files.has(path),
  readFile: (path) => files.get(path),
  directoryExists: (path) => directories.has(path),
  readDirectory: () => [],
  useCaseSensitiveFileNames: () => true,
};
const ready = import(/* @vite-ignore */ compilerURL).then((module) => {
  ts = module.default;
  return ts.createLanguageService(host);
});
/** Read-only virtual filesystem: project imports cannot read the host filesystem or execute plugins. */
self.onmessage = async (
  event: MessageEvent<{ id: number; scripts: ScriptAsset[]; paths: Record<string, string> }>,
) => {
  try {
    const service = await ready;
    const { scripts, paths, id } = event.data;
    if (
      !Array.isArray(scripts) ||
      scripts.length > 64 ||
      scripts.reduce((n, s) => n + s.source.length, 0) > 512000
    )
      throw Error("Type-check source budget");
    for (const root of roots) files.delete(root);
    roots = [];
    generation++;
    const aliases: Record<string, string[]> = {
      "@pinefall/sdk": ["/packages/scripting/src/sdk.ts"],
      three: ["/node_modules/@types/three/index.d.ts"],
      "three/*": ["/node_modules/@types/three/*"],
      "three/addons/*": ["/node_modules/@types/three/examples/jsm/*"],
      "@dimforge/rapier3d-compat": ["/node_modules/@dimforge/rapier3d-compat/rapier.d.ts"],
    };
    const names = new Set<string>();
    scripts.forEach((script, index) => {
      if (names.has(script.name))
        throw Error("Type checking requires distinct script module names: " + script.name);
      names.add(script.name);
      const path = `/project/${index}.ts`;
      files.set(path, script.source);
      roots.push(path);
      aliases["@game/" + script.name] = [path];
      aliases["@game/" + script.name.replace(/\.ts$/, "")] = [path];
    });
    options = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
      esModuleInterop: true,
      types: [],
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
      paths: aliases,
    };
    const diagnostics = roots
      .flatMap((root, index) =>
        [...service.getSyntacticDiagnostics(root), ...service.getSemanticDiagnostics(root)]
          .filter((d) => d.category === ts.DiagnosticCategory.Error)
          .map((d) => {
            const position =
              d.file && d.start !== undefined
                ? d.file.getLineAndCharacterOfPosition(d.start)
                : { line: 0, character: 0 };
            return {
              file: paths[`script:${scripts[index].id}`] ?? scripts[index].name,
              line: position.line + 1,
              column: position.character + 1,
              severity: "error",
              code: d.code,
              message: ts.flattenDiagnosticMessageText(d.messageText, "\n").slice(0, 4096),
            };
          }),
      )
      .slice(0, 128);
    self.postMessage({ id, diagnostics });
  } catch (error) {
    self.postMessage({ id: event.data.id, error: String(error) });
  }
};
