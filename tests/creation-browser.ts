import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:5173");
  await page.waitForFunction(
    () => !(document.querySelector('[aria-label="Play scene"]') as HTMLButtonElement)?.disabled,
  );
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByLabel("Game name", { exact: true }).fill("Asset Workshop Test");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await expect(page.locator(".scene-caption h1")).toHaveText("Asset Workshop Test");
  await page
    .locator('input[type=file][accept=".glb"]')
    .setInputFiles("examples/projects/signal-crystal.glb");
  await expect(page.getByLabel("Entity name", { exact: true })).toHaveValue("signal-crystal.glb");
  await expect(page.getByLabel("Library model", { exact: true })).not.toHaveValue("");
  await page.getByRole("button", { name: "Play scene", exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Stop scene", exact: true }).click();
  await page.screenshot({ path: "docs/creation-workflow.png" });
  await page.goto("http://localhost:5173/build/beacon-run-web/index.html");
  await expect(page.locator("#title")).toHaveText("Beacon Run");
  await expect(page.locator("#score")).toHaveText("0 / 3 signals");
  await page.waitForTimeout(700);
  await page.screenshot({ path: "docs/beacon-run.png" });
  expect(errors).toEqual([]);
  console.log(
    "PASS new game, imported GLB selection, play/stop, exported standalone game with custom scene",
  );
} finally {
  await browser.close();
}
