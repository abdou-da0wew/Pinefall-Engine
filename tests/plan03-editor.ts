import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect, _electron } from "@playwright/test";
import { enterEditor } from "./editor-navigation";
const native = process.env.TEST_NATIVE === "1";
const profile = native ? await mkdtemp(resolve("build/plan03-ui-profile-")) : undefined;
const args = ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const app = native
  ? await _electron.launch({
      args: [".", `--user-data-dir=${profile}`, ...args],
      cwd: process.cwd(),
    })
  : undefined;
const browser = app ? undefined : await chromium.launch({ headless: true, args });

try {
  const page = app
    ? await app.firstWindow()
    : await browser!.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  if (!native) await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await enterEditor(page);
  await page.getByRole("button", { name: "Rendering", exact: true }).click();
  await page.getByLabel("Preview enabled", { exact: true }).check();
  await page.getByLabel("Preview bloom", { exact: true }).check();
  await page.getByLabel("Preview fxaa", { exact: true }).check();
  await page.getByRole("button", { name: "Apply preview post to project", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Use authored post settings", exact: true }).click();
  await expect(page.getByLabel("Preview bloom", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "GPU / CPU & compositor settings…", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Editor settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "build/" + (native ? "native-" : "") + "plan03-rendering-preview.png",
  });
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("treeitem").filter({ hasText: "Valley floor" }).first().click();
  await page.getByRole("button", { name: "Edit material surface…", exact: true }).click();
  await page.getByRole("button", { name: "Surface color", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Surface color", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Material surface", exact: true })).toBeVisible();
  await page.getByLabel("Surface metalness", { exact: true }).fill("0.65");
  await page.getByLabel("Surface roughness", { exact: true }).fill("0.2");
  await page.screenshot({
    path: "build/" + (native ? "native-" : "") + "plan03-material-surface.png",
  });
  await page.getByRole("button", { name: "Save reusable material", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  expect(await page.getByLabel("Reusable material", { exact: true }).inputValue()).not.toBe("");
  await page.getByRole("button", { name: "Custom shader…", exact: true }).click();
  await page.getByLabel("Trust custom shader", { exact: true }).check();
  await page.getByRole("button", { name: "Compile and apply", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Custom unlit shader", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Custom shader…", exact: true }).click();
  await page.getByLabel("Shader fragment draft", { exact: true }).fill("unfinished shader draft");
  await page.getByLabel("Shader uniforms", { exact: true }).fill("{ unfinished uniforms");
  await page.getByRole("button", { name: "Save draft only", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Custom shader…", exact: true }).click();
  await expect(page.getByLabel("Shader fragment draft", { exact: true })).toHaveValue(
    "unfinished shader draft",
  );
  await expect(page.getByLabel("Shader uniforms", { exact: true })).toHaveValue(
    "{ unfinished uniforms",
  );
  await page.getByLabel("Shader uniforms", { exact: true }).fill("{}");
  await page.getByRole("button", { name: "Compile and apply", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("previous material retained");
  await page.screenshot({
    path: "build/" + (native ? "native-" : "") + "plan03-shader-recovery.png",
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Back to home", exact: true }).click();
  await expect(page.locator(".pf-home")).toBeVisible({ timeout: 60000 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await enterEditor(page);
  await page.getByRole("button", { name: "Rendering", exact: true }).click();
  await expect(page.getByLabel("Preview bloom", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("treeitem").filter({ hasText: "Valley floor" }).first().click();
  await page.getByRole("button", { name: "Custom shader…", exact: true }).click();
  await expect(page.getByLabel("Shader fragment draft", { exact: true })).toHaveValue(
    "unfinished shader draft",
  );
  await expect(page.getByLabel("Shader uniforms", { exact: true })).toHaveValue(
    "{ unfinished uniforms",
  );
  await expect(page.getByLabel("Trust custom shader", { exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(errors).toEqual([]);
  console.log(
    "PASS Plan03 editor: preview/authored post separation, graphics-settings access, reusable surface authoring, shader compile/recovery, independent source/uniform drafts, cold reopen and trust reset",
  );
} finally {
  await app?.close();
  await browser?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
}
