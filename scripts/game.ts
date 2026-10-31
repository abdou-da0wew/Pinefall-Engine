import { atomicWrite } from "../packages/project/src/atomic-file";
import { defaultRecipe, parseRecipe } from "../packages/assets/src/recipe";
import { convertModel } from "./convert-model";
import { prepareGlbRecord } from "../packages/assets/src/record";
import { adoptImport } from "../packages/assets/src/import";
import { newProjectMetadata, parseProjectMetadata } from "../packages/project/src/metadata";
import { packProject, unpackProject, inspectProject } from "../packages/project/src/pif";
import { typecheckScripts } from "./typecheck-scripts";
import { compileScript } from "../packages/scripting/src/compiler";
import { mkdir, copyFile, cp, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createGame, placeModel } from "../packages/project/src";
import { parseScene, serializeScene } from "../packages/runtime/src/schema";
import { HeadlessEngine } from "../packages/headless/src";
const [command, path, ...args] = process.argv.slice(2);
async function writeScene(path: string, scene: ReturnType<typeof createGame>) {
  await atomicWrite(
    path,
    path.toLowerCase().endsWith(".pif") ? await packProject(scene) : serializeScene(scene),
  );
}
async function main() {
  if (command === "new") {
    if (!path || !args[0]) throw Error('Usage: new output.scene.json "Game name"');
    if (await Bun.file(path).exists()) throw Error("Destination already exists");
    await writeScene(path, createGame(args[0]));
    return { created: path };
  }
  if (!path)
    throw Error(
      "Commands: new, inspect, validate, import, place, edit, simulate, export-web. See docs/CREATING-GAMES.md",
    );
  if (command === "verify-pif") {
    const hashIndex = args.indexOf("--sha256");
    if (hashIndex >= 0 && !args[hashIndex + 1]) throw Error("Provide an expected SHA-256 digest");
    const result = await inspectProject(await Bun.file(path).bytes(), {
      requireIntegrity: args.includes("--require-integrity"),
      ...(hashIndex >= 0 ? { expectedSha256: args[hashIndex + 1] } : {}),
    });
    return {
      valid: true,
      formatVersion: result.formatVersion,
      integrity: result.integrity,
      archiveSha256: result.archiveSha256,
      externalDigestMatched: hashIndex >= 0,
      authenticated: false,
      project: result.scene.project || null,
    };
  }
  const scene = path.toLowerCase().endsWith(".pif")
    ? await unpackProject(await Bun.file(path).bytes())
    : parseScene(await Bun.file(path).json());
  if (command === "metadata") {
    if (!args[0]) return scene.project || { metadata: "absent in legacy project" };
    const patch = JSON.parse(args[0]);
    if (
      !patch ||
      typeof patch !== "object" ||
      Array.isArray(patch) ||
      Object.keys(patch).some((k) => !["author", "description", "projectVersion"].includes(k))
    )
      throw Error("Metadata patch accepts author, description and projectVersion only");
    scene.project = parseProjectMetadata({
      ...(scene.project || newProjectMetadata(scene.name)),
      ...patch,
    });
    await writeScene(path, scene);
    return { updated: true, projectId: scene.project.id };
  }
  if (command === "pack" || command === "unpack") {
    if (!args[0] || (await Bun.file(args[0]).exists())) throw Error("Specify a new destination");
    if (
      (command === "pack" && !args[0].endsWith(".pif")) ||
      (command === "unpack" && !args[0].endsWith(".json"))
    )
      throw Error("Use .pif for pack and .json for legacy unpack");
    await writeScene(args[0], scene);
    return { written: args[0] };
  }
  if (command === "validate")
    return { valid: true, entities: scene.entities.length, assets: scene.assets.length };
  if (command === "inspect") return scene;
  if (command === "import" || command === "reimport") {
    const filename = command === "reimport" ? args[1] : args[0];
    if (!filename || !/\.(glb|fbx)$/i.test(filename)) throw Error("CLI import requires GLB or FBX");
    const old = command === "reimport" ? scene.assets.find((a) => a.id === args[0]) : undefined;
    if (command === "reimport" && !old) throw Error("Reimport asset ID not found");
    const recipeIndex = args.indexOf("--recipe");
    const recipe =
      recipeIndex >= 0
        ? parseRecipe(await Bun.file(args[recipeIndex + 1]).json())
        : old?.import?.recipe || defaultRecipe();
    const companions: string[] = [];
    for (let i = 0; i < args.length; i++)
      if (args[i] === "--companion") {
        if (!args[i + 1]) throw Error("Missing companion path");
        companions.push(args[++i]);
      }
    if (/\.glb$/i.test(filename) && (Bun.file(filename).size > 2_000_000 || companions.length))
      throw Error("GLB must be embedded and at most 2 MB");
    const prepared = /\.fbx$/i.test(filename)
      ? await convertModel(
          [filename, ...companions],
          recipe,
          args.includes("--allow-unsandboxed-converter"),
        )
      : await prepareGlbRecord(
          filename.split(/[\\/]/).pop()!,
          await Bun.file(filename).bytes(),
          recipe,
        );
    const mappingIndex = args.indexOf("--mapping");
    const mapping =
      mappingIndex >= 0
        ? ((await Bun.file(args[mappingIndex + 1]).json()) as Record<string, string>)
        : undefined;
    const result = adoptImport(
      scene,
      prepared,
      old ? { id: old.id, data: old.data, revision: old.import?.revision || 0 } : undefined,
      mapping,
    );
    await writeScene(path, result.scene);
    return { asset: result.asset.id, name: result.asset.name, report: prepared.metadata.report };
  }
  if (command === "place") {
    const result = placeModel(scene, args[0], args[1]);
    await writeScene(path, result.scene);
    return { entity: result.entity.id };
  }
  if (command === "edit") {
    const item = scene.entities.find((e) => e.id === args[0]);
    if (!item) throw Error("Entity not found");
    const patch = JSON.parse(args[1]);
    if (!patch || typeof patch !== "object" || Array.isArray(patch))
      throw Error("Expected JSON object");
    if ("id" in patch) throw Error("Entity IDs are immutable");
    Object.assign(item, { ...patch, transform: { ...item.transform, ...patch.transform } });
    await writeScene(path, parseScene(scene));
    return { edited: item.id };
  }
  if (command === "script-add") {
    if (!args[0]) throw Error("script-add requires a TypeScript file");
    const source = await Bun.file(args[0]).text();
    compileScript(source, args[0]);
    const id = crypto.randomUUID();
    scene.scripts ??= [];
    scene.scripts.push({ id, name: args[0].split(/[\\/]/).pop()!, source });
    await writeScene(path, scene);
    return { script: id };
  }
  if (command === "script-attach") {
    const e = scene.entities.find((e) => e.id === args[0]);
    if (!e) throw Error("Entity not found");
    const id = crypto.randomUUID();
    e.scripts ??= [];
    e.scripts.push({ id, script: args[1], enabled: true, props: JSON.parse(args[2] || "{}") });
    await writeScene(path, scene);
    return { attachment: id };
  }
  if (command === "script-typecheck") return await typecheckScripts(scene);
  if (command === "script-check") {
    for (const script of scene.scripts || []) compileScript(script.source, script.name);
    return {
      syntaxValid: true,
      scripts: scene.scripts?.length || 0,
      note: "Syntax only, no type checking or execution",
    };
  }
  if (command === "simulate") {
    const engine = await HeadlessEngine.create(scene);
    engine.allowSceneScripts = args.includes("--trust-scripts");
    try {
      for (const key of (args[1]?.startsWith("--") ? "" : args[1] || "").split(",").filter(Boolean))
        engine.input.add(key);
      engine.step(Number(args[0] || 120));
      return engine.report();
    } finally {
      engine.dispose();
    }
  }
  if (command === "export-web") {
    if (!args[0]) throw Error("Specify a new output directory");
    const output = resolve(args[0]);
    if (await stat(output).catch(() => null))
      throw Error("Output directory already exists; refusing overwrite");
    if (!(await Bun.file("dist/game.html").exists())) throw Error("Run bun run build first");
    await mkdir(output, { recursive: true });
    await cp("dist/assets", join(output, "assets"), { recursive: true });
    await copyFile("dist/game.html", join(output, "index.html"));
    for (const name of ["pinefall-logo.svg", "pinefall-app-icon.svg"])
      await copyFile(join("dist", name), join(output, name));
    const html = await Bun.file(join(output, "index.html")).text();
    await Bun.write(
      join(output, "index.html"),
      html.replace("<body", '<body data-scene="scene.json"'),
    );
    await writeScene(join(output, "scene.json"), scene);
    return {
      exported: output,
      serve: "Serve this directory using an HTTP static server. No editor required.",
    };
  }
  throw Error("Unknown command: " + command);
}
try {
  console.log(JSON.stringify(await main(), null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: String(error) }));
  process.exitCode = 1;
}
