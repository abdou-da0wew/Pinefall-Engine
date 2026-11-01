import { mkdtemp, rm, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { DiskWorkspace } from "../packages/project/src/disk-workspace";
import { unpackFolder } from "../packages/project/src/folder-archive";
import { enterEditor } from "./editor-navigation";
import { _electron, expect } from "@playwright/test";
import { packProject } from "../packages/project/src/pif";
import { parseScene } from "../packages/runtime/src/schema";
const root = await mkdtemp(resolve("build/pif-native-folder-")),
  restored = await mkdtemp(resolve("build/pif-native-restored-"));
const profile = await mkdtemp(resolve("build/pif-native-profile-"));
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
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await enterEditor(page);
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  const scene = parseScene(await Bun.file("examples/projects/ui-lab.scene.json").json()),
    bytes = await packProject(scene);
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] });
  }, root);
  await page.locator('input[accept=".pif,.json"]').setInputFiles({
    name: "UI Lab.pif",
    mimeType: "application/x-xz",
    buffer: Buffer.from(bytes),
  });
  await expect(page.locator('[data-ui-id="health-text"]')).toContainText("75");
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ filePath: path, canceled: false });
  }, process.cwd() + "/build/native-project.pif");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Raw folder PIF backup saved", {
    timeout: 30000,
  });
  const disk = await DiskWorkspace.open(restored);
  try {
    await unpackFolder(resolve("build/native-project.pif"), disk);
    const restoredScene = JSON.parse(await readFile(join(restored, "scene.json"), "utf8"));
    expect(restoredScene.ui).toEqual(scene.ui);
    expect(restoredScene.entities).toEqual(scene.entities);
  } finally {
    await disk.close();
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS Linux Electron production renderer: portable PIF worker import, disk folder and verified raw PIF8 save roundtrip",
  );
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
  await rm(restored, { recursive: true, force: true });
}
