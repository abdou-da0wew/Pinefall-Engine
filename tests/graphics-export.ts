import { chromium, expect } from "@playwright/test";
import { resolve, sep } from "node:path";
const directory = resolve("build/graphics-export");
const server = Bun.serve({
  hostname: "0.0.0.0",
  port: 0,
  async fetch(request) {
    const name = new URL(request.url).pathname,
      path = resolve(directory, "." + decodeURIComponent(name === "/" ? "/index.html" : name));
    if (!path.startsWith(directory + sep)) return new Response("Forbidden", { status: 403 });
    const file = Bun.file(path);
    return (await file.exists()) ? new Response(file) : new Response("Missing", { status: 404 });
  },
});
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } }),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript(() => {
    const counts = { bitmap: 0, half: 0, draws: 0 };
    Reflect.set(window, "graphicsCounts", counts);
    const proto = WebGL2RenderingContext.prototype,
      draw = proto.drawElements;
    for (const name of ["texImage2D", "texSubImage2D"]) {
      const upload = Reflect.get(proto, name);
      Reflect.set(proto, name, function (this: WebGL2RenderingContext, ...args: unknown[]) {
        for (const value of args) {
          if (value instanceof ImageBitmap) counts.bitmap++;
          if (value instanceof Uint16Array) counts.half++;
        }
        Reflect.apply(upload, this, args);
      });
    }
    proto.drawElements = function (...args: Parameters<typeof draw>) {
      counts.draws++;
      Reflect.apply(draw, this, args);
    };
  });
  await page.goto("http://localhost:" + server.port);
  await expect(page.locator("#title")).toHaveText("Materials and post reference", {
    timeout: 30000,
  });
  await page.locator("#allow-scripts").click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "graphicsCounts").draws), {
      timeout: 30000,
    })
    .toBeGreaterThan(10);
  const counts = await page.evaluate(() => Reflect.get(window, "graphicsCounts"));
  expect(counts.bitmap).toBeGreaterThan(0);
  expect(counts.half).toBeGreaterThan(0);
  await expect(page.locator("#error")).toBeEmpty();
  expect(errors).toEqual([]);
  await page.screenshot({ path: "build/graphics-export.png" });
  console.log(
    "PASS production standalone maps/HDR/scattering reference, actual bitmap/half-float uploads and GPU draws: " +
      JSON.stringify(counts),
  );
} finally {
  await browser.close();
  await server.stop(true);
}
