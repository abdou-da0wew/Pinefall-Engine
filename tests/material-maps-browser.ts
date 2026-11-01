import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("http://localhost:5173/tests/runtime.html", { waitUntil: "networkidle" });
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(path),
      T = await load("/tests/graphics-test-api.ts"),
      { GraphicsImages } = await load("/packages/runtime/src/graphics-images.ts"),
      { surfaceMaterial } = await load("/packages/runtime/src/graphics-material.ts"),
      { DEFAULT_SURFACE } = await load("/packages/runtime/src/graphics-definition.ts"),
      { textureBinding } = await load("/packages/runtime/src/image-definition.ts"),
      { encodeChannelPNG } = await load("/packages/assets/src/png-channels.ts"),
      { toDataURI } = await load("/packages/assets/src/glb.ts");
    const catalog = await Promise.all(
      [
        [255, 0, 0, 255],
        [0, 255, 255, 255],
        [128, 230, 204, 255],
      ].map(async (pixel, index) => ({
        id: "image-" + index,
        name: "Fixture",
        format: "png",
        width: 1,
        height: 1,
        data: toDataURI(await encodeChannelPNG(1, 1, new Uint8Array(pixel)), "image/png"),
      })),
    );
    const images = await GraphicsImages.prepare(
        catalog,
        new Set(catalog.map((image) => image.id)),
        new AbortController().signal,
      ),
      renderer = new T.WebGLRenderer();
    renderer.setSize(96, 96);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    const target = new T.WebGLRenderTarget(96, 96);
    target.texture.colorSpace = T.SRGBColorSpace;
    const camera = new T.PerspectiveCamera(60, 1, 0.1, 20);
    camera.position.z = 3;
    const scene = new T.Scene(),
      geometry = new T.PlaneGeometry(1, 1, 8, 8),
      mesh = new T.Mesh(geometry),
      light = new T.DirectionalLight(0xffffff, 2),
      ambient = new T.AmbientLight(0xffffff, 0.05);
    light.position.set(0, 3, 3);
    scene.add(mesh, light, light.target, ambient);
    const materials: { dispose: () => void }[] = [];
    const material = (patch: Record<string, unknown>) => {
      const next = surfaceMaterial({ ...DEFAULT_SURFACE, color: "#ffffff", ...patch }, images);
      materials.push(next);
      mesh.material = next;
      return next;
    };
    const draw = () => {
      const pixels = new Uint8Array(96 * 96 * 4);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, 96, 96, pixels);
      return pixels;
    };
    const center = (pixels: Uint8Array) => pixels[(48 * 96 + 48) * 4],
      count = (pixels: Uint8Array) => {
        let n = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 10) n++;
        return n;
      };
    material({ family: "unlit", alphaMode: "mask", maps: { alpha: textureBinding("image-0") } });
    const alphaOff = center(draw());
    material({ family: "unlit", alphaMode: "mask", maps: { alpha: textureBinding("image-1") } });
    const alphaOn = center(draw());
    material({ maps: { normal: textureBinding("image-2") }, normalScale: [1, 1] });
    const normalPositive = center(draw());
    material({ maps: { normal: textureBinding("image-2") }, normalScale: [1, -1] });
    const normalNegative = center(draw());
    material({ maps: { displacement: textureBinding("image-0") }, displacementScale: 0 });
    const flat = count(draw());
    material({ maps: { displacement: textureBinding("image-0") }, displacementScale: 0.8 });
    const displaced = count(draw());
    const sphere = new T.SphereGeometry(0.65, 48, 32);
    mesh.geometry = sphere;
    light.position.set(0, 0, 3);
    material({ metalness: 1, roughness: 1, maps: { roughness: textureBinding("image-0") } });
    const polished = center(draw());
    material({ metalness: 1, roughness: 1, maps: { roughness: textureBinding("image-1") } });
    const rough = center(draw());
    light.position.set(3, 0, 3);
    material({ metalness: 1, roughness: 0.5, maps: { metalness: textureBinding("image-0") } });
    const dielectric = center(draw());
    material({ metalness: 1, roughness: 0.5, maps: { metalness: textureBinding("image-1") } });
    const metal = center(draw());
    light.intensity = 0;
    ambient.intensity = 1;
    material({ maps: { ao: textureBinding("image-0") } });
    const aoLit = center(draw());
    material({ maps: { ao: textureBinding("image-1") } });
    const aoDark = center(draw());
    light.intensity = 2;
    ambient.intensity = 0.05;
    // Alpha and vertex displacement must also affect native directional shadow depth variants.
    mesh.geometry = geometry;
    mesh.castShadow = true;
    light.castShadow = true;
    light.position.set(2, 0, 4);
    light.shadow.mapSize.set(256, 256);
    Object.assign(light.shadow.camera, {
      left: -2,
      right: 2,
      top: 2,
      bottom: -2,
      near: 0.1,
      far: 10,
    });
    light.shadow.camera.updateProjectionMatrix();
    const receiverGeometry = new T.PlaneGeometry(4, 4),
      receiverMaterial = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
      receiver = new T.Mesh(receiverGeometry, receiverMaterial);
    receiver.position.z = -1;
    receiver.receiveShadow = true;
    scene.add(receiver);
    const shadowMeasure = () => {
      const pixels = draw();
      let n = 0,
        sum = 0;
      for (let y = 25; y < 71; y++)
        for (let x = 20; x < 76; x++) {
          const i = (y * 96 + x) * 4;
          if (pixels[i] < 80 && pixels[i + 1] < 80 && pixels[i + 2] < 80) {
            n++;
            sum += x;
          }
        }
      return { count: n, center: n ? sum / n : 0 };
    };
    material({
      color: "#ff0000",
      doubleSided: true,
      alphaMode: "mask",
      maps: { alpha: textureBinding("image-0") },
    });
    const clearShadow = shadowMeasure();
    material({
      color: "#ff0000",
      doubleSided: true,
      alphaMode: "mask",
      maps: { alpha: textureBinding("image-1") },
    });
    const alphaShadow = shadowMeasure();
    material({
      color: "#ff0000",
      doubleSided: true,
      maps: { displacement: textureBinding("image-0") },
      displacementScale: 0.8,
    });
    const movedShadow = shadowMeasure();
    scene.remove(receiver);
    receiverGeometry.dispose();
    receiverMaterial.dispose();
    light.shadow.dispose();
    for (const item of materials) item.dispose();
    images.dispose();
    geometry.dispose();
    sphere.dispose();
    target.dispose();
    renderer.dispose();
    return {
      alphaOff,
      alphaOn,
      normalPositive,
      normalNegative,
      flat,
      displaced,
      polished,
      rough,
      dielectric,
      metal,
      aoLit,
      aoDark,
      clearShadow,
      alphaShadow,
      movedShadow,
    };
  });
  console.log(JSON.stringify(result));
  expect(result.alphaOff).toBe(0);
  expect(result.alphaOn).toBeGreaterThan(240);
  expect(result.normalPositive).toBeGreaterThan(result.normalNegative + 30);
  expect(result.displaced).toBeGreaterThan(result.flat * 1.5);
  expect(result.polished).toBeGreaterThan(result.rough + 20);
  expect(result.dielectric).toBeGreaterThan(result.metal + 20);
  expect(result.aoLit).toBeGreaterThan(result.aoDark + 30);
  expect(result.alphaShadow.count).toBeGreaterThan(result.clearShadow.count + 10);
  expect(Math.abs(result.movedShadow.center - result.alphaShadow.center)).toBeGreaterThan(2);
  expect(errors).toEqual([]);
  console.log(
    "PASS canonical alpha/normal/roughness/displacement and native shadow pixel fixtures",
  );
} finally {
  await browser.close();
}
