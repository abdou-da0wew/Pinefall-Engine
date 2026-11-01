import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("http://localhost:5173/tests/runtime.html", { waitUntil: "networkidle" });
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(path),
      T = await load("/tests/graphics-test-api.ts"),
      { Effects } = await load("/packages/runtime/src/effects.ts"),
      { DEFAULT_POST, DEFAULT_SCATTERING } = await load(
        "/packages/runtime/src/graphics-definition.ts",
      ),
      { assetMemory } = await load("/packages/assets/src/budget.ts");
    const renderer = new T.WebGLRenderer({
      canvas: document.querySelector("canvas"),
      antialias: false,
    });
    renderer.setSize(64, 64, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.toneMapping = T.NoToneMapping;
    const scene = new T.Scene();
    scene.background = new T.Color("#000000");
    const camera = new T.PerspectiveCamera(60, 1, 0.1, 100);
    const planeGeometry = new T.PlaneGeometry(100, 100),
      black = new T.MeshBasicMaterial({ color: "#000000" }),
      plane = new T.Mesh(planeGeometry, black);
    plane.position.z = -10;
    scene.add(plane);
    const glassMaterial = new T.MeshBasicMaterial({
        color: "#000000",
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
      glass = new T.Mesh(planeGeometry, glassMaterial);
    glass.position.z = -1;
    scene.add(glass);
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
        steps: 16,
      },
    };
    const sample = () => {
      effects.draw(1 / 60);
      const pixel = new Uint8Array(4),
        gl = renderer.getContext();
      gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return pixel[0];
    };
    effects.configure(settings);
    const opaque = sample();
    effects.configure({
      ...settings,
      scattering: { ...settings.scattering, transparentDepth: "nearest" },
    });
    const nearest = sample();
    const restored =
      glassMaterial.depthWrite === false &&
      glassMaterial.colorWrite === true &&
      glassMaterial.alphaTest === 0;
    scene.remove(glass);
    const light = new T.DirectionalLight(0xffffff, 1);
    light.position.set(0, 10, -5);
    light.target.position.set(0, 0, -5);
    light.castShadow = true;
    light.shadow.mapSize.set(128, 128);
    Object.assign(light.shadow.camera, {
      left: -20,
      right: 20,
      top: 20,
      bottom: -20,
      near: 0.1,
      far: 40,
    });
    light.shadow.camera.updateProjectionMatrix();
    scene.add(light, light.target);
    const ceilingGeometry = new T.BoxGeometry(30, 1, 30),
      ceiling = new T.Mesh(ceilingGeometry, black);
    ceiling.position.set(0, 2, -5);
    ceiling.castShadow = true;
    scene.add(ceiling);
    effects.configure({
      ...settings,
      scattering: { ...settings.scattering, lighting: "directional-shadow", resolution: "full" },
    });
    const shadowed = sample(),
      shadowState = effects.snapshot.scattering.shadowed;
    ceiling.castShadow = false;
    const lit = sample();
    effects.configure({
      ...settings,
      scattering: {
        ...settings.scattering,
        resolution: "full",
        temporal: true,
        historyWeight: 0.8,
      },
    });
    sample();
    const firstWeight = effects.snapshot.scattering.historyWeightUsed;
    sample();
    const secondWeight = effects.snapshot.scattering.historyWeightUsed;
    camera.position.x = 20;
    sample();
    const cutWeight = effects.snapshot.scattering.historyWeightUsed;
    effects.resize(80, 64);
    const resizeRejected = !effects.snapshot.scattering.historyValid;
    effects.resize(64, 64);
    let budgetRejected = false;
    try {
      effects.resize(8192, 8192);
    } catch {
      budgetRejected = true;
    }
    camera.position.x = 0;
    effects.configure({
      ...settings,
      scattering: {
        ...settings.scattering,
        resolution: "full",
        temporal: true,
        historyWeight: 0.9,
      },
    });
    sample();
    sample();
    plane.position.z = -1;
    const movingNear = sample();
    plane.position.z = -10;
    const movingFar = sample();
    const thinGeometry = new T.PlaneGeometry(0.008, 10),
      thin = new T.Mesh(thinGeometry, black);
    thin.position.set(0.012, 0, -1);
    scene.add(thin);
    effects.configure({ ...settings, scattering: { ...settings.scattering, resolution: "half" } });
    const thinHalf = sample();
    effects.configure({ ...settings, scattering: { ...settings.scattering, resolution: "full" } });
    const thinFull = sample();
    scene.remove(thin);
    thinGeometry.dispose();
    const timings = [];
    for (let i = 0; i < 50; i++) {
      const start = performance.now();
      effects.configure({
        ...settings,
        scattering: {
          ...settings.scattering,
          resolution: i % 2 ? "full" : "half",
          temporal: i % 3 === 0,
          transparentDepth: i % 4 === 0 ? "nearest" : "opaque",
          steps: [8, 16, 32][i % 3],
        },
      });
      sample();
      timings.push(performance.now() - start);
    }
    effects.dispose();
    planeGeometry.dispose();
    ceilingGeometry.dispose();
    black.dispose();
    glassMaterial.dispose();
    light.shadow.dispose();
    renderer.dispose();
    return {
      opaque,
      nearest,
      restored,
      shadowed,
      lit,
      shadowState,
      firstWeight,
      secondWeight,
      cutWeight,
      resizeRejected,
      budgetRejected,
      movingNear,
      movingFar,
      thinHalf,
      thinFull,
      released: assetMemory.snapshot.used === baseline,
      cpuSubmitMs: {
        min: Math.min(...timings),
        max: Math.max(...timings),
        mean: timings.reduce((a, b) => a + b, 0) / timings.length,
      },
    };
  });

  expect(result.opaque).toBeGreaterThan(result.nearest + 50);
  expect(result.restored).toBe(true);
  expect(result.shadowState).toBe(true);
  expect(result.lit).toBeGreaterThan(result.shadowed + 30);
  expect(result.firstWeight).toBe(0);
  expect(result.secondWeight).toBe(0.8);
  expect(result.cutWeight).toBe(0);
  expect(result.resizeRejected).toBe(true);
  expect(result.budgetRejected).toBe(true);
  expect(result.movingFar).toBeGreaterThan(result.movingNear + 50);
  expect(Math.abs(result.thinHalf - result.thinFull)).toBeLessThanOrEqual(3);
  expect(result.thinFull).toBeLessThan(result.opaque - 50);
  expect(result.released).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "PASS advanced scattering: " +
      JSON.stringify(result) +
      "; timings are SwiftShader CPU submit+readback, NOT physical GPU measurements",
  );
} finally {
  await browser.close();
}
