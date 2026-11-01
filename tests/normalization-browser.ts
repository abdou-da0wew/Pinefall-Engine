import { enterEditor, openImportSettings } from "./editor-navigation";
import { chromium, expect } from "@playwright/test";
import { triangle } from "./asset-fixtures";
import { unpackProject } from "../packages/project/src/pif";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(process.env.TEST_BASE_URL || "http://localhost:5173");
  await enterEditor(page);
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await openImportSettings(page);
  await page.getByLabel("Import unit multiplier", { exact: true }).fill("2");
  await page.keyboard.press("Escape");
  const chooser = page.locator('input[accept=".glb,.fbx,.png,.jpg,.jpeg"]');
  const select = async (n: number) =>
    chooser.setInputFiles({
      name: "recipe.glb",
      mimeType: "model/gltf-binary",
      buffer: Buffer.from(triangle(n)),
    });
  await select(0);
  await expect(page.locator(".statusbar")).toContainText("Imported recipe.glb");
  const save = async (label: string) => {
    await expect(page.getByRole("button", { name: "Save project", exact: true })).toBeEnabled();
    const wait = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save project", exact: true }).click();
    const file = await wait;
    const path = "build/recipe-" + label + ".pif";
    await file.saveAs(path);
    return unpackProject(await Bun.file(path).bytes());
  };
  const first = await save("first");
  expect(first.assets[0].import!.recipe.settings!.unitScale).toBe(2);
  await openImportSettings(page);
  await page.getByLabel("Import unit multiplier", { exact: true }).fill("3");
  await page.keyboard.press("Escape");
  const replace = async (n: number) => {
    await page.getByRole("button", { name: "Reimport recipe.glb", exact: true }).click();
    await select(n);
    await expect(page.getByRole("dialog", { name: "Review reimport" })).toBeVisible();
    await page.getByRole("button", { name: "Apply reimport", exact: true }).click();
    await expect(page.locator(".statusbar")).toContainText("Reimported recipe.glb");
  };
  await replace(1);
  expect((await save("retained")).assets[0].import!.recipe.settings!.unitScale).toBe(2);
  await openImportSettings(page);
  await page.getByLabel("Override saved recipe on reimport").check();
  await page.keyboard.press("Escape");
  await replace(2);
  const changed = await save("changed");
  expect(changed.assets[0].import!.recipe.settings!.unitScale).toBe(3);
  expect(changed.entities).toEqual(first.entities);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await save("undo")).assets[0].import!.recipe.settings!.unitScale).toBe(2);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await save("redo")).assets[0].import!.recipe.settings!.unitScale).toBe(3);
  expect(errors).toEqual([]);
  console.log(
    "PASS normalization UI: persisted PIF recipe, preserved recipe on reimport, explicit override, unchanged instances, undo/redo",
  );
} finally {
  await browser.close();
}
