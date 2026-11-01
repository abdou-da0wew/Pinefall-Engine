import { _electron, expect } from "@playwright/test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { encodeChannelPNG } from "../packages/assets/src/png-channels";
import { enterEditor } from "./editor-navigation";
const legacyRoot = await mkdtemp(resolve("build/graphics-pif9-"));
const profile = await mkdtemp(resolve("build/graphics-profile-")),
  root = await mkdtemp(resolve("build/graphics-folder-"));
const png = resolve("build/authored-map.png"),
  hdrPath = resolve("build/authored-environment.hdr"),
  archive = resolve("build/authored-graphics.pif");
await writeFile(
  png,
  await encodeChannelPNG(
    2,
    2,
    new Uint8Array([128, 128, 255, 255, 255, 30, 30, 255, 30, 255, 30, 255, 30, 30, 255, 255]),
  ),
);
const header = new TextEncoder().encode("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 4 +X 8\n"),
  hdr = new Uint8Array(header.length + 128);
hdr.set(header);
for (let i = header.length; i < hdr.length; i += 4) hdr.set([128, 100, 80, 130], i);
await writeFile(hdrPath, hdr);
const app = await _electron.launch({
  executablePath: process.env.TEST_DESKTOP_EXECUTABLE,
  args: [
    ...(process.env.TEST_DESKTOP_EXECUTABLE ? [] : ["."]),
    `--user-data-dir=${profile}`,
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
  cwd: process.cwd(),
});
try {
  const page = await app.firstWindow(),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await enterEditor(page);
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] });
  }, root);
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Project files & external tools…", exact: true })
    .click();
  await page.getByRole("button", { name: "Choose project folder…", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Project files & external tools", exact: true }),
  ).toContainText(root);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("treeitem").filter({ hasText: "Valley floor" }).first().click();
  await page.getByRole("button", { name: "Edit material surface…", exact: true }).click();
  await page.getByRole("button", { name: "Manage graphics images…", exact: true }).click();
  const resources = page.getByRole("dialog", { name: "Graphics image resources", exact: true });
  await page.getByLabel("Import graphics image", { exact: true }).setInputFiles(png);
  await expect(resources).toContainText("Image stored in the project", { timeout: 30000 });
  await page.getByLabel("Import graphics image", { exact: true }).setInputFiles(hdrPath);
  await expect(resources).toContainText("authored-environment.hdr", { timeout: 30000 });
  await expect(page.getByLabel("Import graphics image", { exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.screenshot({ path: "build/native-graphics-image-resources.png" });
  await resources.getByRole("button", { name: "Close", exact: true }).click();
  const surface = page.getByRole("dialog", { name: "Material surface", exact: true });
  await page.getByLabel("Material target", { exact: true }).selectOption("0:0");
  await page.getByText("Inspect UV triangle layout", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "UV layout inspection", exact: true }),
  ).toContainText("triangles shown");
  await page
    .getByRole("region", { name: "UV layout inspection", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "build/native-uv-inspection.png" });
  await page.getByLabel("Inspect UV set", { exact: true }).selectOption("1");
  await expect(
    page.getByRole("region", { name: "UV layout inspection", exact: true }),
  ).toContainText("does not exist");
  await page.getByLabel("Inspect UV set", { exact: true }).selectOption("0");
  await page.getByText("Inspect UV triangle layout", { exact: true }).click();
  await page.getByText("Texture maps and UV transforms", { exact: true }).click();
  await page
    .getByLabel("Texture color", { exact: true })
    .selectOption({ label: "authored-map.png" });
  await page.getByLabel("color UV set", { exact: true }).selectOption("1");
  await surface.getByRole("button", { name: "Apply instance override", exact: true }).click();
  await expect(surface.getByRole("alert")).toContainText("UV channel", { timeout: 30000 });
  await page.getByLabel("color UV set", { exact: true }).selectOption("0");
  await page.getByLabel("color repeat 0", { exact: true }).fill("2");
  await page.screenshot({ path: "build/native-texture-slot-authoring.png" });
  await surface.getByRole("button", { name: "Apply instance override", exact: true }).click();
  await expect(surface).not.toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Rendering", exact: true }).click();
  await page.getByLabel("PMREM environment", { exact: true }).check();
  await expect(page.getByLabel("HDR environment image", { exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page
    .getByLabel("HDR environment image", { exact: true })
    .selectOption({ label: "authored-environment.hdr" });
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByLabel("Preview enabled", { exact: true }).check();
  await page.getByText("Depth-aware scattering", { exact: true }).click();
  await page.getByLabel("Preview depth scattering", { exact: true }).check();
  await page.getByLabel("Scattering resolution", { exact: true }).selectOption("full");
  await page.getByLabel("Scattering lighting", { exact: true }).selectOption("directional-shadow");
  await page.getByLabel("Scattering transparentDepth", { exact: true }).selectOption("nearest");
  await page.getByLabel("Scattering temporal", { exact: true }).check();
  await page.getByRole("button", { name: "Apply preview post to project", exact: true }).click();
  await expect
    .poll(
      async () =>
        JSON.parse(await readFile(join(root, "scene.json"), "utf8")).graphics?.post?.scattering
          ?.temporal,
      { timeout: 30000 },
    )
    .toBe(true);
  const disk = JSON.parse(await readFile(join(root, "scene.json"), "utf8"));
  expect(disk.graphics.images.length).toBe(2);
  expect(
    disk.entities.find((e: { name: string }) => e.name === "Valley floor").mesh.slots[0].surface
      .maps.color.repeat,
  ).toEqual([2, 1]);
  for (const image of disk.graphics.images)
    expect((await readFile(join(root, image.file))).length).toBeGreaterThan(0);
  await app.evaluate(({ dialog }, archive) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: archive });
  }, archive);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect
    .poll(async () => (await readFile(archive).catch(() => Buffer.alloc(0))).length, {
      timeout: 30000,
    })
    .toBeGreaterThan(0);
  await page.screenshot({ path: "build/native-hdr-scattering-controls.png" });
  await app.evaluate(
    ({ dialog }, paths) => {
      let index = 0;
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths[index++]] });
    },
    [resolve("examples/projects/materials-post-reference.pif"), legacyRoot],
  );
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open project…", exact: true }).click();
  const opened = page.getByRole("dialog", { name: "Project files & external tools", exact: true });
  await expect(opened).toContainText(legacyRoot, { timeout: 30000 });
  await page.getByRole("button", { name: "Apply validated changes", exact: true }).click();
  await expect(opened).toContainText("Validated files applied", { timeout: 30000 });
  const legacyDisk = JSON.parse(await readFile(join(legacyRoot, "scene.json"), "utf8"));
  expect(legacyDisk.graphics.images.length).toBe(3);
  expect(legacyDisk.graphics.environment.image).toBe("environment");
  expect(errors).toEqual([]);
  console.log(
    "PASS native graphics authoring: disk-backed PNG/HDR resources, per-slot map/UV authoring, invalid UV transaction retention, HDR environment, advanced scattering controls, raw PIF backup and native PIF9-to-folder opening",
  );
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
  await rm(legacyRoot, { recursive: true, force: true });
  for (const path of [png, hdrPath, archive]) await rm(path, { force: true });
}
