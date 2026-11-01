import { enterEditor } from "./editor-navigation";
import { _electron, expect } from "@playwright/test";
import { packProject, unpackProject } from "../packages/project/src/pif";
import { parseScene } from "../packages/runtime/src/schema";
const app = await _electron.launch({
  executablePath: process.env.TEST_DESKTOP_EXECUTABLE,
  args: [
    ...(process.env.TEST_DESKTOP_EXECUTABLE ? [] : ["."]),
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
  await expect(page.locator(".statusbar")).toContainText("PIF project saved");
  expect(await unpackProject(await Bun.file("build/native-project.pif").bytes())).toMatchObject({
    ...scene,
  });
  expect(errors).toEqual([]);
  console.log("PASS Linux Electron production renderer: PIF worker and binary IPC save roundtrip");
} finally {
  await app.close();
}
