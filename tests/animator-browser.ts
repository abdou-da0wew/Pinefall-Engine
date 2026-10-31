import { chromium, expect } from "@playwright/test";
import { skinnedTriangle } from "./asset-fixtures";
const base = process.env.TEST_BASE_URL || "http://localhost:5173";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(base + "/tests/runtime.html");
  const result = await page.evaluate(async () => {
    const fixturePath = "/tests/animator-fixtures.ts",
      runtimePath = "/packages/runtime/src/index.ts",
      headlessPath = "/packages/headless/src/index.ts";
    const { animatedScene } = await import(fixturePath),
      { Engine } = await import(runtimePath),
      { HeadlessEngine } = await import(headlessPath);
    const { scene, id } = await animatedScene();
    const twin = structuredClone(scene.entities.find((e: { id: string }) => e.id === id));
    twin.id = "twin";
    twin.name = "Twin";
    twin.transform.position[0] = 3;
    scene.entities.push(twin);
    const engine = await Engine.create(document.querySelector("canvas"));
    let headless;
    const check = (ok: boolean, message: string) => {
      if (!ok) throw Error(message);
    };
    try {
      await engine.load(scene);
      headless = await HeadlessEngine.create(scene);
      const first = engine.animators.get(id),
        second = engine.animators.get("twin");
      first.seek(0.25);
      second.seek(0.75);
      check(
        Math.abs(first.root.getObjectByName("Bone").position.y - 0.25) < 1e-6,
        "first independent pose",
      );
      check(
        Math.abs(second.root.getObjectByName("Bone").position.y - 0.75) < 1e-6,
        "second independent pose",
      );
      const before = engine.assetCache.budget.snapshot.used,
        documentBefore = engine.document,
        objectsBefore = engine.objects;
      const bad = structuredClone(scene);
      bad.entities.find((e: { id: string }) => e.id === id).animator.clips.idle.end = 2;
      let rejected = false;
      try {
        await engine.load(bad);
      } catch {
        rejected = true;
      }
      check(
        rejected && engine.document === documentBefore && engine.objects === objectsBefore,
        "staged invalid trim preserves live world",
      );
      check(
        engine.assetCache.budget.snapshot.used === before,
        "staged rejection frees reservations",
      );
      engine.play();
      headless.play();
      engine.animators.get(id).graph.setParameter("attack", true);
      headless.animators.get(id).graph.setParameter("attack", true);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          off();
          reject(Error("Marker timeout"));
        }, 10000);
        const off = engine.events.subscribe((e: { type: string; message: string }) => {
          if (e.type === "animation" && e.message === "hit") {
            engine.paused = true;
            clearTimeout(timeout);
            off();
            resolve();
          }
        });
      });
      const ticks = Math.round(engine.animators.get(id).graph.snapshot.elapsed * 60);
      headless.step(ticks);
      for (const key of [id, "twin"])
        check(
          Math.abs(
            engine.animators.get(key).root.getObjectByName("Bone").position.y -
              headless.animators.get(key).root.getObjectByName("Bone").position.y,
          ) < 1e-6,
          "graphical/headless pose parity",
        );
      check(
        engine.events.entries.filter(
          (e: { type: string; message: string }) => e.type === "animation" && e.message === "hit",
        ).length === 1,
        "single marker",
      );
      await engine.stop();
      const baseline = engine.assetCache.budget.snapshot.used;
      for (let i = 0; i < 100; i++) {
        engine.play();
        await engine.stop();
        check(engine.animators.size === 2, "two animator owners");
        check(engine.assetCache.metrics.leases === 2, "two model leases");
        check(engine.assetCache.budget.snapshot.used === baseline, "stable reservations");
      }
      return {
        ticks,
        cycles: 100,
        leases: engine.assetCache.metrics.leases,
        animators: engine.animators.size,
        parses: engine.assetCache.metrics.parses,
      };
    } finally {
      headless?.dispose();
      engine.dispose();
    }
  });
  console.log(
    "PASS integrated animator parity, rollback, independence, 100 Play/Stop:",
    JSON.stringify(result),
  );
  await page.goto(base);
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page
    .locator('input[type="file"][accept*=".glb"]')
    .setInputFiles({
      name: "rig.glb",
      mimeType: "model/gltf-binary",
      buffer: Buffer.from(skinnedTriangle()),
    });
  await expect(page.getByRole("button", { name: "Add animator", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Add animator", exact: true }).click();
  await expect(page.getByRole("button", { name: "Apply animator", exact: true })).toBeEnabled();
  await page.getByLabel("Animation trim start", { exact: true }).fill("0.2");
  await page.getByLabel("Animation trim end", { exact: true }).fill("0.8");
  await page.getByRole("button", { name: "Apply animator", exact: true }).click();
  await expect(page.getByRole("button", { name: "Apply animator", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Animation trim start", { exact: true })).toHaveValue("0.2");
  await page.getByLabel("Skeleton overlay", { exact: true }).check();
  await page.getByRole("button", { name: "Play preview", exact: true }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Pause preview", exact: true }).click();
  const definition = page.getByLabel("Animator definition", { exact: true }),
    good = await definition.inputValue();
  await definition.fill('{"version":999}');
  await page.getByRole("button", { name: "Apply animator", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Unsupported animator version" }),
  ).toBeVisible();
  await definition.fill(good);
  await page.getByRole("button", { name: "Apply animator", exact: true }).click();
  expect(errors).toEqual([]);
  await page.screenshot({ path: "build/animator-editor.png", fullPage: true });
  console.log("PASS editor animator creation, trim, skeleton, preview and invalid-draft isolation");
} finally {
  await browser.close();
}
