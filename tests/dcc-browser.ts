import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto((process.env.TEST_BASE_URL || "http://localhost:5173") + "/tests/runtime.html");
  const result = await page.evaluate(async () => {
    const imports = "/packages/assets/src/import.ts",
      runtime = "/packages/runtime/src/index.ts",
      project = "/packages/project/src/index.ts",
      pif = "/packages/project/src/pif-client.ts";
    const { prepareImport, adoptImport, reimportInputs } = await import(imports),
      { Engine } = await import(runtime),
      { createGame, placeModel } = await import(project),
      { projectJob } = await import(pif);
    const name = "blender_293_barbarian_7400_binary.fbx",
      response = await fetch("/.cache/dcc/" + name);
    if (!response.ok) throw Error("Run external DCC fixture fetch first");
    const file = new File([await response.arrayBuffer()], name),
      signal = new AbortController().signal;
    const prepared = await prepareImport([file], signal),
      adopted = adoptImport(createGame("DCC runtime"), prepared);
    const scene = placeModel(adopted.scene, adopted.asset.id).scene;
    const placed = scene.entities.find(
      (e: { mesh?: { asset?: string } }) => e.mesh?.asset === adopted.asset.id,
    );
    placed.transform.position = [2, 3, 4];
    const engine = await Engine.create(document.querySelector("canvas"));
    try {
      await engine.load(scene);
      engine.play();
      await engine.stop();
      const original = new Map(
        adopted.asset.import.subassets
          .filter((s: { key: string }) => !s.key.startsWith("ambiguous:"))
          .map((s: { kind: string; key: string; id: string }) => [s.kind + ":" + s.key, s.id]),
      );
      const changed = await prepareImport(
        await reimportInputs(adopted.asset, []),
        signal,
        undefined,
        {
          importer: "pinefall-three-185",
          version: 2,
          settings: { unitScale: 0.01, outputUp: "Y" },
        },
      );
      const next = adoptImport(scene, changed, {
        id: adopted.asset.id,
        data: adopted.asset.data,
        revision: adopted.asset.import.revision,
      });
      if (
        next.scene.entities
          .find((e: { id: string }) => e.id === placed.id)
          .transform.position.join(",") !== "2,3,4"
      )
        throw Error("Instance override lost");
      for (const sub of next.asset.import.subassets) {
        const id = original.get(sub.kind + ":" + sub.key);
        if (id && id !== sub.id) throw Error("Stable subasset identity lost");
      }
      await engine.load(next.scene);
      const archive = await projectJob("pack", next.scene),
        restored = await projectJob("unpack", archive);
      await engine.load(restored);
      if (restored.assets[0].import.recipe.settings.unitScale !== 0.01)
        throw Error("Recipe lost in PIF");
      return {
        nodes: prepared.metadata.report.nodes,
        clips: prepared.metadata.report.clips,
        stableIdentities: original.size,
        leases: engine.assetCache.metrics.leases,
      };
    } finally {
      engine.dispose();
    }
  });
  expect(result.stableIdentities).toBeGreaterThan(1);
  expect(result.leases).toBe(1);
  expect(errors).toEqual([]);
  console.log(
    "PASS external Blender morph character: renderer, Play/Stop, stored-source recipe reimport, identities, transform override, PIF v4 reload",
    result,
  );
} finally {
  await browser.close();
}
