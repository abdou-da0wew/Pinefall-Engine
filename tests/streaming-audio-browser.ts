import { enterEditor } from "./editor-navigation";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect, _electron } from "@playwright/test";
const native = process.env.TEST_NATIVE === "1",
  profile = native ? await mkdtemp(resolve("build/stream-profile-")) : undefined;
const app = native
  ? await _electron.launch({
      executablePath: process.env.TEST_DESKTOP_EXECUTABLE,
      args: [
        ...(process.env.TEST_DESKTOP_EXECUTABLE ? [] : ["."]),
        `--user-data-dir=${profile}`,
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
      cwd: process.cwd(),
    })
  : undefined;
const browser = native
  ? undefined
  : await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
try {
  const page = app ? await app.firstWindow() : await browser!.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const url = (process.env.TEST_BASE_URL ?? "http://localhost:5173") + "/tests/runtime.html";
  if (app) {
    await enterEditor(page);
    await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
    await app.evaluate(
      async ({ BrowserWindow }, url) => BrowserWindow.getAllWindows()[0].loadURL(url),
      url,
    );
  } else await page.goto(url);
  await page.evaluate(async () => {
    const runtime = "/packages/runtime/src/index.ts",
      fixture = "/tests/streaming-audio-fixtures.ts",
      project = "/packages/project/src/index.ts";
    const { Engine } = await import(runtime),
      { streamingDefinition } = await import(fixture),
      { createGame } = await import(project);
    const elements = new Set<HTMLMediaElement>(),
      play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      elements.add(this);
      return play.call(this);
    };
    const engine = await Engine.create(document.querySelector("canvas")),
      scene = createGame("Stream test");
    scene.version = 3;
    scene.audio = streamingDefinition();
    await engine.load(scene);
    const button = document.createElement("button");
    button.id = "unlock";
    button.textContent = "Unlock";
    button.onclick = () => {
      void engine.audio.unlock().then(() => (button.dataset.ready = "true"));
    };
    document.body.append(button);
    Reflect.set(window, "streamTest", { engine, scene, elements });
  });
  await page.click("#unlock");
  await expect(page.locator("#unlock")).toHaveAttribute("data-ready", "true");
  await page.evaluate(() => {
    const t = Reflect.get(window, "streamTest");
    t.engine.play();
    t.result = t.engine.audio.play("music", "owner");
    if (t.result.status !== "scheduled") throw Error("Stream not scheduled");
  });
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "streamTest").engine.audio.backend.outputPeak()),
    )
    .toBeGreaterThan(0.01);
  await page.evaluate(async () => {
    const t = Reflect.get(window, "streamTest"),
      { engine, result } = t;
    if (engine.audio.backend.stats.pcmBytes !== 0) throw Error("Stream decoded as effects");
    engine.audio.setPaused(true);
    for (let i = 0; i < 100; i++) engine.audio.seek(result.handle, i % 30, "owner");
    engine.audio.stopOwner("owner");
    const next = structuredClone(t.scene);
    next.audio.assets = [];
    next.audio.cues = [];
    await engine.load(next);
    await engine.audio.settled();
    if (!engine.audio.voices.has(result.handle))
      throw Error("Persistent voice lost on world adoption");
    engine.play();
    if (!engine.audio.voices.has(result.handle)) throw Error("Persistent voice lost on Play");
    await engine.audio.suspend();
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...Reflect.get(window, "streamTest").elements].every(
          (m) => (m as HTMLMediaElement).paused,
        ),
      ),
    )
    .toBe(true);
  await page.locator("#unlock").evaluate((e) => e.removeAttribute("data-ready"));
  await page.click("#unlock");
  await expect(page.locator("#unlock")).toHaveAttribute("data-ready", "true");
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "streamTest").engine.audio.backend.outputPeak()),
    )
    .toBeGreaterThan(0.01);
  await page.evaluate(async () => {
    const t = Reflect.get(window, "streamTest"),
      { engine } = t;
    await engine.stop();
    await engine.audio.settled();
    const stats = engine.audio.backend.stats;
    if (stats.streams || stats.streamAssets || stats.pcmBytes || stats.streamError)
      throw Error(JSON.stringify(stats));
    let baseline = 0;
    for (let i = 0; i < 100; i++) {
      await engine.load(t.scene);
      await engine.audio.settled();
      engine.audio.play("music");
      await engine.stop();
      await engine.audio.settled();
      if (i === 0) baseline = engine.assetCache.budget.snapshot.used;
      if (
        engine.audio.backend.stats.streams ||
        engine.audio.backend.stats.streamAssets !== 1 ||
        engine.assetCache.budget.snapshot.used !== baseline
      )
        throw Error("Leaked stream/source reservation");
    }
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = () =>
      Promise.reject(new DOMException("intentional device rejection", "NotAllowedError"));
    try {
      engine.audio.play("music");
      await new Promise((resolve) => setTimeout(resolve, 50));
      engine.audio.advance(0);
      if (
        engine.audio.stats.active !== 0 ||
        !engine.audio.backend.stats.streamError ||
        !engine.events.entries.some(
          (e: { message: string }) => e.message === "Audio stream failure",
        )
      )
        throw Error("Media rejection lacks cleanup/diagnostic");
    } finally {
      HTMLMediaElement.prototype.play = play;
    }
    engine.dispose();
    await engine.audio.settled();
    if (engine.audio.backend.stats.streamAssets || engine.audio.backend.stats.streams)
      throw Error("Disposal retained media resources");
  });
  expect(errors).toEqual([]);
  console.log(
    "PASS streaming real output, 100 seeks, persistent world adoption, suspension/resume, Stop, device rejection and 100 stable tracked-memory cycles",
  );
} finally {
  await browser?.close();
  await app?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
}
