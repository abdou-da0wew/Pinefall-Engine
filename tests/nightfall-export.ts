import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }),
    errors: string[] = [],
    failed: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().endsWith("favicon.ico"))
      failed.push(r.url() + " " + r.status());
  });
  await page.goto(process.env.TEST_EXPORT_URL ?? "http://localhost:4175");
  await expect(page.locator("#start")).toBeEnabled({ timeout: 120000 });
  await page.locator("#quality").selectOption("high");
  await page.locator("#start").click();
  await expect(page.locator("#menu")).toBeHidden();
  await page.mouse.click(640, 360);
  await expect(page.locator('[data-ui-id="ammo"]')).not.toContainText("15 / 120", {
    timeout: 30000,
  });
  await expect(page.locator("#telemetry")).toContainText("DRAWS");
  await page.keyboard.press("Escape");
  await expect(page.locator("#menu")).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: "docs/evidence/nightfall/production.png", timeout: 60000 });
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
  console.log(
    "PASS production standalone: locally packaged worker/WASM dependencies, PIF load, high profile, trust, fire, HUD, zero page errors or missing resources.",
  );
} finally {
  await browser.close();
}
