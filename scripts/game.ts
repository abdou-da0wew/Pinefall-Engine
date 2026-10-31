import { mkdir, copyFile, cp, stat, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createGame, importModel, placeModel } from "../packages/project/src";
import { parseScene, serializeScene } from "../packages/runtime/src/schema";
import { HeadlessEngine } from "../packages/headless/src";
const [command, path, ...args] = process.argv.slice(2);
async function writeScene(path: string, scene: ReturnType<typeof createGame>) {
  const tmp = path + ".tmp-" + crypto.randomUUID();
  await Bun.write(tmp, serializeScene(scene));
  await rename(tmp, path);
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
  const scene = parseScene(await Bun.file(path).json());
  if (command === "validate")
    return { valid: true, entities: scene.entities.length, assets: scene.assets.length };
  if (command === "inspect") return scene;
  if (command === "import") {
    if (!args[0]) throw Error("import requires a .glb path");
    const result = importModel(
      scene,
      args[0].split(/[\\/]/).pop()!,
      new Uint8Array(await Bun.file(args[0]).arrayBuffer()),
    );
    await writeScene(path, result.scene);
    return { asset: result.asset.id, name: result.asset.name };
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
  if (command === "simulate") {
    const engine = await HeadlessEngine.create(scene);
    try {
      for (const key of (args[1] || "").split(",").filter(Boolean)) engine.input.add(key);
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
