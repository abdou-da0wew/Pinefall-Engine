import { expect, type Page } from "@playwright/test";
/** Exercise the real home-to-editor route, rather than bypassing the new home shell. */
export async function enterEditor(page: Page) {
  await page.locator(".pf-home,.workbench").waitFor();
  if (await page.locator(".pf-home").isVisible())
    await page.getByRole("button", { name: /Open demo editor|Continue last workspace/ }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
}
export async function newEditorGame(page: Page) {
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("menuitem", { name: "New game", exact: true }).click();
}

export async function openAssetActions(page: Page) {
  if (await page.getByRole("dialog", { name: "Asset actions", exact: true }).isVisible()) return;
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  await page.getByRole("menuitem", { name: "More asset actions…", exact: true }).click();
}
export async function openImportSettings(page: Page) {
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  await page.getByRole("menuitem", { name: "Import settings", exact: true }).click();
}
