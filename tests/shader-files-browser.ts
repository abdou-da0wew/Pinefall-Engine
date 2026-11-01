import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { enterEditor } from "./editor-navigation";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
await mkdir("build", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    errors.push(String(e));
    console.error("PAGE ERROR", String(e));
  });
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await enterEditor(page);
  await page.getByRole("treeitem").filter({ hasText: "Valley floor" }).first().click();
  await page.getByRole("button", { name: "Custom shader…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Project files & external tools", exact: true });
  const apply = page.getByRole("button", {
    name: "Compile and apply imported shader",
    exact: true,
  });
  const fragment = "vec4 shade(vec2 uv, vec3 p) { return vec4(uTint, 1.0); }";
  const upload = async (text: string, name = "fixture.glsl") =>
    page
      .getByLabel("Import GLSL fragment", { exact: true })
      .setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from(text) });
  await upload(fragment);
  await expect(dialog).toContainText("not compiled or applied");
  await expect(apply).toBeDisabled();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Rendering", exact: true }).click();
  await page
    .getByRole("button", { name: "Trust and reload authored shaders", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("button", { name: "Custom shader…", exact: true }).click();
  await upload(fragment);
  await expect(apply).toBeEnabled();
  await page.getByLabel("Import shader uniforms JSON", { exact: true }).setInputFiles({
    name: "fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"uTint":{"type":"vec3","value":[0.1,0.8,0.2]}}'),
  });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(dialog).toContainText("applied after successful GPU compilation", {
    timeout: 30000,
  });
  await upload("vec4 shade(vec2 uv, vec3 p) { invalid GPU code; }");
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(dialog.getByRole("alert")).toContainText("Previous working shader retained", {
    timeout: 30000,
  });
  await page.screenshot({ path: "build/browser-shader-file-failure.png" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Custom shader…", exact: true }).click();
  const download = async (button: string) => {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: button, exact: true }).click();
    return readFile((await (await pending).path())!, "utf8");
  };
  expect(await download("Export GLSL fragment")).toBe(fragment);
  expect(JSON.parse(await download("Export shader uniforms"))).toEqual({
    uTint: { type: "vec3", value: [0.1, 0.8, 0.2] },
  });
  await upload("x".repeat(16385));
  await expect(dialog.getByRole("alert")).toContainText("text budget");
  await expect(apply).toBeDisabled();
  await upload(fragment);
  await expect(apply).toBeEnabled();
  await page.screenshot({ path: "build/browser-shader-file-import.png" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Back to home", exact: true }).click();
  await expect(page.locator(".pf-home")).toBeVisible({ timeout: 60000 });
  await page.reload({ waitUntil: "networkidle" });
  await enterEditor(page);
  await page.getByRole("treeitem").filter({ hasText: "Valley floor" }).first().click();
  await page.getByRole("button", { name: "Custom shader…", exact: true }).click();
  expect(await download("Export GLSL fragment")).toBe(fragment);
  expect(errors).toEqual([]);
  console.log(
    "PASS browser shader files: untrusted import blocked, explicit GPU Apply, uniforms, compile failure retention, size rejection, export and cold reopen persistence; no embedded editor",
  );
} finally {
  await browser.close();
}
