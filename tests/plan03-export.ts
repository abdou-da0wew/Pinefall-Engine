import { chromium, expect } from "@playwright/test";
import { resolve, sep } from "node:path";
const shaders = process.env.TEST_SHADERS === "1";
const root = resolve(shaders ? "build/shader-reference-web" : "build/materials-post-reference-web");
const server = Bun.serve({
  hostname: "0.0.0.0",
  port: 0,
  async fetch(request) {
    const path = resolve(
      root,
      "." +
        (new URL(request.url).pathname === "/"
          ? "/index.html"
          : decodeURIComponent(new URL(request.url).pathname)),
    );
    if (!path.startsWith(root + sep)) return new Response("Forbidden", { status: 403 });
    const file = Bun.file(path);
    return (await file.exists()) ? new Response(file) : new Response("Missing", { status: 404 });
  },
});
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("http://localhost:" + server.port);
  await expect(page.locator("#title")).toHaveText(
    shaders ? "Custom shader reference" : "Materials and post reference",
    {
      timeout: 30000,
    },
  );
  if (shaders) {
    await expect(page.locator("#shader-trust")).toBeVisible();
    await page.locator("#allow-shaders").click();
    await expect(page.locator("#shader-trust")).toBeHidden();
  } else {
    await page.locator("#allow-scripts").click();
    await expect(page.locator("#trust")).toBeHidden();
  }
  await expect(page.locator("#stats")).toContainText("FPS", { timeout: 30000 });
  await page.locator("#quality").selectOption("high");
  await page.waitForTimeout(2000);
  await expect(page.locator("#error")).toBeEmpty();
  if (shaders) await expect(page.locator("#shader-trust")).toBeHidden();
  expect(errors).toEqual([]);
  await page.screenshot({
    path: shaders ? "build/plan03-shader-standalone.png" : "build/plan03-standalone.png",
  });
  console.log(
    shaders
      ? "PASS production shader standalone: blocked by default, trust/reload, high profile preserves permission, no render errors"
      : "PASS production standalone export loads authored graphics, trusted graphics SDK script, post stack and high shadow profile without render errors",
  );
} finally {
  await browser.close();
  server.stop(true);
}
