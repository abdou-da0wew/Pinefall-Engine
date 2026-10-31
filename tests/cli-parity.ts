import { chromium, expect } from "@playwright/test";
import { convertModel } from "../scripts/convert-model";
import { defaultRecipe } from "../packages/assets/src/recipe";
import { binaryFbx } from "./asset-fixtures";
import { prepareGlbRecord } from "../packages/assets/src/record";
import { skinnedTriangle } from "./asset-fixtures";
const recipe = { ...defaultRecipe(), settings: { unitScale: 0.01, outputUp: "Y" as const } };
const path = "build/cli-parity.fbx";
await Bun.write(path, binaryFbx());
const cli = await convertModel(
  [path],
  recipe,
  process.argv.includes("--allow-unsandboxed-converter"),
);
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto((process.env.TEST_BASE_URL || "http://localhost:5173") + "/tests/runtime.html");
  const result = await page.evaluate(
    async ({ bytes, recipe, glb }) => {
      const module = "/packages/assets/src/import.ts";
      const { prepareImport } = await import(module);
      const controller = new AbortController();
      const fbx = await prepareImport(
        [new File([new Uint8Array(bytes)], "cli-parity.fbx")],
        controller.signal,
        undefined,
        recipe,
      );
      const model = await prepareImport(
        [new File([new Uint8Array(glb)], "rig.glb")],
        controller.signal,
        undefined,
        recipe,
      );
      return {
        fbx: fbx.metadata.artifactHash,
        glb: model.metadata.artifactHash,
        recipe: fbx.metadata.recipe,
      };
    },
    { bytes: Array.from(binaryFbx()), recipe, glb: Array.from(skinnedTriangle()) },
  );
  expect(result.fbx).toBe(cli.metadata.artifactHash);
  expect(result.recipe).toEqual(recipe);
  expect(result.glb).toBe(
    (await prepareGlbRecord("rig.glb", skinnedTriangle(), recipe)).metadata.artifactHash,
  );
  console.log("PASS editor/CLI cooked hash parity: FBX and normalized skinned GLB");
} finally {
  await browser.close();
}
