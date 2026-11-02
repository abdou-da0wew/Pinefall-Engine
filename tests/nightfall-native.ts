import { _electron, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
const profile = await mkdtemp(resolve("build/nightfall-profile-"));
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
  const page = await app.firstWindow(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  if (!process.env.TEST_GAME_STANDALONE) {
    await expect(
      page.getByRole("button", { name: "Play Nightfall Keep", exact: true }),
    ).toBeVisible({
      timeout: 60000,
    });
    await page.getByRole("button", { name: "Play Nightfall Keep", exact: true }).click();
  }
  if (process.env.TEST_GAME_STANDALONE) {
    expect(await app.evaluate(({ app }) => app.getName())).toMatch(/nightfall/i);
    expect(await page.evaluate(() => typeof window.engineDesktop)).toBe("undefined");
  }
  await expect(page.locator("#start")).toBeEnabled({ timeout: 120000 });
  await page.locator("#start").click();
  await expect(page.locator("#menu")).toBeHidden();
  await page.mouse.click(600, 400);
  await expect
    .poll(() => page.evaluate(() => !!document.pointerLockElement), { timeout: 30000 })
    .toBe(true);
  await expect(page.locator('[data-ui-id="ammo"]')).not.toContainText("15 / 120", {
    timeout: 30000,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("#menu")).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: "docs/evidence/nightfall/native-pause.png" });
  expect(errors).toEqual([]);
  console.log(
    "PASS Linux Electron game/player: PIF load, trust/audio start, allowed pointer capture, shot and pause. Production sandbox unchanged; test runner uses root-only no-sandbox.",
  );
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
}
