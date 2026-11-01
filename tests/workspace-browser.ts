import { enterEditor, newEditorGame } from "./editor-navigation";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:5173");
  await enterEditor(page);
  await page.waitForFunction(
    () => !(document.querySelector('[aria-label="Play scene"]') as HTMLButtonElement)?.disabled,
  );
  await newEditorGame(page);
  await page.getByLabel("Game name", { exact: true }).fill("Outliner Workshop");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await page.getByRole("treeitem").filter({ hasText: "Player" }).click();
  await page.getByRole("button", { name: "New collection", exact: true }).click();
  await page.getByLabel("Rename item", { exact: true }).fill("Actors");
  await page.getByLabel("Rename item", { exact: true }).press("Enter");
  await expect(page.getByRole("treeitem").filter({ hasText: "Player" })).toHaveAttribute(
    "aria-level",
    "2",
  );
  await page.getByRole("button", { name: "Collapse Actors", exact: true }).click();
  await expect(page.getByRole("treeitem").filter({ hasText: "Player" })).toHaveCount(0);
  await page.getByLabel("Search entities").fill("Player");
  await expect(page.getByRole("treeitem").filter({ hasText: "Player" })).toHaveCount(1);
  await page.getByLabel("Search entities").fill("");
  await page.getByRole("button", { name: "Expand Actors", exact: true }).click();
  await page
    .getByRole("treeitem")
    .filter({ hasText: "Ground" })
    .dragTo(page.getByRole("treeitem").filter({ hasText: "Actors" }));
  await expect(page.getByRole("treeitem").filter({ hasText: "Ground" })).toHaveAttribute(
    "aria-level",
    "2",
  );
  const handle = page.getByRole("separator", { name: "Resize left panel" });
  const before = (await page.locator(".hierarchy").boundingBox())!.width;
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 3, box.y + 90);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 90, { steps: 8 });
  await page.mouse.up();
  const after = (await page.locator(".hierarchy").boundingBox())!.width;
  expect(after).toBeGreaterThan(before + 40);
  await page
    .getByRole("button", { name: "Drag shelf to dock" })
    .dragTo(page.locator(".inspector"), { targetPosition: { x: 100, y: 100 } });
  await expect(page.locator(".workbench")).toHaveClass(/dock-right/);
  await page.getByLabel("Workspace layout", { exact: true }).selectOption("right");
  await expect(page.locator(".workbench")).toHaveClass(/dock-right/);
  await page.getByLabel("Workspace layout", { exact: true }).selectOption("focus");
  await expect(page.locator(".hierarchy")).toBeHidden();
  await page.getByLabel("Workspace layout", { exact: true }).selectOption("balanced");
  await expect(page.locator(".hierarchy")).toBeVisible();
  await page.getByRole("button", { name: "Toggle viewport focus" }).click();
  await expect(page.locator(".hierarchy")).toBeHidden();
  await page.getByRole("button", { name: "Toggle viewport focus" }).click();
  await page.waitForTimeout(600);
  await page.reload();
  await enterEditor(page);
  await page.waitForFunction(
    () => !(document.querySelector('[aria-label="Play scene"]') as HTMLButtonElement)?.disabled,
  );
  await expect(page.getByRole("treeitem").filter({ hasText: "Player" })).toHaveAttribute(
    "aria-level",
    "2",
  );
  // Real transform parenting, keyboard renaming/duplication, and persisted panel sizing.
  await page.locator(".asset-card").filter({ hasText: "box" }).first().click();
  await page.getByRole("treeitem", { selected: true }).press("F2");
  await page.getByLabel("Rename item", { exact: true }).fill("Parent prop");
  await page.getByLabel("Rename item", { exact: true }).press("Enter");
  await page.locator(".asset-card").filter({ hasText: "box" }).first().click();
  await page.getByRole("treeitem", { selected: true }).press("F2");
  await page.getByLabel("Rename item", { exact: true }).fill("Child prop");
  await page.getByLabel("Rename item", { exact: true }).press("Enter");
  await page
    .getByRole("treeitem")
    .filter({ hasText: "Child prop" })
    .dragTo(page.getByRole("treeitem").filter({ hasText: "Parent prop" }));
  await expect(page.getByRole("treeitem").filter({ hasText: "Child prop" })).toHaveAttribute(
    "aria-level",
    "2",
  );
  await page
    .getByRole("treeitem")
    .filter({ hasText: "Player" })
    .dragTo(page.getByRole("treeitem").filter({ hasText: "Parent prop" }));
  await expect(page.locator(".statusbar")).toContainText(
    "Physics bodies must stay transform roots",
  );
  await page.getByRole("treeitem").filter({ hasText: "Parent prop" }).click();
  await page.getByRole("treeitem").filter({ hasText: "Parent prop" }).press("Control+d");
  await expect(page.getByRole("treeitem").filter({ hasText: "Child prop copy" })).toHaveCount(1);
  await page.getByRole("separator", { name: "Resize left panel" }).press("ArrowRight");
  const savedWidth = (await page.locator(".hierarchy").boundingBox())!.width;
  await page.getByRole("button", { name: "Collapse Actors", exact: true }).click();
  await page.waitForTimeout(500);
  await page.reload();
  await enterEditor(page);
  await page.waitForFunction(
    () => !(document.querySelector('[aria-label="Play scene"]') as HTMLButtonElement)?.disabled,
  );
  expect((await page.locator(".hierarchy").boundingBox())!.width).toBeCloseTo(savedWidth, 0);
  await expect(page.getByRole("treeitem").filter({ hasText: "Player" })).toHaveCount(0);
  await page.getByRole("button", { name: "Expand Actors", exact: true }).click();
  expect(await page.locator(".hierarchy svg").count()).toBeGreaterThan(5);
  await page.screenshot({ path: "docs/workspace-0.4.png" });
  expect(errors).toEqual([]);
  console.log(
    "PASS Phosphor SVGs, collection grouping/rename/collapse/search/drop, resize, dock/focus/restore, scene roundtrip",
  );
} finally {
  await browser.close();
}
