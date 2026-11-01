import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("http://localhost:5173/tests/runtime.html", { waitUntil: "networkidle" });
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(path),
      T = await load("/tests/graphics-test-api.ts");
    const { Effects } = await load("/packages/runtime/src/effects.ts");
    const { DEFAULT_POST, DEFAULT_SCATTERING } = await load(
      "/packages/runtime/src/graphics-definition.ts",
    );
    const { assetMemory } = await load("/packages/assets/src/budget.ts");
    const renderer = new T.WebGLRenderer({
      canvas: document.querySelector("canvas")!,
      antialias: false,
    });
    renderer.setSize(64, 64, false);
    renderer.toneMapping = T.NoToneMapping;
    const scene = new T.Scene();
    scene.background = new T.Color("#000000");
    const camera = new T.PerspectiveCamera(60, 1, 0.1, 100),
      material = new T.MeshBasicMaterial({ color: "#000000" });
    const geometry = new T.PlaneGeometry(100, 100),
      plane = new T.Mesh(geometry, material);
    plane.position.z = -1;
    scene.add(plane);
    const baseline = assetMemory.snapshot.used,
      effects = new Effects(renderer, scene, camera);
    effects.resize(64, 64);
    const settings = {
      ...DEFAULT_POST,
      enabled: true,
      toneMapping: "none",
      scattering: {
        ...DEFAULT_SCATTERING,
        density: 0.1,
        heightFalloff: 0,
        color: "#ffffff",
        steps: 8,
      },
    };
    const sample = (x = 32) => {
      effects.draw(1 / 60);
      const gl = renderer.getContext(),
        pixel = new Uint8Array(4);
      gl.readPixels(x, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return pixel[0];
    };
    effects.configure(settings);
    const near = sample();
    plane.position.z = -10;
    const far = sample();
    const smallGeometry = new T.PlaneGeometry(1, 100),
      occluder = new T.Mesh(smallGeometry, material);
    occluder.position.set(-0.5, 0, -1);
    scene.add(occluder);
    const edgeNear = sample(31),
      edgeFar = sample(32);
    for (let cycle = 0; cycle < 50; cycle++) {
      effects.configure({
        ...settings,
        scattering: { ...settings.scattering, steps: cycle % 2 ? 16 : 32 },
      });
      effects.resize(cycle % 2 ? 80 : 64, 64);
      effects.draw(1 / 60);
      effects.configure({ ...DEFAULT_POST, enabled: true });
    }
    effects.dispose();
    smallGeometry.dispose();
    geometry.dispose();
    material.dispose();
    const textures = renderer.info.memory.textures;
    renderer.dispose();
    return {
      near,
      far,
      edgeNear,
      edgeFar,
      textures,
      released: assetMemory.snapshot.used === baseline,
    };
  });
  expect(Math.abs(result.near - 87)).toBeLessThan(6);
  expect(Math.abs(result.far - 208)).toBeLessThan(6);
  expect(result.edgeFar - result.edgeNear).toBeGreaterThan(100);
  expect(result.released).toBe(true);
  expect(result.textures).toBe(0);
  expect(errors).toEqual([]);
  console.log(
    "PASS scattering: Beer-Lambert pixels, opaque termination, depth-aware edge upsampling, 8/16/32 steps, 50 toggle/resize cycles, resource cleanup",
    JSON.stringify(result),
  );
} finally {
  await browser.close();
}
