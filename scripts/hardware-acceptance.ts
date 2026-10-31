import { _electron, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
const args = process.argv.slice(2),
  option = (key: string) => {
    const i = args.indexOf(key);
    return i < 0 ? undefined : args[i + 1];
  };
const software = args.includes("--software-test"),
  executable = option("--executable"),
  model = option("--model") || "examples/projects/signal-crystal.glb";
const output = option("--output") || "build/hardware-acceptance.json";
const userData = resolve("build/acceptance-profile-" + Date.now());
const app = await _electron.launch({
  executablePath: executable,
  args: [
    ...(executable ? [] : ["."]),
    "--user-data-dir=" + userData,
    ...(software ? ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : []),
  ],
  cwd: process.cwd(),
});
const samples: unknown[] = [],
  errors: string[] = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(String(e)));
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled({
    timeout: 60000,
  });
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByLabel("Game name", { exact: true }).fill("Hardware acceptance");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await page.evaluate(() => {
    const frames: number[] = [],
      longTasks: number[] = [],
      inputFeedback: number[] = [];
    let running = true,
      last = performance.now();
    const frame = (now: number) => {
      if (!running) return;
      frames.push(now - last);
      last = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (longTasks.length < 10000) longTasks.push(entry.duration);
    });
    observer.observe({ entryTypes: ["longtask"] });
    const probe = document.createElement("button");
    probe.textContent = "Acceptance input probe";
    probe.id = "acceptance-probe";
    probe.style.cssText = "position:fixed;top:0;right:0;z-index:99999";
    probe.onclick = () => {
      const at = performance.now();
      probe.dataset.feedback = "received";
      requestAnimationFrame(() => inputFeedback.push(performance.now() - at));
    };
    document.body.append(probe);
    (window as unknown as { finishAcceptance: () => unknown }).finishAcceptance = () => {
      running = false;
      observer.disconnect();
      probe.remove();
      return { frames, longTasks, inputFeedback };
    };
  });
  const sample = async () =>
    samples.push(
      await app.evaluate(({ app }) => ({
        at: Date.now(),
        processes: app.getAppMetrics().map((p) => ({ type: p.type, memory: p.memory, cpu: p.cpu })),
      })),
    );
  await sample();
  const file = Bun.file(model),
    bytes = await file.bytes();
  if (bytes.length > 4_000_000) throw Error("Fixture exceeds source budget");
  await page.locator('input[accept=".glb,.fbx,.png,.jpg,.jpeg"]').setInputFiles({
    name: basename(model),
    mimeType: "application/octet-stream",
    buffer: Buffer.from(bytes),
  });
  // Input probes run while work is active and for a short steady-state interval. Report raw samples, not an invented SLO pass.
  for (let i = 0; i < 20; i++) {
    await page.locator("#acceptance-probe").click();
    await sample();
    await page.waitForTimeout(100);
  }
  await expect(page.locator(".statusbar")).toContainText("Imported " + basename(model), {
    timeout: 120000,
  });
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Play scene", exact: true }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Stop scene", exact: true }).click();
  await sample();
  const timing = await page.evaluate(() =>
    (
      window as unknown as {
        finishAcceptance: () => { frames: number[]; longTasks: number[]; inputFeedback: number[] };
      }
    ).finishAcceptance(),
  );
  const details = await app.evaluate(async ({ app }) => ({
    version: app.getVersion(),
    platform: process.platform,
    architecture: process.arch,
    electron: process.versions.electron,
    features: app.getGPUFeatureStatus(),
    gpu: await app.getGPUInfo("complete"),
  }));
  const percentile = (a: number[], p: number) => {
    const sorted = [...a].sort((x, y) => x - y);
    return sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]
      : null;
  };
  const summary = (a: number[]) => ({
    samples: a.length,
    p50: percentile(a, 0.5),
    p95: percentile(a, 0.95),
    p99: percentile(a, 0.99),
    max: a.length ? Math.max(...a) : null,
  });
  const gpuText = JSON.stringify(details.gpu),
    softwareDetected = /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(gpuText);
  const report = {
    schema: 1,
    time: new Date().toISOString(),
    mode: software ? "software-correctness-only" : "physical-candidate",
    hardwareAcceptance: false,
    manualVisualReview: "pending",
    softwareDetected,
    details,
    rendererStatsText: await page.locator(".viewport-stats").innerText(),
    fixture: {
      name: basename(model),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    },
    timing: {
      animationFrameIntervalMs: summary(timing.frames),
      note: "requestAnimationFrame intervals measure UI scheduling, not GPU execution or the engine's capped render rate",
      inputToNextFrameMs: summary(timing.inputFeedback),
      longTasksOver50ms: timing.longTasks.filter((n) => n > 50),
      raw: timing,
    },
    memory: {
      note: "Sampled process working sets, not hard memory limits or exact peaks; shared pages may be counted multiple times",
      samples,
    },
    errors,
  };
  await Bun.write(output, JSON.stringify(report, null, 2));
  expect(errors).toEqual([]);
  console.log(
    "Wrote " + output + "; hardware acceptance remains pending manual renderer/visual review.",
  );
} finally {
  await app.close();
}
