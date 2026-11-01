import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("http://localhost:5173/tests/runtime.html");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const T = await load("/tests/graphics-test-api.ts");
    const { GraphicsImages } = await load("/packages/runtime/src/graphics-images.ts");
    const { surfaceMaterial } = await load("/packages/runtime/src/graphics-material.ts");
    const { DEFAULT_SURFACE } = await load("/packages/runtime/src/graphics-definition.ts");
    const { textureBinding } = await load("/packages/runtime/src/image-definition.ts");
    const { encodeChannelPNG, decodeChannelPNG } = await load(
      "/packages/assets/src/png-channels.ts",
    );
    const { toDataURI } = await load("/packages/assets/src/glb.ts");
    const { packChannels } = await load("/packages/assets/src/channel-pack.ts");
    const { graphicsImageBytes } = await load("/packages/assets/src/graphics-images.ts");
    const { acquireEnvironment, invalidateEnvironments } = await load(
      "/packages/runtime/src/environment.ts",
    );
    const { assetMemory } = await load("/packages/assets/src/budget.ts");
    const png = await encodeChannelPNG(
      2,
      2,
      new Uint8Array([128, 64, 32, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]),
    );
    const image = {
      id: "colors",
      name: "Colors",
      format: "png",
      width: 2,
      height: 2,
      data: toDataURI(png, "image/png"),
    };
    const channels = [
      { image: "colors", channel: 2, invert: false, constant: 0 },
      { image: "colors", channel: 0, invert: true, constant: 0 },
      { image: "colors", channel: 1, invert: false, constant: 0 },
      { channel: 3, invert: false, constant: 0 },
    ];
    const packed = await packChannels(
      [image],
      channels,
      2,
      2,
      "reject",
      new AbortController().signal,
    );
    const packedPixels = Array.from(
      (await decodeChannelPNG(await graphicsImageBytes(packed))).pixels.slice(0, 4),
    );
    let dimensionRejected = false;
    try {
      await packChannels([image], channels, 4, 4, "reject", new AbortController().signal);
    } catch {
      dimensionRejected = true;
    }
    const hdrHeader = new TextEncoder().encode("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 4 +X 8\n");
    const hdr = new Uint8Array(hdrHeader.length + 8 * 4 * 4);
    hdr.set(hdrHeader);
    for (let i = hdrHeader.length; i < hdr.length; i += 4) hdr.set([128, 128, 128, 130], i);
    const environment = {
      id: "hdr",
      name: "HDR",
      format: "hdr",
      width: 8,
      height: 4,
      data: toDataURI(hdr, "application/octet-stream"),
    };
    const baseline = assetMemory.snapshot.used;
    const renderer = new T.WebGLRenderer();
    renderer.setSize(32, 32);
    const target = new T.WebGLRenderTarget(32, 32);
    target.texture.colorSpace = T.SRGBColorSpace;
    const scene = new T.Scene(),
      camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 2;
    const geometry = new T.PlaneGeometry(2, 2),
      mesh = new T.Mesh(geometry);
    scene.add(mesh);
    const uv1 = geometry.attributes.uv.clone();
    for (let i = 0; i < uv1.count; i++) uv1.setXY(i, 1 - uv1.getX(i), uv1.getY(i));
    geometry.setAttribute("uv1", uv1);
    const pixels = new Uint8Array(4),
      read = () => {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(target, 8, 24, 1, 1, pixels);
        return Array.from(pixels);
      };
    const images = await GraphicsImages.prepare(
      [image, environment],
      new Set(["colors", "hdr"]),
      new AbortController().signal,
      128,
    );
    const material = surfaceMaterial(
      {
        ...DEFAULT_SURFACE,
        family: "unlit",
        color: "#ffffff",
        maps: { color: textureBinding("colors") },
      },
      images,
    );
    mesh.material = material;
    const color = read();
    const second = surfaceMaterial(
      {
        ...DEFAULT_SURFACE,
        family: "unlit",
        color: "#ffffff",
        maps: { color: { ...textureBinding("colors"), uv: 1 } },
      },
      images,
    );
    mesh.material = second;
    const uvPixel = read();
    const orm = surfaceMaterial(
      {
        ...DEFAULT_SURFACE,
        maps: {
          roughness: textureBinding("colors"),
          metalness: textureBinding("colors"),
          ao: textureBinding("colors"),
          normal: textureBinding("colors"),
          displacement: textureBinding("colors"),
        },
        normalScale: [1, -1],
        displacementScale: 0.2,
      },
      images,
    );
    const semantics = {
      color: material.map.colorSpace,
      linear: orm.roughnessMap.colorSpace,
      uv: second.map.channel,
      normalY: orm.normalScale.y,
      displacement: orm.displacementScale,
      isolated: material.map !== second.map,
    };
    const definition = {
      sky: "#ffffff",
      ground: "#000000",
      intensity: 1,
      resolution: 128,
      image: "hdr",
    };
    const lease = acquireEnvironment(renderer, definition, images.source("hdr"), environment.data);
    if (!lease) throw Error("Float PMREM unavailable in fixture");
    const envMaterial = new T.MeshStandardMaterial({
      color: "#ffffff",
      metalness: 1,
      roughness: 0.3,
    });
    mesh.material = envMaterial;
    scene.environment = lease.texture;
    const hdrPixel = read();
    invalidateEnvironments(renderer);
    const replacement = acquireEnvironment(
      renderer,
      definition,
      images.source("hdr"),
      environment.data,
    );
    const regenerated = replacement.texture !== lease.texture;
    lease.release();
    replacement.release();
    scene.environment = null;
    for (const item of [material, second, orm, envMaterial]) item.dispose();
    images.dispose();
    geometry.dispose();
    target.dispose();
    renderer.dispose();
    const released = assetMemory.snapshot.used === baseline;
    return {
      packedPixels,
      dimensionRejected,
      color,
      uvPixel,
      semantics,
      hdrPixel,
      regenerated,
      released,
    };
  });
  expect(errors).toEqual([]);
  expect(result.packedPixels).toEqual([32, 127, 64, 0]);
  expect(result.dimensionRejected).toBe(true);
  expect(result.color[0]).toBeGreaterThan(80);
  expect(result.color).not.toEqual(result.uvPixel);
  expect(result.semantics).toEqual({
    color: "srgb",
    linear: "",
    uv: 1,
    normalY: -1,
    displacement: 0.2,
    isolated: true,
  });
  expect(result.hdrPixel[0]).toBeGreaterThan(20);
  expect(result.regenerated).toBe(true);
  expect(result.released).toBe(true);
  console.log("PASS graphics image GPU/worker fixtures: " + JSON.stringify(result));
} finally {
  await browser.close();
}
