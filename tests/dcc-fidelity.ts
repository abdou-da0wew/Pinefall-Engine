import { expect } from "bun:test";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Vector3, Mesh, SkinnedMesh, AnimationMixer, LoopOnce } from "three";
import manifest from "./fixtures/dcc-manifest.json";
import { convertModel } from "../scripts/convert-model";
import { defaultRecipe } from "../packages/assets/src/recipe";
import { hashBytes } from "../packages/assets/src/blobs";
import { fromDataURI } from "../packages/assets/src/glb";
async function fixture(f: { name: string; url: string; sha256: string }) {
  const path = ".cache/dcc/" + f.name;
  if (!(await Bun.file(path).exists())) {
    if (!process.argv.includes("--fetch"))
      throw Error("Missing " + f.name + "; pass --fetch for pinned external fixtures");
    const response = await fetch(f.url);
    if (!response.ok) throw Error("Fixture download failed");
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length > 4_000_000 || (await hashBytes(data)) !== f.sha256)
      throw Error("Fixture hash/budget mismatch");
    await Bun.write(path, data);
  }
  expect(await hashBytes(await Bun.file(path).bytes())).toBe(f.sha256);
  return path;
}
const evidence = [];
for (const f of manifest.fixtures) {
  const path = await fixture(f),
    start = performance.now(),
    result = await convertModel(
      [path],
      defaultRecipe(),
      process.argv.includes("--allow-unsandboxed-converter"),
    );
  expect(
    result.metadata.report.identities!.filter((i) => i.kind === "skeleton").length,
  ).toBeGreaterThanOrEqual(f.minimumSkins);
  expect(result.metadata.report.clips.length).toBeGreaterThanOrEqual(f.minimumClips);
  const poses = [];
  for (const pose of f.poses) {
    const reference = await fixture(pose),
      gltf = await new GLTFLoader().parseAsync(new Uint8Array(fromDataURI(result.data)).buffer, "");
    const mixer = new AnimationMixer(gltf.scene),
      clip = gltf.animations.find((c) => c.name === pose.clip);
    expect(clip).toBeDefined();
    const action = mixer.clipAction(clip!);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(pose.time);
    gltf.scene.updateMatrixWorld(true);
    const vertices: Vector3[] = [];
    gltf.scene.traverse((o) => {
      if (o instanceof SkinnedMesh) o.skeleton.update();
      if (o instanceof Mesh)
        for (let i = 0; i < o.geometry.getAttribute("position").count; i++) {
          const p = new Vector3();
          o.getVertexPosition(i, p);
          vertices.push(p.applyMatrix4(o.matrixWorld));
        }
    });
    const expected = (await Bun.file(reference).text())
      .split("\n")
      .filter((l) => l.startsWith("v "))
      .map(
        (l) => new Vector3(...(l.split(/\s+/).slice(1).map(Number) as [number, number, number])),
      );
    expect(vertices.length).toBeGreaterThan(0);
    expect(expected.length).toBeGreaterThan(0);
    const distance = (a: Vector3[], b: Vector3[]) =>
      Math.max(...a.map((p) => Math.sqrt(Math.min(...b.map((q) => p.distanceToSquared(q))))));
    const error = Math.max(distance(vertices, expected), distance(expected, vertices));
    expect(error).toBeLessThan(pose.tolerance);
    poses.push({
      reference: pose.name,
      time: pose.time,
      maxBidirectionalVertexDistance: error,
      tolerance: pose.tolerance,
    });
    mixer.stopAllAction();
    mixer.uncacheRoot(gltf.scene);
  }
  evidence.push({
    name: f.name,
    exporter: f.exporter,
    sourceHash: f.sha256,
    artifactHash: result.metadata.artifactHash,
    elapsedMs: performance.now() - start,
    poses,
  });
}
await Bun.write(
  "build/dcc-evidence.json",
  JSON.stringify(
    {
      date: new Date().toISOString(),
      scope:
        "Independent vertex/skin animation poses, not artist visual approval or physical GPU certification",
      evidence,
    },
    null,
    2,
  ),
);
console.log(
  "PASS independent Blender/Maya pose fixtures and Blender morph-character conversion",
  JSON.stringify(evidence),
);
