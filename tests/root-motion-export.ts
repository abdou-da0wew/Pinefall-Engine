import { resolve, sep } from "node:path";
import { chromium, expect } from "@playwright/test";
const directory = resolve("build/root-motion-export");
const server = Bun.serve({
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
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  },
});
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:" + server.port);
  await expect(page.locator("#title")).toHaveText("Root-motion wall");
  await page.waitForTimeout(3500);
  await expect(page.locator("#error")).toBeEmpty();
  await expect(page.locator("#stats")).toContainText("FPS");
  expect(errors).toEqual([]);
  await page.screenshot({ path: "build/root-motion-export.png" });
  console.log(
    "PASS standalone exported root-motion scene load, worker assets and running renderer",
  );
} finally {
  await browser.close();
  await server.stop(true);
}
