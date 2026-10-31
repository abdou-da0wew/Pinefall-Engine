import { _electron, expect } from "@playwright/test";
const app = await _electron.launch({
  executablePath:
    process.env.TEST_DESKTOP_EXECUTABLE ||
    `${process.cwd()}/build/releases/linux-unpacked/pinefall-engine`,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  timeout: 30000,
});
try {
  const page = await app.firstWindow();
  await page.waitForFunction(
    () => !(document.querySelector('[aria-label="Play scene"]') as HTMLButtonElement)?.disabled,
  );
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByLabel("Game name", { exact: true }).fill("Desktop Color Test");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await page.getByRole("treeitem").filter({ hasText: "Ground" }).click();
  await page.getByRole("button", { name: "Material color", exact: true }).click();
  const fits = await page.locator(".color-popover").evaluate((node) => {
    const r = node.getBoundingClientRect();
    return r.left >= 8 && r.top >= 8 && r.right <= innerWidth - 7 && r.bottom <= innerHeight - 7;
  });
  expect(fits).toBe(true);
  await page.getByLabel("Hex color", { exact: true }).fill("#d8d1a7");
  await page.getByRole("button", { name: "Apply color", exact: true }).click();
  await expect(page.getByRole("button", { name: "Material color", exact: true })).toContainText(
    "#D8D1A7",
  );
  expect(await page.locator("input[type=color]").count()).toBe(0);
  console.log("PASS packaged Linux custom picker bounds and material edit; no native color input");
} finally {
  await app.close();
}
