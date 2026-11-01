import { createHash } from "node:crypto";
import { _electron, expect } from "@playwright/test";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { enterEditor } from "./editor-navigation";
const profile = await mkdtemp(resolve("build/external-code-profile-"));
const root = await mkdtemp(resolve("build/external-code-project-"));
const unpacked = await mkdtemp(resolve("build/external-unpacked-project-"));
const archive = resolve("build/external-code-backup.pif");
const options = {
  ...(process.env.PINEFALL_EXECUTABLE ? { executablePath: process.env.PINEFALL_EXECUTABLE } : {}),
  args: [
    ...(process.env.PINEFALL_EXECUTABLE ? [] : ["."]),
    `--user-data-dir=${profile}`,
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
  cwd: process.cwd(),
};
let app = await _electron.launch(options);
const automaticArchive = resolve("build/external-auto-backup.pif");
try {
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await enterEditor(page);
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, root);
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Project files & external tools…", exact: true })
    .click();
  await page.getByRole("button", { name: "Choose project folder…", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Project files & external tools", exact: true }),
  ).toContainText(root);
  await expect(
    page.getByRole("button", { name: "New TypeScript file", exact: true }),
  ).toBeEnabled();
  expect(JSON.parse(await readFile(join(root, "project.json"), "utf8")).format).toBe(
    "pinefall-folder",
  );
  await page.getByRole("button", { name: "New TypeScript file", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await readdir(join(root, "scripts")).catch(() => [])).filter((p) => p.endsWith(".ts"))
          .length,
    )
    .toBe(1);
  await page.getByRole("button", { name: "Install / refresh IDE typings", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Project files & external tools", exact: true }),
  ).toContainText("Portable IDE typings installed", { timeout: 30000 });
  expect(JSON.parse(await readFile(join(root, "tsconfig.json"), "utf8")).extends).toBe(
    "./tsconfig.pinefall.json",
  );
  const filename = (await readdir(join(root, "scripts"))).find((p) => p.endsWith(".ts"))!;
  await writeFile(join(root, "scripts", filename), "export default () => ({ broken syntax");
  await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole("button", { name: "Apply validated changes", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: "build/native-external-code-diagnostics.png" });
  await writeFile(
    join(root, "scripts", filename),
    "import {Script} from '@pinefall/sdk'; export default class Bad extends Script {start(){this.ctx.graphics.setPost({bloom:'wrong'});}}",
  );
  await expect(
    page.getByRole("dialog", { name: "Project files & external tools", exact: true }),
  ).toContainText("TS2322", { timeout: 30000 });
  await expect(
    page.getByRole("button", { name: "Apply validated changes", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: "build/native-typescript-semantic-diagnostics.png" });
  const valid = "Object.assign(globalThis, {__diskCodeRan:true}); export default () => ({});";
  await writeFile(join(root, "scripts", filename), valid);
  await expect(
    page.getByRole("button", { name: "Apply validated changes", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  expect(
    await page.evaluate(() => (globalThis as unknown as Record<string, unknown>).__diskCodeRan),
  ).toBeUndefined();
  await page.getByRole("button", { name: "Apply validated changes", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Project files & external tools", exact: true }),
  ).toContainText("Validated files applied");
  expect(
    await page.evaluate(() => (globalThis as unknown as Record<string, unknown>).__diskCodeRan),
  ).toBeUndefined();
  expect(await readFile(join(root, "scripts", filename), "utf8")).toBe(valid);
  expect(await page.getByRole("textbox", { name: "TypeScript source", exact: true }).count()).toBe(
    0,
  );
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: ["/usr/bin/true"] });
  });
  await page.getByLabel("External editor", { exact: true }).selectOption("text-editor");
  await expect(page.getByLabel("External editor", { exact: true })).toHaveValue("text-editor");
  await page.getByLabel("Project source file", { exact: true }).selectOption("scripts/" + filename);
  await page.getByRole("button", { name: "Open externally", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("treeitem").filter({ hasText: "Supply crate 1" }).first().click();
  await page.getByRole("button", { name: "Custom shader…", exact: true }).click();
  await page
    .getByRole("button", { name: "Create shader files for selection", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await readdir(join(root, "shaders")).catch(() => [])).filter((p) => p.endsWith(".glsl"))
          .length,
    )
    .toBe(1);
  const shader = (await readdir(join(root, "shaders"))).find((p) => p.endsWith(".glsl"))!;
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Rendering", exact: true }).click();
  await page
    .getByRole("button", { name: "Trust and reload authored shaders", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Project files & external tools…", exact: true })
    .click();
  await page.getByLabel("Project source file", { exact: true }).selectOption("shaders/" + shader);
  const broken = "vec4 shade(vec2 uv, vec3 p) { broken shader; }";
  await writeFile(join(root, "shaders", shader), broken);
  await expect(page.getByLabel("Project source file", { exact: true })).toHaveAttribute(
    "data-validated-hash",
    createHash("sha256").update(broken).digest("hex"),
    { timeout: 30000 },
  );
  await expect(
    page.getByRole("button", { name: "Apply validated changes", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await page.getByRole("button", { name: "Apply validated changes", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Project files & external tools", exact: true }),
  ).toContainText("previous material retained", { timeout: 30000 });
  await page.screenshot({ path: "build/native-external-shader-diagnostics.png" });
  await page.getByRole("button", { name: "New TypeScript file", exact: true }).click();
  await expect
    .poll(
      async () => (await readdir(join(root, "scripts"))).filter((p) => p.endsWith(".ts")).length,
    )
    .toBe(2);
  expect(await readFile(join(root, "shaders", shader), "utf8")).toBe(broken);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, archive);
  await writeFile(join(root, "unregistered.ts"), "unfinished external draft");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect
    .poll(async () => (await readFile(archive).catch(() => Buffer.alloc(0))).length, {
      timeout: 30000,
    })
    .toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Save project", exact: true })).toBeEnabled();
  await app.evaluate(
    ({ dialog }, paths) => {
      let index = 0;
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths[index++]] });
    },
    [archive, unpacked],
  );
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Project files & external tools…", exact: true })
    .click();
  await page.getByText("Folder archives, repacking and recent folders", { exact: true }).click();
  await page.getByRole("button", { name: "Open raw folder PIF…", exact: true }).click();
  await expect
    .poll(async () => await readFile(join(unpacked, "shaders", shader), "utf8").catch(() => ""), {
      timeout: 30000,
    })
    .toBe(broken);
  expect(await readFile(join(unpacked, "unregistered.ts"), "utf8")).toBe(
    "unfinished external draft",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled({
    timeout: 30000,
  });
  expect(
    await page.evaluate(() => (globalThis as unknown as { __diskCodeRan?: boolean }).__diskCodeRan),
  ).toBeUndefined();
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Project files & external tools…", exact: true })
    .click();
  await page.getByText("Folder archives, repacking and recent folders", { exact: true }).click();
  await page.getByLabel("Repack mode", { exact: true }).selectOption("per-action");
  await page.getByLabel("Repack shortcut", { exact: true }).fill("Mod+Alt+B");
  await page.getByRole("button", { name: "Save repack settings", exact: true }).click();
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, automaticArchive);
  await page.getByRole("button", { name: "Choose PIF destination…", exact: true }).click();
  await expect
    .poll(
      async () =>
        await readFile(automaticArchive)
          .then((v) => createHash("sha256").update(v).digest("hex"))
          .catch(() => ""),
      { timeout: 30000 },
    )
    .not.toBe("");
  await expect(
    page.getByRole("button", { name: "Choose PIF destination…", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  const previousArchive = createHash("sha256")
    .update(await readFile(automaticArchive))
    .digest("hex");
  await writeFile(join(unpacked, "unregistered.ts"), "external draft changed for automatic backup");
  await expect
    .poll(
      async () =>
        createHash("sha256")
          .update(await readFile(automaticArchive))
          .digest("hex"),
      { timeout: 30000 },
    )
    .not.toBe(previousArchive);
  const beforeInterval = createHash("sha256")
    .update(await readFile(automaticArchive))
    .digest("hex");
  await page.getByLabel("Repack mode", { exact: true }).selectOption("interval");
  await page.getByLabel("Repack interval seconds", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Save repack settings", exact: true }).click();
  await writeFile(join(unpacked, "unregistered.ts"), "interval backup draft");
  await expect
    .poll(
      async () =>
        createHash("sha256")
          .update(await readFile(automaticArchive))
          .digest("hex"),
      { timeout: 40000 },
    )
    .not.toBe(beforeInterval);
  await page.screenshot({ path: "build/native-folder-repack-settings.png" });
  await page.getByLabel("Repack mode", { exact: true }).selectOption("manual");
  await page.getByRole("button", { name: "Save repack settings", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const beforeShortcut = createHash("sha256")
    .update(await readFile(automaticArchive))
    .digest("hex");
  await writeFile(join(unpacked, "unregistered.ts"), "custom shortcut backup draft");
  await page.keyboard.press("Control+Alt+B");
  await expect
    .poll(
      async () =>
        createHash("sha256")
          .update(await readFile(automaticArchive))
          .digest("hex"),
      { timeout: 30000 },
    )
    .not.toBe(beforeShortcut);
  expect(errors).toEqual([]);
  await app.close();
  app = await _electron.launch(options);
  const reopened = await app.firstWindow();
  await writeFile(
    join(unpacked, "shaders", shader),
    "vec4 shade(vec2 uv, vec3 worldPosition) { return vec4(0.3,0.7,0.5,1.0); }",
  );
  await reopened
    .getByRole("button", { name: "Open working folder " + unpacked, exact: true })
    .click();
  await expect(reopened.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled({
    timeout: 30000,
  });
  expect(
    await reopened.evaluate(() => (globalThis as unknown as Record<string, unknown>).__diskCodeRan),
  ).toBeUndefined();
  await reopened.screenshot({ path: "build/native-home-folder-open.png" });
  await reopened.getByRole("button", { name: "Project", exact: true }).click();
  await reopened
    .getByRole("menuitem", { name: "Project files & external tools…", exact: true })
    .click();
  await reopened
    .getByText("Folder archives, repacking and recent folders", { exact: true })
    .click();
  await reopened.getByRole("button", { name: "Open folder: " + unpacked, exact: true }).click();
  await expect(reopened.getByLabel("Repack mode", { exact: true })).toHaveValue("manual", {
    timeout: 30000,
  });
  await expect(reopened.getByLabel("Repack shortcut", { exact: true })).toHaveValue("Mod+Alt+B");
  console.log(
    "PASS native external workflow: IDE typings, semantic diagnostics, external editor, explicit Apply/no execution, shader retention, streamed raw PIF8 including unregistered drafts, automatic per-action/interval and custom-shortcut backups, persistent folder recents and settings across restart",
  );
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
  await rm(unpacked, { recursive: true, force: true });
  await rm(archive, { force: true });
  await rm(automaticArchive, { force: true });
}
