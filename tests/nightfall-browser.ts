import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import type { Engine } from "../packages/runtime/src";
declare global {
  interface Window {
    nightfall: Engine;
  }
}
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") console.error(m.text());
  });
  await page.goto((process.env.TEST_BASE_URL ?? "http://localhost:5174") + "/nightfall.html");
  await expect(page.locator("#start")).toBeEnabled({ timeout: 120000 });
  await mkdir("docs/evidence/nightfall", { recursive: true });
  await page.screenshot({ path: "docs/evidence/nightfall/title.png" });
  await page.locator("#start").click();
  await expect(page.locator("#menu")).toBeHidden();
  await expect(page.locator('[data-ui-id="ammo"]')).toContainText("WARDEN");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "docs/evidence/nightfall/first-watch.png" });
  await page.mouse.click(640, 360);
  await page.waitForTimeout(500);
  await expect(page.locator('[data-ui-id="ammo"]')).not.toContainText("15 / 120");
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(2200);
  await expect(page.locator('[data-ui-id="ammo"]')).toContainText("15 / 119", { timeout: 30000 });
  await page.keyboard.press("Digit2");
  await page.waitForTimeout(300);
  await expect(page.locator('[data-ui-id="ammo"]')).toContainText("RELIQUARY");
  await page.evaluate(() => {
    window.nightfall.look.yaw = 0;
    window.nightfall.look.pitch = 0;
  });
  await page.keyboard.down("KeyW");
  await expect
    .poll(
      () => page.evaluate(() => window.nightfall.physics.bodies.get("warden")!.translation().z),
      { timeout: 30000 },
    )
    .toBeLessThan(17);
  await page.keyboard.up("KeyW");
  await expect(page.locator('[data-ui-id="wave"]')).toContainText("WAVE 01", { timeout: 30000 });
  await page.evaluate(() => {
    const e = window.nightfall;
    const body = e.physics.bodies.get("enemy-0")!;
    body.setTranslation({ x: 0, y: 0.9, z: 10 }, true);
    body.setNextKinematicTranslation({ x: 0, y: 0.9, z: 10 });
    e.look.yaw = 0;
    e.look.pitch = 0;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "docs/evidence/nightfall/approach.png" });
  const audio = await page.evaluate(() => ({
    stats: window.nightfall.audio.stats,
    peak: (window.nightfall.audio.backend as unknown as { outputPeak(): number }).outputPeak(),
  }));
  expect(audio.stats.state).toBe("ready");
  expect(audio.peak).toBeGreaterThan(0);
  await page.evaluate(() => {
    const e = window.nightfall;
    for (let i = 0; i < 6000 && !e.ui.get("retry")!.visible; i++) e.fixed.run(e);
  });
  await expect(page.locator('[data-ui-id="retry"]')).toBeVisible();
  await page.screenshot({ path: "docs/evidence/nightfall/death.png" });
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-ui-id="retry"]')).toBeHidden({ timeout: 30000 });
  await page.keyboard.press("Escape");
  await expect(page.locator("#menu")).toBeVisible({ timeout: 30000 });
  await page.locator("#quality").selectOption("high");
  await page.locator("#start").click();
  await expect(page.locator("#menu")).toBeHidden();
  await page.evaluate(() => {
    window.nightfall.look.yaw = -0.5;
    window.nightfall.look.pitch = 0.08;
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "docs/evidence/nightfall/high-profile.png" });
  expect(
    await page.evaluate(() => window.nightfall.events.entries.filter((e) => e.type === "error")),
  ).toEqual([]);
  expect(errors).toEqual([]);
  console.log(
    "PASS Nightfall real browser: load/trust, render, mouse shot, reload, weapon switch, movement, live wave, nonzero audio signal, accelerated death, restart and pause.",
  );
} finally {
  await browser.close();
}
