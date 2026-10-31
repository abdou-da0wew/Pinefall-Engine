import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } }),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(
    (process.env.TEST_BASE_URL || "http://localhost:5173") +
      "/tests/animation-audio.html?character=1",
  );
  await expect(page.getByRole("button", { name: "Step animation", exact: true })).toBeEnabled();
  const state = () => page.evaluate(() => window.plan02Fixture.snapshot());
  let snapshot = await state();
  expect(snapshot.external).toBe(true);
  expect(snapshot.joints).toBeGreaterThan(10);
  expect(snapshot.poseDifference).toBeGreaterThan(0.00001);
  expect(snapshot.parses).toBe(1);
  expect(snapshot.leases).toBe(2);
  await page.getByRole("button", { name: "Step animation", exact: true }).click();
  snapshot = await state();
  expect(snapshot.poseDifference).toBeGreaterThan(0.00001);
  await page.getByRole("button", { name: "Enable audio", exact: true }).click();
  await expect.poll(async () => (await state()).device.buffers).toBe(1);
  await page.getByRole("button", { name: "100 lifecycle cycles", exact: true }).click();
  await expect.poll(async () => (await state()).cycles).toBe(100);
  expect((await state()).device.voices).toBe(0);
  await page.screenshot({ path: "build/plan02-character.png" });
  await page.getByRole("button", { name: "Dispose fixture", exact: true }).click();
  await expect.poll(async () => (await state()).accounted).toBe(snapshot.baseline);
  expect((await state()).leases).toBe(0);
  expect((await state()).bindings).toBe(0);
  expect(errors).toEqual([]);
  console.log(
    "PASS external Blender character: independent multi-bone poses, one cached parse, two leases, 100 mixer cycles and release",
  );
} finally {
  await browser.close();
}
