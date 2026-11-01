import { _electron, expect } from "@playwright/test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createGame } from "../packages/project/src";
import { packProject } from "../packages/project/src/pif";
import { DiskWorkspace } from "../packages/project/src/disk-workspace";
import { packFolder } from "../packages/project/src/folder-archive";
import { DEFAULT_SHADER } from "../packages/runtime/src/shader-definition";
const profile = await mkdtemp(resolve("build/unified-profile-")),
  root = await mkdtemp(resolve("build/unified-source-")),
  second = await mkdtemp(resolve("build/unified-second-"));
const legacy = resolve("build/unified-legacy.pif"),
  raw = resolve("build/unified-raw.pif");
await writeFile(legacy, await packProject(createGame("Unified native workflow")));
const app = await _electron.launch({
  args: [
    ".",
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
  const choose = async (paths: string[]) =>
    app.evaluate(({ dialog }, paths) => {
      let index = 0;
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths[index++]] });
    }, paths);
  await choose([legacy, root]);
  await page.getByRole("button", { name: "Open project", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled({
    timeout: 30000,
  });
  expect(JSON.parse(await readFile(join(root, "project.json"), "utf8")).format).toBe(
    "pinefall-folder",
  );
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Project files & external tools…", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Project files & external tools", exact: true });
  await expect(dialog).toContainText(root);
  await writeFile(
    join(root, "Module.ts"),
    "Object.assign(globalThis,{__registeredSourceRan:true}); export const amount=3;",
  );
  await page.getByText("Register existing authored source", { exact: true }).click();
  const select = page.getByLabel("Project source file", { exact: true });
  await expect(select.locator("option", { hasText: "Module.ts" })).toHaveCount(1, {
    timeout: 30000,
  });
  await select.selectOption("Module.ts");
  await page.getByLabel("Registered source name", { exact: true }).fill("Module.ts");
  await page.getByRole("button", { name: "Register selected source", exact: true }).click();
  await expect(dialog).toContainText("Source registered on disk", { timeout: 30000 });
  await page.getByRole("button", { name: "Apply validated changes", exact: true }).click();
  await expect(dialog).toContainText("Validated files applied", { timeout: 30000 });
  expect(
    await page.evaluate(
      () => (globalThis as unknown as Record<string, unknown>).__registeredSourceRan,
    ),
  ).toBeUndefined();
  await writeFile(join(root, "Disk.glsl"), DEFAULT_SHADER.fragment);
  await expect(select.locator("option", { hasText: "Disk.glsl" })).toHaveCount(1, {
    timeout: 30000,
  });
  await select.selectOption("Disk.glsl");
  await page.getByLabel("Registered source name", { exact: true }).fill("Disk shader");
  await page.getByRole("button", { name: "Register selected source", exact: true }).click();
  await expect(dialog).toContainText("Source registered on disk", { timeout: 30000 });
  await page.getByRole("button", { name: "Apply validated changes", exact: true }).click();
  await expect(dialog).toContainText("Validated files applied", { timeout: 30000 });
  await page.screenshot({ path: "build/native-source-registration.png" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Rendering", exact: true }).click();
  await page
    .getByRole("button", { name: "Trust and reload authored shaders", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("treeitem").filter({ hasText: "Ground" }).first().click();
  await page
    .getByLabel("Registered shader", { exact: true })
    .selectOption({ label: "Disk shader" });
  await expect(page.getByLabel("Registered shader", { exact: true })).not.toHaveValue("", {
    timeout: 30000,
  });
  await expect
    .poll(
      async () =>
        JSON.parse(await readFile(join(root, "scene.json"), "utf8")).entities.find(
          (e: { name: string }) => e.name === "Ground",
        ).mesh.shader,
    )
    .toBeTruthy();
  const disk = await DiskWorkspace.open(root);
  try {
    await packFolder(disk, raw);
  } finally {
    await disk.close();
  }
  await choose([raw, second]);
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open project…", exact: true }).click();
  await expect(dialog).toContainText(second, { timeout: 30000 });
  await page.getByRole("button", { name: "Apply validated changes", exact: true }).click();
  await expect(dialog).toContainText("Validated files applied", { timeout: 30000 });
  expect(await readFile(join(second, "Module.ts"), "utf8")).toContain("__registeredSourceRan");
  expect(
    await page.evaluate(
      () => (globalThis as unknown as Record<string, unknown>).__registeredSourceRan,
    ),
  ).toBeUndefined();
  await page.screenshot({ path: "build/native-unified-open.png" });
  expect(errors).toEqual([]);
  console.log(
    "PASS native unified opening: Home legacy PIF, editor raw PIF8, preserved files, TS/GLSL registration, explicit Apply without execution, registered shader selection and staged compilation",
  );
} finally {
  await app.close();
  for (const path of [profile, root, second]) await rm(path, { recursive: true, force: true });
  for (const path of [legacy, raw]) await rm(path, { force: true });
}
