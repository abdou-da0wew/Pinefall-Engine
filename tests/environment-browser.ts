import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5173/tests/runtime.html");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const T = await load("/node_modules/three/build/three.module.js");
    const { acquireEnvironment, invalidateEnvironments } = await load(
      "/packages/runtime/src/environment.ts",
    );
    const { assetMemory } = await load("/packages/assets/src/budget.ts");
    const baseline = assetMemory.snapshot.used;
    const renderer = new T.WebGLRenderer();
    renderer.setSize(64, 64);
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(45, 1, 0.1, 10);
    camera.position.z = 3;
    const geometry = new T.SphereGeometry(1, 24, 16),
      material = new T.MeshStandardMaterial({ metalness: 1, roughness: 0.25 });
    scene.add(new T.Mesh(geometry, material));
    const target = new T.WebGLRenderTarget(64, 64),
      pixel = new Uint8Array(4);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 32, 32, 1, 1, pixel);
    const before = pixel[0];
    const definition = { sky: "#ffffff", ground: "#303030", intensity: 1, resolution: 128 };
    const first = acquireEnvironment(renderer, definition),
      second = acquireEnvironment(renderer, { ...definition, intensity: 2 });
    if (!first || !second) throw Error("Test requires float target support");
    const shared = first.texture === second.texture;
    scene.environment = second.texture;
    first.release();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 32, 32, 1, 1, pixel);
    const after = pixel[0];
    invalidateEnvironments(renderer);
    const restored = acquireEnvironment(renderer, definition);
    const regenerated = restored.texture !== second.texture;
    second.release();
    scene.environment = restored.texture;
    renderer.render(scene, camera);
    restored.release();
    scene.environment = null;
    target.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    return { before, after, shared, regenerated, released: assetMemory.snapshot.used === baseline };
  });
  expect(result.before).toBe(0);
  expect(result.after).toBeGreaterThan(10);
  expect(result.shared).toBe(true);
  expect(result.regenerated).toBe(true);
  expect(result.released).toBe(true);
  console.log(
    "PASS PMREM lighting pixels, lease sharing, generation invalidation and cleanup",
    JSON.stringify(result),
  );
} finally {
  await browser.close();
}
