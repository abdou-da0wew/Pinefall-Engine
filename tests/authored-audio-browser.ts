import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { chromium, expect, _electron } from "@playwright/test";
import { sineWave } from "./audio-fixtures";
const native = process.env.TEST_NATIVE === "1",
  base = process.env.TEST_BASE_URL || "http://localhost:5173";
const profile = native ? await mkdtemp(resolve("build/audio-profile-")) : undefined;
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
  if (!native) {
    await page.goto(base + "/tests/runtime.html");
    await page.evaluate(async () => {
      const fixturePath = "/tests/authored-audio-fixtures.ts",
        runtimePath = "/packages/runtime/src/index.ts";
      const { audioScene } = await import(fixturePath),
        { Engine } = await import(runtimePath),
        { scene, id } = await audioScene();
      const panners: PannerNode[] = [];
      const original = AudioContext.prototype.createPanner;
      AudioContext.prototype.createPanner = function () {
        const p = original.call(this);
        panners.push(p);
        return p;
      };
      const engine = await Engine.create(document.querySelector("canvas"));
      await engine.load(scene);
      if (engine.audio.play("loop").status !== "blocked") throw Error("Audio should start locked");
      const button = document.createElement("button");
      button.id = "unlock-authored";
      button.textContent = "Unlock authored";
      button.onclick = () => {
        void engine.audio.unlock().then((ready: boolean) => {
          button.dataset.ready = String(ready);
        });
      };
      document.body.append(button);
      Reflect.set(window, "authoredAudio", { engine, scene, id, panners });
    });
    await page.click("#unlock-authored");
    await expect(page.locator("#unlock-authored")).toHaveAttribute("data-ready", "true");
    await page.evaluate(() => {
      const { engine } = Reflect.get(window, "authoredAudio");
      engine.play();
      const result = engine.audio.play("loop", "test");
      if (result.status !== "scheduled") throw Error("Loop should schedule");
    });
    await expect
      .poll(() =>
        page.evaluate(() => Reflect.get(window, "authoredAudio").engine.audio.backend.outputPeak()),
      )
      .toBeGreaterThan(0.01);
    await page.evaluate(() => {
      const { engine } = Reflect.get(window, "authoredAudio");
      engine.paused = true;
      if (engine.audio.play("loop").status !== "blocked") throw Error("Paused game cue must block");
      if (engine.audio.preview("tone").status !== "scheduled")
        throw Error("UI preview must remain available");
    });
    await page.waitForTimeout(350);
    expect(
      await page.evaluate(() =>
        Reflect.get(window, "authoredAudio").engine.audio.backend.outputPeak(),
      ),
    ).toBeLessThan(0.001);
    await page.evaluate(() => {
      Reflect.get(window, "authoredAudio").engine.paused = false;
    });
    await expect
      .poll(() =>
        page.evaluate(() => Reflect.get(window, "authoredAudio").engine.audio.backend.outputPeak()),
      )
      .toBeGreaterThan(0.01);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Reflect.get(window, "authoredAudio").engine.events.entries.filter(
              (e: { message: string; data?: { cue: string } }) =>
                e.message === "Audio cue scheduled" && e.data?.cue === "foot",
            ).length,
        ),
      )
      .toBe(1);
    await page.evaluate(() => {
      const { engine, id } = Reflect.get(window, "authoredAudio");
      engine.objects.get(id).position.x = 4;
      engine.audio.play("foot", id, [-4, 0, -3]);
    });
    await expect
      .poll(() =>
        page.evaluate(() => Reflect.get(window, "authoredAudio").panners.at(-1)?.positionX.value),
      )
      .toBe(4);
    const result = await page.evaluate(async () => {
      const { engine, scene } = Reflect.get(window, "authoredAudio");
      for (const position of [
        [2, 3, 4],
        [-2, 1, 0],
      ]) {
        engine.paused = true;
        engine.orbit.enabled = false;
        engine.camera.position.set(...position);
        await new Promise((resolve) => setTimeout(resolve, 200));
        const listener = engine.audio.backend.context.listener;
        if (
          listener.positionX.value !== position[0] ||
          listener.positionY.value !== position[1] ||
          listener.positionZ.value !== position[2]
        )
          throw Error("Listener swap failed");
      }
      const bad = structuredClone(scene);
      bad.audio.assets[0].data = "data:audio/wav;base64,AAAA";
      const document = engine.document,
        before = engine.assetCache.budget.snapshot.used;
      let rejected = false;
      try {
        await engine.load(bad);
      } catch {
        rejected = true;
      }
      if (
        !rejected ||
        engine.document !== document ||
        engine.assetCache.budget.snapshot.used !== before
      )
        throw Error("Bad audio must retain live world without reservations");
      await engine.stop();
      await engine.audio.settled();
      const baseline = engine.assetCache.budget.snapshot.used;
      for (let i = 0; i < 100; i++) {
        engine.play();
        engine.paused = true;
        engine.audio.preview("tone");
        await engine.stop();
        await engine.audio.settled();
        if (
          engine.audio.stats.active !== 0 ||
          engine.audio.backend.stats.voices !== 0 ||
          engine.audio.backend.stats.buffers !== 1 ||
          engine.assetCache.budget.snapshot.used !== baseline
        )
          throw Error("Audio cycle ownership failed");
      }
      const result = {
        cycles: 100,
        buffers: engine.audio.backend.stats.buffers,
        pcmBytes: engine.audio.backend.stats.pcmBytes,
      };
      await engine.audio.dispose();
      engine.dispose();
      return result;
    });
    console.log(
      "PASS authored audio gesture/output/pause/UI/spatial/rollback/100 cycles:",
      JSON.stringify(result),
    );
    await page.goto(base);
  }
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Audio studio", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Audio studio" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Import WAV", { exact: true })
    .setInputFiles({ name: "tone.wav", mimeType: "audio/wav", buffer: Buffer.from(sineWave(0.2)) });
  await expect(dialog.getByRole("status")).toContainText("Imported");
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Unlock audio", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Audio ready");
  await dialog.getByRole("button", { name: "Preview selected audio", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("scheduled");
  const text = dialog.getByLabel("Audio cue definitions", { exact: true }),
    good = await text.inputValue();
  await text.fill('{"cues":[],"buses":{}}');
  await dialog.getByRole("button", { name: "Apply audio definitions", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await text.fill(good);
  await dialog.getByRole("button", { name: "Apply audio definitions", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByLabel("Import WAV", { exact: true }).setInputFiles({
    name: "tone-copy.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from(sineWave(0.2)),
  });
  await expect(dialog.getByRole("status")).toContainText("Selected existing audio asset");
  await dialog.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({
    path: native ? "build/authored-audio-native.png" : "build/authored-audio-editor.png",
  });
  await dialog.getByRole("button", { name: "Remove selected asset…", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm remove audio", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Preview selected audio", exact: true }),
  ).toBeDisabled();
  await expect(text).toHaveValue(/"assets"|"cues": \[\]/);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Audio studio", exact: true })).toBeFocused();
  expect(errors).toEqual([]);
  console.log(
    "PASS " +
      (native ? "Electron" : "browser") +
      " audio import, explicit unlock/preview, invalid-draft isolation and modal focus",
  );
} finally {
  await app?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  await browser?.close();
}
