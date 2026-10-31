import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5173/tests/runtime.html");
  const result = await page.evaluate(async () => {
    const runtimePath = "/packages/runtime/src/index.ts",
      templatePath = "/examples/templates.ts";
    const { Engine } = await import(runtimePath),
      { createTemplate } = await import(templatePath);
    const engine = await Engine.create(document.querySelector("canvas"));
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const check = (ok: boolean, message: string) => {
      if (!ok) throw Error(message);
    };
    try {
      await engine.load(createTemplate("sandbox"));
      const count = engine.document.entities.length;
      engine.play();
      engine.spawnBox();
      check(engine.document.entities.length === count, "spawn queued until boundary");
      await wait(200);
      check(engine.document.entities.length === count + 1, "spawn admitted");
      await engine.stop();
      check(engine.document.entities.length === count, "stop restores authored count");
      await engine.load(createTemplate("adventure"));
      engine.setCameraRig("orbit");
      engine.play();
      check(engine.orbit.enabled, "orbit override");
      engine.setCameraRig("first-person");
      check(!engine.orbit.enabled, "first person disables orbit");
      await wait(150);
      check(engine.cameraRig === "first-person", "camera override retained");
      await engine.stop();
      const scene = createTemplate("adventure");
      const actor = scene.entities.find((e: { tag?: string }) => e.tag === "player");
      engine.setCameraRig("auto");
      await engine.load(scene);
      engine.play();
      const before = engine.physics.bodies.get(actor.id).translation().z;
      engine.input.add("KeyW");
      await wait(1000);
      engine.input.clear();
      check(
        engine.physics.bodies.get(actor.id).translation().z < before - 0.2,
        "actual character movement",
      );
      await engine.stop();
      let errors = 0;
      engine.events.subscribe((e: { type: string; message: string }) => {
        if (e.type === "error" && e.message.includes("Behavior disabled")) errors++;
      });
      engine.registerBehavior("broken", () => ({
        update() {
          throw Error("intentional test failure");
        },
      }));
      actor.behavior = "broken";
      await engine.load(scene);
      engine.play();
      await wait(700);
      check(errors === 1, "one isolated script failure");
      check(engine.playing, "engine still running");
      return "PASS: spawn/stop restoration, camera overrides, character movement, custom-script isolation";
    } finally {
      engine.dispose();
    }
  });
  console.log(result);
} finally {
  await browser.close();
}
