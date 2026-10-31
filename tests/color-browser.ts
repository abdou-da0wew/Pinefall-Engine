import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 760 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:5173");
  await page.waitForFunction(
    () => !(document.querySelector('[aria-label="Play scene"]') as HTMLButtonElement)?.disabled,
  );
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByLabel("Game name", { exact: true }).fill("Color Workshop");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await page.getByRole("treeitem").filter({ hasText: "Ground" }).click();
  const trigger = page.getByRole("button", { name: "Material color", exact: true });
  const original = await trigger.textContent();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Material color", exact: true });
  async function bounds() {
    const box = await page.locator(".color-popover").boundingBox();
    const v = page.viewportSize()!;
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(7);
    expect(box!.y).toBeGreaterThanOrEqual(7);
    expect(box!.x + box!.width).toBeLessThanOrEqual(v.width - 7);
    expect(box!.y + box!.height).toBeLessThanOrEqual(v.height - 7);
  }
  await bounds();
  expect(await page.locator("input[type=color]").count()).toBe(0);
  await page.getByLabel("Hex color", { exact: true }).fill("#ff2200");
  await expect(trigger).toHaveText(original!);
  await page.getByRole("button", { name: "Apply color", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toContainText("#FF2200");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(trigger).toHaveText(original!);
  await trigger.click();
  await page.getByLabel("Color R", { exact: true }).fill("300");
  await expect(page.getByRole("button", { name: "Apply color", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(trigger).toHaveText(original!);
  await trigger.click();
  await page.getByRole("button", { name: "Use #c4cfa4", exact: true }).click();
  await page.getByRole("slider", { name: "Saturation and brightness" }).press("ArrowLeft");
  await bounds();
  await page.setViewportSize({ width: 1050, height: 580 });
  await expect
    .poll(async () =>
      page.locator(".color-popover").evaluate((node) => {
        const r = node.getBoundingClientRect();
        return (
          r.left >= 7 && r.top >= 7 && r.right <= innerWidth - 7 && r.bottom <= innerHeight - 7
        );
      }),
    )
    .toBe(true);
  await bounds();
  await page.getByLabel("Hex color", { exact: true }).press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".asset-card").filter({ hasText: "Spot light" }).click();
  await page.getByRole("button", { name: "Light color", exact: true }).click();
  await bounds();
  await page.getByLabel("Hex color", { exact: true }).fill("#abc");
  await page.getByRole("button", { name: "Apply color", exact: true }).click();
  await expect(page.getByRole("button", { name: "Light color", exact: true })).toContainText(
    "#AABBCC",
  );
  await page.getByRole("button", { name: "Light color", exact: true }).click();
  await bounds();
  await page.screenshot({ path: "docs/color-picker.png" });
  await page.getByRole("button", { name: "Close color picker", exact: true }).click();
  expect(errors).toEqual([]);
  console.log(
    "PASS custom material/light picker: edge bounds, resize, hex/RGB validation, swatches, keyboard, cancel and one-step undo",
  );
} finally {
  await browser.close();
}
