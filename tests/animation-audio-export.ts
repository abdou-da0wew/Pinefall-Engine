import { mkdtemp, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { chromium, expect, _electron } from "@playwright/test";
const native = process.env.TEST_NATIVE === "1",
  directory = resolve("build/animation-audio-export");
const server = native
  ? undefined
  : Bun.serve({
      hostname: "0.0.0.0",
      port: 0,
      async fetch(request) {
        const pathname = new URL(request.url).pathname,
          path = resolve(
            directory,
            "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname),
          );
        if (!path.startsWith(directory + sep)) return new Response("Forbidden", { status: 403 });
        const file = Bun.file(path);
        return (await file.exists())
          ? new Response(file)
          : new Response("Not found", { status: 404 });
      },
    });
const profile = native ? await mkdtemp(resolve("build/workshop-profile-")) : undefined;
const args = ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  app = native
    ? await _electron.launch({
        args: [".", `--user-data-dir=${profile}`, ...args],
        cwd: process.cwd(),
      })
    : undefined,
  browser = native ? undefined : await chromium.launch({ headless: true, args });
try {
  const page = app
      ? await app.firstWindow()
      : await browser!.newPage({ viewport: { width: 1440, height: 900 } }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    const create = AudioContext.prototype.createGain;
    const seen = new WeakSet<AudioContext>();
    AudioContext.prototype.createGain = function () {
      const gain = create.call(this);
      if (!seen.has(this)) {
        seen.add(this);
        const analyser = this.createAnalyser();
        gain.connect(analyser);
        Reflect.set(window, "workshopAnalyser", analyser);
      }
      return gain;
    };
  });
  if (app) {
    await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
    await app.evaluate(async ({ BrowserWindow }, path) => {
      await BrowserWindow.getAllWindows()[0].loadFile(path);
    }, resolve("dist/game.html"));
    await page
      .locator("#file")
      .setInputFiles(resolve("examples/projects/animation-audio-workshop.pif"));
  } else await page.goto("http://localhost:" + server!.port);
  await expect(page.locator("#title")).toHaveText("Animation and audio workshop");
  await page.locator("#allow-scripts").click();
  await page.locator("#unlock-audio").click();
  await expect(page.locator("#unlock-audio")).toHaveText("Audio ready");
  await page.locator("canvas").focus();
  await page.keyboard.down("KeyW");
  await expect(page.getByText(/State: walk · Z 2\.3/)).toBeVisible({ timeout: 15000 });
  await page.keyboard.up("KeyW");
  await expect(page.getByText(/State: idle/)).toBeVisible();
  await page.keyboard.down("KeyF");
  await page.waitForTimeout(100);
  await page.keyboard.up("KeyF");
  await expect(page.getByText("Attack hits: 1", { exact: true })).toBeVisible();
  await expect(page.getByText(/State: idle/)).toBeVisible();
  await page.keyboard.down("KeyE");
  await page.waitForTimeout(100);
  await page.keyboard.up("KeyE");
  await expect(page.getByText(/State: turn/)).toBeVisible();
  await expect(page.getByText(/State: idle/)).toBeVisible();
  await page.locator("#pause").click();
  await page.waitForTimeout(250);
  await page
    .getByRole("button", { name: "Play UI sound (works while paused)", exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const analyser = Reflect.get(window, "workshopAnalyser") as AnalyserNode,
            values = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(values);
          return values.reduce((n, v) => Math.max(n, Math.abs(v)), 0);
        }),
      { intervals: [10, 10, 20] },
    )
    .toBeGreaterThan(0.01);
  await expect(page.locator("#error")).toBeEmpty();
  expect(errors).toEqual([]);
  expect(
    await page.locator('[data-ui-id="workshop-panel"]').evaluate((e) => {
      const content = e.lastElementChild!;
      return (
        content.scrollWidth <= content.clientWidth && content.scrollHeight <= content.clientHeight
      );
    }),
  ).toBe(true);
  await page.screenshot({
    path: native
      ? "build/animation-audio-workshop-native.png"
      : "build/animation-audio-workshop-export.png",
  });
  console.log(
    "PASS " +
      (native ? "Electron PIF player" : "exported standalone") +
      " workshop: wall, attack, turn, paused UI output, no page errors",
  );
} finally {
  await app?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  await browser?.close();
  await server?.stop(true);
}
