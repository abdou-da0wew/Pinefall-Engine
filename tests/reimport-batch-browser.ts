import { chromium, expect } from "@playwright/test";
import { triangle } from "./asset-fixtures";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto((process.env.TEST_BASE_URL || "http://localhost:5173") + "/tests/runtime.html");
  const result = await page.evaluate(
    async (buffers) => {
      const paths = [
        "/packages/assets/src/reimport.ts",
        "/packages/assets/src/record.ts",
        "/packages/assets/src/import.ts",
        "/packages/project/src/index.ts",
      ];
      const [{ prepareReimports }, { prepareGlbRecord }, { adoptImport }, { createGame }] =
        await Promise.all(paths.map((path) => import(path)));
      let scene = createGame("Batch");
      for (let i = 0; i < 2; i++)
        scene = adoptImport(
          scene,
          await prepareGlbRecord("same.glb", new Uint8Array(buffers[i])),
        ).scene;
      const original = JSON.stringify(scene),
        ids = scene.assets.map((a: { id: string }) => a.id),
        signal = new AbortController().signal;
      const file = (i: number) => new File([new Uint8Array(buffers[i])], "same.glb");
      const unchanged = await prepareReimports(
        scene,
        [{ assetId: ids[0], files: [file(0)] }],
        signal,
      );
      const requests = ids.map((assetId: string, i: number) => ({ assetId, files: [file(i + 2)] }));
      let failed = false;
      try {
        await prepareReimports(
          scene,
          [requests[0], { assetId: ids[1], files: [new File(["broken"], "same.glb")] }],
          signal,
        );
      } catch {
        failed = true;
      }
      const cooked = await prepareReimports(scene, requests, signal);
      const recipe = structuredClone(scene.assets[0].import.recipe);
      recipe.version = 2;
      recipe.settings = { unitScale: 2, outputUp: "Y" };
      const normalized = await prepareReimports(
        scene,
        [{ assetId: ids[0], files: [], recipe }],
        signal,
      );
      const controller = new AbortController();
      controller.abort();
      let cancelled = false;
      try {
        await prepareReimports(scene, requests, controller.signal);
      } catch {
        cancelled = true;
      }
      return {
        assets: ids.length,
        unchanged: unchanged.rebuilt,
        rebuilt: cooked.rebuilt,
        failed,
        cancelled,
        unchangedScene: JSON.stringify(scene) === original,
        changed: ids.every(
          (id: string, i: number) =>
            cooked.prepared.get(id).metadata.artifactHash !== scene.assets[i].import.artifactHash,
        ),
        normalized: normalized.prepared.get(ids[0]).metadata.recipe.settings.unitScale,
        recipeRebuilt: normalized.rebuilt.includes("model:" + ids[0]),
      };
    },
    [0, 0.1, 0.2, 0.3].map((n) => Array.from(triangle(n))),
  );
  expect(result.assets).toBe(2);
  expect(result.unchanged).toEqual([]);
  expect(result.rebuilt.length).toBe(2);
  expect(
    result.failed &&
      result.cancelled &&
      result.unchangedScene &&
      result.changed &&
      result.recipeRebuilt,
  ).toBe(true);
  expect(result.normalized).toBe(2);
  expect(errors).toEqual([]);
  console.log(
    "PASS real DAG batch cooking: scoped sources, unchanged skip, failed-batch isolation, retry, recipe invalidation and cancellation",
  );
} finally {
  await browser.close();
}
