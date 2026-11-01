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
  await page.getByLabel("PMREM environment", { exact: true }).check();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.getByText("Depth-aware scattering", { exact: true }).click();
  await page.getByLabel("Preview depth scattering", { exact: true }).check();
  await page.getByLabel("Scattering ray steps", { exact: true }).selectOption("8");
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
  await expect(
    page.getByRole("dialog", { name: "Project files & external tools", exact: true }),
  ).toBeVisible();
  expect(await page.getByLabel("Shader fragment draft").count()).toBe(0);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Back to home", exact: true }).click();
  await expect(page.locator(".pf-home")).toBeVisible({ timeout: 60000 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await enterEditor(page);
  await page.getByRole("button", { name: "Rendering", exact: true }).click();
  await expect(page.getByLabel("Preview bloom", { exact: true })).toBeChecked();
  await expect(page.getByLabel("PMREM environment", { exact: true })).toBeChecked();
  await page.getByText("Depth-aware scattering", { exact: true }).click();
  await expect(page.getByLabel("Preview depth scattering", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Scattering ray steps", { exact: true })).toHaveValue("8");
  expect(errors).toEqual([]);
  console.log(
    "PASS Plan03 editor: preview/authored post separation, graphics-settings access, reusable surface authoring, external-file workflow entry and cold reopen",
  );
} finally {
  await app?.close();
  await browser?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
}
