import { chromium, expect, _electron } from "@playwright/test";
import { rootMotionScene } from "./animator-fixtures";
import { packProject } from "../packages/project/src/pif";
const native = process.env.TEST_NATIVE === "1";
const app = native
  ? await _electron.launch({
      args: [".", "--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
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
  const base = process.env.TEST_BASE_URL || "http://localhost:5173";
  if (!native) {
    await page.goto(base + "/tests/runtime.html");
    const result = await page.evaluate(async () => {
      const fixturePath = "/tests/animator-fixtures.ts",
        runtimePath = "/packages/runtime/src/index.ts",
        headlessPath = "/packages/headless/src/index.ts";
      const { rootMotionScene } = await import(fixturePath),
        { Engine } = await import(runtimePath),
        { HeadlessEngine } = await import(headlessPath),
        { scene, id } = await rootMotionScene();
      const engine = await Engine.create(document.querySelector("canvas")),
        headless = await HeadlessEngine.create(scene);
      const check = (ok: boolean, message: string) => {
        if (!ok) throw Error(message);
      };
      try {
        await engine.load(scene);
        engine.play();
        engine.paused = true;
        for (let i = 0; i < 180; i++) engine.fixed.run(engine);
        headless.step(180);
        const a = engine.physics.bodies.get(id).translation(),
          b = headless.physics.bodies.get(id).translation();
        check(Math.abs(a.z - b.z) < 1e-6 && Math.abs(a.y - b.y) < 1e-6, "root controller parity");
        check(a.z > 2.2 && a.z < 2.41, "wall collision");
        check(
          engine.animators.get(id).root.getObjectByName("Bone").position.z === 0,
          "visual compensation",
        );
        const prior = engine.assetCache.budget.snapshot.used,
          document = engine.document,
          bad = structuredClone(scene);
        bad.entities.find((e: { id: string }) => e.id === id).animator.rootMotion.node = "missing";
        let rejected = false;
        try {
          await engine.load(bad);
        } catch {
          rejected = true;
        }
        check(rejected && engine.document === document, "bad binding preserves active world");
        check(
          engine.assetCache.budget.snapshot.used === prior,
          "bad binding releases reservations",
        );
        await engine.stop();
        const baseline = engine.assetCache.budget.snapshot.used;
        for (let i = 0; i < 100; i++) {
          engine.play();
          engine.paused = true;
          engine.fixed.run(engine);
          await engine.stop();
          check(engine.assetCache.budget.snapshot.used === baseline, "root Play/Stop accounting");
        }
        return { wallZ: a.z, headlessZ: b.z, cycles: 100 };
      } finally {
        engine.dispose();
        headless.dispose();
      }
    });
    console.log("PASS root-motion browser/headless/wall/rollback:", JSON.stringify(result));
    await page.goto(base);
  }
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  const { scene } = await rootMotionScene(),
    bytes = await packProject(scene);
  await page.locator('input[accept=".pif,.json"]').setInputFiles({
    name: "Root-motion wall.pif",
    mimeType: "application/x-xz",
    buffer: Buffer.from(bytes),
  });
  await page.getByRole("treeitem").filter({ hasText: "walk.glb" }).click();
  await expect(page.getByRole("button", { name: "Inspect root path", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Inspect root path", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Root motion path" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img")).toBeVisible();
  await page.screenshot({
    path: native ? "build/root-motion-native.png" : "build/root-motion-editor.png",
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Inspect root path", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Play scene", exact: true }).click();
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Stop scene", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
  console.log(
    "PASS " +
      (native ? "Electron" : "browser") +
      " PIF root-motion load, on-demand accessible path dialog and Play/Stop",
  );
} finally {
  await app?.close();
  await browser?.close();
}
