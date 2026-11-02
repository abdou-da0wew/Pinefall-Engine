import { rm, cp, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const destination = "build/nightfall/web";
await rm(destination, { recursive: true, force: true });
await mkdir(destination + "/assets", { recursive: true });
const html = (await readFile("dist/nightfall.html", "utf8")).replace(
  "<body>",
  '<body data-standalone="true">',
);
await writeFile(destination + "/index.html", html);
const assets = await readdir("dist/assets"),
  pending = assets.filter((name) => html.includes(name)),
  copied = new Set<string>();
while (pending.length) {
  const name = pending.pop()!;
  if (copied.has(name)) continue;
  copied.add(name);
  await copyFile("dist/assets/" + name, destination + "/assets/" + name);
  if (/\.(?:js|css|mjs)$/.test(name)) {
    const source = await readFile("dist/assets/" + name, "utf8");
    for (const dependency of assets)
      if (!copied.has(dependency) && source.includes(dependency)) pending.push(dependency);
  }
}
await copyFile("public/Nightfall-Keep.pif", destination + "/Nightfall-Keep.pif");
await copyFile("examples/nightfall/serve.ts", destination + "/serve.ts");
await copyFile("docs/NIGHTFALL-KEEP.md", destination + "/README.md");
await copyFile("THIRD_PARTY.md", destination + "/THIRD_PARTY.md");
await cp("docs/licenses", destination + "/docs/licenses", { recursive: true });
await copyFile("docs/NIGHTFALL-KEEP.md", "build/nightfall/project/README.md");
await copyFile("docs/CREATING-PIF-GAMES.md", destination + "/docs/CREATING-PIF-GAMES.md");
await copyFile("docs/CREATING-PIF-GAMES.md", "build/nightfall/project/CREATING-PIF-GAMES.md");
for (const [folder, name] of [
  ["web", "Nightfall-Keep-web.zip"],
  ["project", "Nightfall-Keep-project.zip"],
]) {
  const zip = resolve("build/nightfall/" + name);
  await rm(zip, { force: true });
  const process = Bun.spawnSync(["zip", "-q", "-r", zip, "."], {
    cwd: resolve("build/nightfall/" + folder),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (process.exitCode) throw Error(process.stderr.toString());
}
console.log(
  `Exported production Nightfall game with ${copied.size} reachable build assets; editable project and web ZIPs in build/nightfall.`,
);
