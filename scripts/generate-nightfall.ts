import { rm, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { nightfallScene } from "../examples/nightfall/generate";
import { referenceScene } from "../packages/assets/src/documents";
import { blobs } from "../packages/assets/src/blobs";
import { folderLayout } from "../packages/project/src/folder-format";
import { packProject } from "../packages/project/src/pif";
const scene = await referenceScene(await nightfallScene());
const layout = await folderLayout(scene);
await rm("build/nightfall/project", { recursive: true, force: true });
for (const [path, content] of layout.files) {
  const target = "build/nightfall/project/" + path;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(
    target,
    typeof content === "string" ? content : await blobs.readAsync(content.ref),
  );
}
await mkdir("public", { recursive: true });
const packed = await packProject(scene);
await writeFile("build/nightfall/Nightfall-Keep.pif", packed);
await writeFile("public/Nightfall-Keep.pif", packed);
console.log(
  `Nightfall generated: ${scene.entities.length} entities, ${scene.assets.length} model assets. Folder: build/nightfall/project; portable: build/nightfall/Nightfall-Keep.pif`,
);
