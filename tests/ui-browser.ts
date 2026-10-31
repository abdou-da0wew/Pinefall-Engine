import { chromium, _electron, expect } from "@playwright/test";
const native = process.env.NATIVE_UI === "1";
const app = native
  ? await _electron.launch({
      executablePath: process.cwd() + "/build/releases/linux-unpacked/pinefall-engine",
      args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    })
  : undefined;
const browser = app
  ? undefined
  : await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
const page = app
  ? await app.firstWindow()
  : await browser!.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
try {
  if (!app) await page.goto("http://localhost:5173");
  await page.waitForFunction(
    () => !(document.querySelector('[aria-label="Play scene"]') as HTMLButtonElement)?.disabled,
  );
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByLabel("Game name", { exact: true }).fill("UI Workshop");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await page.getByRole("button", { name: "UI designer", exact: true }).click();
  await page.getByRole("button", { name: "Add sample HUD + script", exact: true }).click();
  const widget = (id: string) => page.locator(`[data-ui-id="${id}"]`);
  await expect(widget("health-text")).toContainText("Health: 75 / 100");
  await widget("health-text").click();
  await expect(page.getByLabel("UI Text", { exact: true })).toHaveValue("Health: 75 / 100");
  await page.getByLabel("UI Text", { exact: true }).fill("Health ready");
  await page.getByLabel("UI Text", { exact: true }).press("Tab");
  await expect(widget("health-text")).toContainText("Health ready");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(widget("health-text")).toContainText("Health: 75 / 100");
  const x = Number(await page.getByLabel("UI X", { exact: true }).inputValue());
  const box = (await widget("health-text").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 10, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByLabel("UI X", { exact: true })).not.toHaveValue(String(x));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => Math.round((await widget("health-text").boundingBox())!.x))
    .toBe(Math.round(box.x));
  const initialWidth = await page.getByLabel("UI Width", { exact: true }).inputValue();
  const handle = widget("health-text").locator("[data-ui-resize]");
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 25, hb.y + hb.height / 2 + 10, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByLabel("UI Width", { exact: true })).not.toHaveValue(initialWidth);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByLabel("Allow trusted scripts", { exact: true }).check();
  await page.getByRole("button", { name: "Play scene", exact: true }).click();
  await expect(widget("hud-title")).toContainText("FIELD KIT ·");
  await widget("heal-button").getByRole("button").click();
  await expect(widget("health-text")).toContainText("85");
  await widget("heal-button").getByRole("button").click();
  await widget("heal-button").getByRole("button").click();
  await expect(widget("heal-button").getByRole("button")).toBeDisabled();
  await widget("shield-toggle").getByRole("checkbox").check();
  await expect(widget("status-text")).toContainText("Shield on");
  await widget("power-slider").getByRole("slider").fill("66");
  await expect(widget("status-text")).toContainText("Power: 66");
  await widget("pause-button").getByRole("button").click();
  await expect(widget("pause-button")).toContainText("Resume");
  const title = await widget("hud-title").textContent();
  await page.waitForTimeout(250);
  await expect(widget("hud-title")).toHaveText(title!);
  await widget("pause-button").getByRole("button").click();
  await expect(widget("pause-button")).toContainText("Pause");
  await page.getByRole("button", { name: "Stop scene", exact: true }).click();
  await expect(widget("health-text")).toContainText("Health: 75 / 100");
  await expect(widget("hud-title")).toHaveText("FIELD KIT");
  await page.getByLabel("UI element type", { exact: true }).selectOption("input");
  await page.getByRole("button", { name: "Add UI element", exact: true }).click();
  await expect(widget("input-1")).toHaveCount(1);
  await page.getByLabel("UI X", { exact: true }).fill("32");
  await page.getByLabel("UI X", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "Play scene", exact: true }).click();
  const input = widget("input-1").getByRole("textbox");
  await input.fill("<img src=x onerror=alert(1)>");
  await expect(input).toHaveValue("<img src=x onerror=alert(1)>");
  expect(await widget("input-1").locator("img").count()).toBe(0);
  await input.press("w");
  await expect(input).toBeFocused();
  await page.getByRole("button", { name: "Stop scene", exact: true }).click();
  await page.getByRole("button", { name: "UI designer", exact: true }).click();
  await page.locator(".ui-tree button").filter({ hasText: "HUD panel" }).click();
  if (!app) await page.screenshot({ path: "docs/ui-designer.png" });
  expect(errors).toEqual([]);
  console.log(
    "PASS " +
      (native ? "packaged Linux" : "browser") +
      " UI authoring, drag/undo, live SDK actions, pause/resume, input focus, Stop reset",
  );
} finally {
  await app?.close();
  await browser?.close();
}
