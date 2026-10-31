import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 950 } }),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(
    (process.env.TEST_BASE_URL || "http://localhost:5173") + "/tests/animation-audio.html",
  );
  await expect(page.getByRole("button", { name: "Step animation", exact: true })).toBeEnabled();
  const state = () => page.evaluate(() => window.plan02Fixture.snapshot());
  const initial = await state();
  expect(initial.parses).toBe(1);
  expect(initial.leases).toBe(2);
  expect(initial.first).toBe(0);
  expect(initial.second).toBeCloseTo(0.5);
  expect(initial.voices).toBe(0);
  expect(initial.device.state).toBe("locked");
  await page.getByRole("button", { name: "Step animation", exact: true }).click();
  let value = await state();
  expect(value.first).toBeCloseTo(0.25);
  expect(value.second).toBeCloseTo(0.625);
  expect(value.events).toBe(0);
  await page.getByRole("button", { name: "Step animation", exact: true }).click();
  value = await state();
  expect(value.events).toBe(1);
  expect(value.first).toBeCloseTo(0.5);
  expect(value.second).toBeCloseTo(0.75);
  await page.getByRole("button", { name: "Enable audio", exact: true }).click();
  await expect.poll(async () => (await state()).device.buffers).toBe(1);
  expect((await state()).device.state).toBe("running");
  await page.getByRole("button", { name: "Play cue", exact: true }).click();
  await expect.poll(async () => (await state()).peak).toBeGreaterThan(0.01);
  await page.getByRole("button", { name: "100 lifecycle cycles", exact: true }).click();
  await expect.poll(async () => (await state()).cycles).toBe(100);
  value = await state();
  expect(value.voices).toBe(0);
  expect(value.tails).toBe(0);
  expect(value.device.voices).toBe(0);
  expect(value.device.buffers).toBe(1);
  expect(value.bindings).toBe(initial.bindings);
  await page.screenshot({ path: "build/plan02-foundation.png" });
  await page.getByRole("button", { name: "Dispose fixture", exact: true }).click();
  await expect.poll(async () => (await state()).device.state).toBe("closed");
  value = await state();
  expect(value.leases).toBe(0);
  expect(value.bindings).toBe(0);
  expect(value.device.pcmBytes).toBe(0);
  expect(value.accounted).toBe(value.baseline);
  expect(errors).toEqual([]);
  const decode = await page.evaluate(async () => {
    const browserPath = "/packages/audio/src/browser.ts",
      voicePath = "/packages/audio/src/voices.ts",
      fixturePath = "/tests/audio-fixtures.ts",
      budgetPath = "/packages/assets/src/budget.ts";
    const [{ BrowserAudioBackend }, { VoiceSystem }, { sineWave }, { assetMemory }] =
      await Promise.all(
        [browserPath, voicePath, fixturePath, budgetPath].map((path) => import(path)),
      );
    const before = assetMemory.snapshot.used,
      backend = new BrowserAudioBackend();
    await backend.unlock();
    await backend.loadWave("short", sineWave(), new AbortController().signal);
    const audio = new VoiceSystem(backend);
    await backend.suspend();
    const blocked = audio.play({ asset: "short" }).status;
    await backend.unlock();
    backend.unload("short");
    const large = sineWave(20, 2, 48000),
      controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 0);
    let cancelled = false;
    try {
      await backend.loadWave("cancel", large, controller.signal);
    } catch {
      cancelled = true;
    } finally {
      clearTimeout(timer);
    }
    const cancelledBytes = backend.stats.pcmBytes;
    const pending = backend.loadWave("dispose", large, new AbortController().signal).then(
      () => false,
      () => true,
    );
    await audio.dispose();
    const disposedPending = await pending;
    return {
      blocked,
      cancelled,
      cancelledBytes,
      disposedPending,
      finalBytes: backend.stats.pcmBytes,
      released: assetMemory.snapshot.used === before,
    };
  });
  expect(decode).toEqual({
    blocked: "blocked",
    cancelled: true,
    cancelledBytes: 0,
    disposedPending: true,
    finalBytes: 0,
    released: true,
  });
  expect(errors).toEqual([]);
  console.log(
    "PASS real imported skinned instances, independent pose clocks, marker crossing, gesture-unlocked Web Audio signal, 100 cycles and complete resource release",
  );
} finally {
  await browser.close();
}
