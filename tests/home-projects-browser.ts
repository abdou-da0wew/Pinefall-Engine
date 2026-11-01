import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:5173");
  for (const starter of ["blank", "adventure", "first-person", "driving", "sandbox"]) {
    await page.getByRole("button", { name: "New game", exact: true }).click();
    await page.getByLabel("Game name", { exact: true }).fill("Template " + starter);
    await page.getByLabel("Starting scene", { exact: true }).selectOption(starter);
    await page.getByRole("button", { name: "Create game", exact: true }).click();
    await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
    await expect(page.getByLabel("Game template", { exact: true })).toHaveValue(
      starter === "blank" ? "adventure" : starter,
    );
    await page.getByRole("button", { name: "Back to home", exact: true }).click();
    await expect(page.locator(".pf-home")).toBeVisible();
  }
  await expect(page.locator(".pf-project-card")).toHaveCount(5);
  await page.getByLabel("Search recent projects").fill("no-such-project");
  await expect(page.getByRole("heading", { name: "No matching projects" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.screenshot({ path: "build/ui-home-recent-projects.png", fullPage: true });
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("pinefall-recent-projects-v1", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["metadata", "archives"], "readwrite"),
          r = tx.objectStore("metadata").getAll();
        r.onsuccess = () => {
          const row = r.result.find((r: { name: string }) => r.name === "Template blank");
          tx.objectStore("archives").put(new Uint8Array([1, 2, 3]), row.id);
        };
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
  await page.getByRole("button", { name: /Template blank Open project/ }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await page.locator("canvas").count()).toBe(0);
  await page.getByRole("button", { name: "Remove recent Template blank", exact: true }).click();
  await page.getByRole("button", { name: "Remove snapshot", exact: true }).click();
  await expect(page.locator(".pf-project-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Editor settings", exact: true }).click();
  await page.screenshot({ path: "build/ui-settings.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Editor settings", exact: true })).toBeFocused();
  await page
    .getByLabel("Open project file", { exact: true })
    .setInputFiles("examples/projects/animation-audio-workshop.pif");
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Allow trusted scripts", { exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Back to home", exact: true }).click();
  await expect(page.locator(".pf-home")).toBeVisible();
  await page.getByRole("button", { name: /Animation and audio workshop Open project/ }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Allow trusted scripts", { exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Back to home", exact: true }).click();
  await expect(page.locator(".pf-home")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "build/ui-home-small.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "PASS all five starters, recent search, verified archive corruption rejection, removal, settings focus and small home layout",
  );
} finally {
  await browser.close();
}
