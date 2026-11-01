import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (message) => {
    if (message.type() === "error" || message.text().includes("INVALID_OPERATION"))
      errors.push(message.text());
  });
  await page.goto("http://localhost:5173/tests/runtime.html", { waitUntil: "networkidle" });
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(path),
      { Engine } = await load("/packages/runtime/src/engine.ts"),
      { createGame } = await load("/packages/project/src/index.ts"),
      { DEFAULT_SURFACE, DEFAULT_POST, DEFAULT_SCATTERING, emptyGraphics } = await load(
        "/packages/runtime/src/graphics-definition.ts",
      ),
      { textureBinding } = await load("/packages/runtime/src/image-definition.ts"),
      { encodeChannelPNG } = await load("/packages/assets/src/png-channels.ts"),
      { toDataURI } = await load("/packages/assets/src/glb.ts"),
      { assetMemory } = await load("/packages/assets/src/budget.ts");
    const png = await encodeChannelPNG(1, 1, new Uint8Array([180, 120, 40, 255]));
    const scene = createGame("Failure gates");
    scene.graphics = emptyGraphics();
    scene.graphics.post = {
      ...DEFAULT_POST,
      enabled: true,
      scattering: { ...DEFAULT_SCATTERING, steps: 8, temporal: true },
    };
    scene.graphics.images = [
      {
        id: "map",
        name: "Map",
        format: "png",
        width: 1,
        height: 1,
        data: toDataURI(png, "image/png"),
      },
    ];
    scene.entities[0].mesh.surface = { ...DEFAULT_SURFACE, maps: { color: textureBinding("map") } };
    const engine = await Engine.create(document.querySelector("canvas"));
    let allocationRejected = false,
      retained = false,
      released = false,
      cancelled = false,
      restored = 0;
    try {
      await engine.load(scene);
      const root = engine.objects.get(scene.entities[0].id),
        baseline = assetMemory.snapshot.used,
        upload = engine.renderer.initTexture.bind(engine.renderer);
      engine.renderer.initTexture = () => {
        throw Error("Injected texture allocation failure");
      };
      try {
        await engine.load(scene);
      } catch (error) {
        allocationRejected = String(error).includes("allocation failure");
      } finally {
        engine.renderer.initTexture = upload;
      }
      retained = engine.objects.get(scene.entities[0].id) === root;
      released = assetMemory.snapshot.used === baseline;
      const controller = new AbortController(),
        pending = engine.load(scene, { signal: controller.signal });
      controller.abort(Error("Injected cancellation"));
      try {
        await pending;
      } catch (error) {
        cancelled = String(error).includes("cancellation");
      }
      if (engine.objects.get(scene.entities[0].id) !== root)
        throw Error("Cancelled image load replaced runtime");
      const once = (name: string) =>
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(Error("Context event timed out: " + name)),
            10000,
          );
          engine.canvas.addEventListener(
            name,
            () => {
              clearTimeout(timeout);
              resolve();
            },
            { once: true },
          );
        });
      for (let cycle = 0; cycle < 2; cycle++) {
        const lost = once("webglcontextlost");
        engine.renderer.forceContextLoss();
        await lost;
        if (!engine.graphics.snapshot.contextLost) throw Error("Lost context was not reported");
        const back = once("webglcontextrestored");
        await new Promise((resolve) => setTimeout(resolve, 100));
        engine.renderer.forceContextRestore();
        await back;
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (engine.graphics.snapshot.contextLost || engine.renderer.getContext().getError() !== 0)
          throw Error("Texture context recovery failed");
        restored++;
      }
      for (let i = 0; i < 20; i++) await engine.load(scene);
      if (assetMemory.snapshot.used !== baseline)
        throw Error("Repeated image replacement leaked accounted memory");
    } finally {
      engine.dispose();
    }
    return { allocationRejected, retained, released, cancelled, restored, cycles: 20 };
  });
  expect(result).toEqual({
    allocationRejected: true,
    retained: true,
    released: true,
    cancelled: true,
    restored: 2,
    cycles: 20,
  });
  expect(errors).toEqual([]);
  console.log(
    "PASS graphics allocation/cancellation/replacement/context gates: " + JSON.stringify(result),
  );
} finally {
  await browser.close();
}
