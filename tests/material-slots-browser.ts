import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5173/tests/runtime.html");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(path),
      T = await load("/tests/graphics-test-api.ts");
    const { Engine } = await load("/packages/runtime/src/engine.ts"),
      { entity } = await load("/packages/runtime/src/schema.ts"),
      { createGame } = await load("/packages/project/src/index.ts");
    const { DEFAULT_SURFACE, emptyGraphics } = await load(
        "/packages/runtime/src/graphics-definition.ts",
      ),
      { textureBinding } = await load("/packages/runtime/src/image-definition.ts");
    const { encodeChannelPNG } = await load("/packages/assets/src/png-channels.ts"),
      { toDataURI } = await load("/packages/assets/src/glb.ts");
    const { GLTFExporter } = await load(
      "/node_modules/three/examples/jsm/exporters/GLTFExporter.js",
    );
    const engine = await Engine.create(document.querySelector("canvas"));
    const png = await encodeChannelPNG(1, 1, new Uint8Array([128, 128, 255, 255]));
    let rejectedUV = false,
      retained = false,
      slotChanged = false,
      otherRetained = false,
      reimportRejected = false;
    try {
      const scene = createGame("Map transactions");
      scene.entities = [entity("Box")];
      scene.graphics = emptyGraphics();
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
      scene.entities[0].mesh.surface = {
        ...DEFAULT_SURFACE,
        maps: { color: textureBinding("map") },
      };
      await engine.load(scene);
      const good = engine.objects.get(scene.entities[0].id);
      const invalid = structuredClone(scene);
      invalid.entities[0].mesh.surface.maps.color.uv = 1;
      try {
        await engine.load(invalid);
      } catch (error) {
        rejectedUV = String(error).includes("UV channel");
      }
      retained = engine.objects.get(scene.entities[0].id) === good;
      const root = new T.Group(),
        geometry = new T.BoxGeometry(1, 1, 1),
        a = new T.MeshStandardMaterial({ color: "#ff0000" }),
        b = new T.MeshStandardMaterial({ color: "#00ff00" });
      const left = new T.Mesh(geometry, a),
        right = new T.Mesh(geometry, b);
      left.name = "Left";
      right.name = "Right";
      right.position.x = 2;
      root.add(left, right);
      const bytes = new Uint8Array(await new GLTFExporter().parseAsync(root, { binary: true }));
      const model = structuredClone(scene);
      model.assets = [{ id: "model", name: "Two slots", data: toDataURI(bytes) }];
      model.entities[0].mesh = { primitive: "asset", asset: "model", color: "#ffffff" };
      await engine.load(model);
      const slots = engine.inspectMaterialSlots(model.entities[0].id);
      if (slots.length < 2) throw Error("Fixture needs two material slots");
      const source = engine.document.assets[0].data;
      model.entities[0].mesh.slots = [
        {
          key: slots[0].key,
          source,
          surface: {
            ...DEFAULT_SURFACE,
            color: "#0000ff",
            maps: { normal: textureBinding("map") },
            normalScale: [1, -1],
          },
        },
      ];
      await engine.load(model);
      const materials: Array<{ color: string; normal: boolean }> = [];
      engine.objects
        .get(model.entities[0].id)
        .traverse(
          (object: {
            isMesh?: boolean;
            material?: { color: { getHexString: () => string }; normalMap?: unknown };
          }) => {
            if (object.isMesh && object.material)
              materials.push({
                color: object.material.color.getHexString(),
                normal: !!object.material.normalMap,
              });
          },
        );
      slotChanged = materials.some((material) => material.color === "0000ff" && material.normal);
      otherRetained = materials.some((material) => material.color === "00ff00");
      a.color.set("#ffffff");
      const replacement = new Uint8Array(
        await new GLTFExporter().parseAsync(root, { binary: true }),
      );
      model.assets[0].data = toDataURI(replacement);
      const before = engine.objects.get(model.entities[0].id);
      try {
        await engine.load(model);
      } catch (error) {
        reimportRejected = String(error).includes("remapping");
      }
      if (engine.objects.get(model.entities[0].id) !== before)
        throw Error("Failed reimport replaced world");
      geometry.dispose();
      a.dispose();
      b.dispose();
    } finally {
      engine.dispose();
    }
    return { rejectedUV, retained, slotChanged, otherRetained, reimportRejected };
  });
  expect(result).toEqual({
    rejectedUV: true,
    retained: true,
    slotChanged: true,
    otherRetained: true,
    reimportRejected: true,
  });
  console.log("PASS staged material maps/slots: " + JSON.stringify(result));
} finally {
  await browser.close();
}
