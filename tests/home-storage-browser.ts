import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByLabel("Game name", { exact: true }).fill("Keep my work");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.getByRole("treeitem").filter({ hasText: "Ground" }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/pif.worker.ts*",
    async (route) => {
      await gate;
      await route.continue();
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Back to home", exact: true }).click();
  await page.getByLabel("Entity name", { exact: true }).fill("Edited during snapshot");
  await page.getByLabel("Entity name", { exact: true }).blur();
  release();
  const conflict = page.getByRole("dialog", { name: "Project stayed open", exact: true });
  await expect(conflict).toBeVisible();
  await expect(conflict.getByRole("alert")).toContainText("Project changed");
  await conflict.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByLabel("Entity name", { exact: true })).toHaveValue(
    "Edited during snapshot",
  );
  await page.evaluate(() => {
    const original = IDBFactory.prototype.open;
    Reflect.set(window, "restoreRecentStorage", () => (IDBFactory.prototype.open = original));
    IDBFactory.prototype.open = function (name, version) {
      if (name === "pinefall-recent-projects-v1")
        throw new DOMException("Injected storage quota failure", "QuotaExceededError");
      return original.call(this, name, version);
    };
  });
  await page.getByRole("button", { name: "Back to home", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Project stayed open", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("quota");
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.evaluate(() => Reflect.get(window, "restoreRecentStorage")());
  await page.getByRole("button", { name: "Back to home", exact: true }).click();
  await expect(page.locator(".pf-home")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keep my work", exact: true })).toBeVisible();
  console.log(
    "PASS concurrent-edit guard and injected recent-storage failure retain the project and recover safely",
  );
} finally {
  await browser.close();
}
