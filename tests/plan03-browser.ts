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
    const load = (path: string) => import(path);
    const T = await load("/tests/graphics-test-api.ts");
    const { Effects } = await load("/packages/runtime/src/effects.ts");
    const { DEFAULT_POST, DEFAULT_SURFACE, emptyGraphics } = await load(
      "/packages/runtime/src/graphics-definition.ts",
    );
    const { assetMemory } = await load("/packages/assets/src/budget.ts");
    const { Engine, entity } = await load("/packages/runtime/src/index.ts");
    const { createGame } = await load("/packages/project/src/index.ts");
    const assert = (ok: boolean, message: string) => {
      if (!ok) throw Error(message);
    };
    const canvas = document.querySelector("canvas")!;
    const renderer = new T.WebGLRenderer({ canvas, antialias: false });
    renderer.setSize(64, 64, false);
    renderer.toneMapping = T.NoToneMapping;
    renderer.outputColorSpace = T.SRGBColorSpace;
    const scene = new T.Scene();
    scene.background = new T.Color("#808080");
    const camera = new T.PerspectiveCamera();
    const baseline = assetMemory.snapshot.used;
    const effects = new Effects(renderer, scene, camera);
    effects.resize(64, 64);
    effects.configure({ ...DEFAULT_POST, enabled: true, toneMapping: "none" });
    effects.draw(1 / 60);
    const gl = renderer.getContext();
    const pixel = new Uint8Array(4);
    gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    assert(Math.abs(pixel[0] - 128) <= 2, "Single colour conversion failed: " + pixel[0]);
    const steady = effects.snapshot.targetBytes;
    for (let i = 0; i < 100; i++) {
      effects.configure({
        ...DEFAULT_POST,
        enabled: true,
        bloom: true,
        fxaa: true,
        contrast: 1.1,
        vignette: 0.2,
      });
      effects.resize(i % 2 ? 64 : 80, 64);
      effects.draw(1 / 60);
      effects.configure({ ...DEFAULT_POST, enabled: true });
      effects.resize(64, 64);
      effects.draw(1 / 60);
      assert(effects.snapshot.passes === 3, "Disabled passes retained");
      assert(effects.snapshot.targetBytes === steady, "Target accounting drift");
    }
    effects.dispose();
    assert(assetMemory.snapshot.used === baseline, "Post reservation leak");
    assert(
      renderer.info.memory.textures === 0,
      "Post texture leak: " + renderer.info.memory.textures,
    );
    const supported = renderer.extensions.has.bind(renderer.extensions);
    renderer.extensions.has = (name: string) =>
      name === "EXT_color_buffer_float" ? false : supported(name);
    const ldr = new Effects(renderer, scene, camera);
    renderer.extensions.has = supported;
    ldr.resize(64, 64);
    ldr.configure({
      ...DEFAULT_POST,
      enabled: true,
      bloom: true,
      threshold: 0.1,
      strength: 0.3,
      fxaa: true,
    });
    ldr.draw(1 / 60);
    assert(!ldr.snapshot.hdr, "LDR fallback was not selected");
    assert(gl.getError() === gl.NO_ERROR, "LDR target/pass error");
    ldr.dispose();
    assert(renderer.info.memory.textures === 0, "LDR fallback target leak");
    assert(assetMemory.snapshot.used === baseline, "LDR reservation leak");
    renderer.dispose();
    const next = document.createElement("canvas");
    next.style.width = "160px";
    next.style.height = "100px";
    document.body.append(next);
    const engine = await Engine.create(next);
    const documentScene = createGame("Plan03 reference");
    documentScene.entities = [];
    documentScene.graphics = emptyGraphics();
    documentScene.graphics.materials.push({ ...DEFAULT_SURFACE, id: "shared", name: "Shared" });
    const a = entity("A"),
      b = entity("B");
    a.mesh.material = "shared";
    b.mesh.material = "shared";
    documentScene.entities.push(a, b);
    const lamp = entity("Spot");
    delete lamp.mesh;
    lamp.light = {
      type: "spot",
      color: "#ffffff",
      intensity: 10,
      range: 20,
      castShadow: true,
      shadowSize: 2048,
      angle: 40,
      penumbra: 0.4,
    };
    documentScene.entities.push(lamp);
    try {
      await engine.load(documentScene);
      const meshA = engine.objects.get(a.id).children.find((o: { isMesh?: boolean }) => o.isMesh),
        meshB = engine.objects.get(b.id).children.find((o: { isMesh?: boolean }) => o.isMesh);
      const untouched = meshB.material.color.getHexString();
      engine.graphics.setMaterial(a.id, { color: "#ff0000", roughness: 0.3 });
      const owned = meshA.material;
      engine.graphics.setMaterial(a.id, { roughness: 0.6 });
      assert(meshA.material === owned, "Scalar edit rebuilt instance material");
      assert(meshB.material.color.getHexString() === untouched, "Shared material mutated");
      assert(
        engine.document.graphics.materials[0].color === DEFAULT_SURFACE.color,
        "Authored material mutated",
      );
      engine.graphics.setPreview({ preset: "low", shadows: true });
      assert(engine.graphics.snapshot.shadowViews === 1, "Low profile shadow cap");
      assert(
        engine.graphics.snapshot.reasons.some((s: string) => s.includes("Spot")),
        "Missing downgrade reason",
      );
      engine.graphics.setPreview({ preset: "high", shadows: true });
      assert(engine.graphics.snapshot.shadowViews === 2, "High profile spot shadow");
      assert(
        engine.document.entities.find((e: { id: string }) => e.id === lamp.id).light.shadowSize ===
          2048,
        "Profile rewrote authored shadow size",
      );
      engine.graphics.setLight(lamp.id, { intensity: 33 });
      assert(
        engine.document.entities.find((e: { id: string }) => e.id === lamp.id).light.intensity ===
          10,
        "Runtime light mutated authoring",
      );
      engine.graphics.setPost({ enabled: true, bloom: true, fxaa: true });
      await new Promise((r) => setTimeout(r, 100));
      assert(engine.graphics.snapshot.postTargetBytes > 0, "No actual post allocation");
      const lose = engine.renderer.getContext().getExtension("WEBGL_lose_context");
      assert(!!lose, "No context-loss test extension");
      lose.loseContext();
      await new Promise((r) => setTimeout(r, 100));
      assert(engine.graphics.snapshot.contextLost, "Context loss not surfaced");
      lose.restoreContext();
      await new Promise((r) => setTimeout(r, 200));
      assert(!engine.graphics.snapshot.contextLost, "Context restore not surfaced");
      await engine.stop();
      assert(
        engine.graphics.snapshot.requested.enabled === false,
        "Runtime post leaked across Stop",
      );
      return {
        pixel: [...pixel],
        cycles: 100,
        postReservationReleased: true,
        ldrFallback: true,
        instanceIsolation: true,
        shadowBudget: true,
        contextRestored: true,
      };
    } finally {
      engine.dispose();
    }
  });
  expect(errors.filter((e) => !e.includes("CONTEXT_LOST"))).toEqual([]);
  console.log("PASS Plan03 graphics:", JSON.stringify(result));
} finally {
  await browser.close();
}
