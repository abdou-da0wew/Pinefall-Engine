import { chromium, expect } from "@playwright/test";
import { resolve, sep } from "node:path";
const root = resolve("build/ui-lab-web");
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(request) {
    const path = resolve(
      root,
      "." +
        decodeURIComponent(
          new URL(request.url).pathname === "/" ? "/index.html" : new URL(request.url).pathname,
        ),
    );
    if (path !== root && !path.startsWith(root + sep))
      return new Response("Blocked", { status: 403 });
    return new Response(Bun.file(path === root ? root + "/index.html" : path));
  },
});
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://127.0.0.1:" + server.port);
  await expect(page.locator('[data-ui-id="health-text"]')).toContainText("75");
  await page.getByRole("button", { name: "Trust scripts and play", exact: true }).click();
  await page.locator('[data-ui-id="heal-button"] button').click();
  await expect(page.locator('[data-ui-id="health-text"]')).toContainText("85");
  await page.locator('[data-ui-id="pause-button"] button').click();
  await expect(page.locator('[data-ui-id="pause-button"]')).toContainText("Resume");
  await page.screenshot({ path: "docs/ui-lab-player.png" });
  expect(errors).toEqual([]);
  console.log("PASS exported standalone UI Lab: trust gate, live controls and pause");
} finally {
  await browser.close();
  server.stop(true);
}
