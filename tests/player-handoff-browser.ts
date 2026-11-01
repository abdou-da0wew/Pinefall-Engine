import { chromium, _electron, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
const native = process.env.TEST_NATIVE === "1",
  profile = native ? await mkdtemp(resolve("build/preview-profile-")) : undefined;
const app = native
  ? await _electron.launch({
      executablePath: process.env.TEST_DESKTOP_EXECUTABLE,
      args: [
        ...(process.env.TEST_DESKTOP_EXECUTABLE ? [] : ["."]),
        `--user-data-dir=${profile}`,
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
      cwd: process.cwd(),
    })
  : undefined;
const browser = native
  ? undefined
  : await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
try {
  const page = app ? await app.firstWindow() : await browser!.newPage(),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  if (!app) await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByLabel("Game name", { exact: true }).fill("My actual authored game");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "box PRIMITIVE · ADD", exact: true }).click();
  await page.getByLabel("Entity name", { exact: true }).fill("Persist this custom actor");
  await page.getByLabel("Entity name", { exact: true }).blur();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Player", exact: true }).click();
  await expect(page.locator("#title")).toHaveText("My actual authored game");
  await expect(page.locator("#error")).toHaveText("");
  await expect(page.locator("#stats")).toContainText("draws");
  await expect(page.locator("#return-editor")).toBeVisible();
  await page.screenshot({ path: "build/" + (native ? "native-" : "") + "authored-player.png" });
  await page.getByRole("button", { name: "Return to editor", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await expect(
    page.getByRole("treeitem").filter({ hasText: "Persist this custom actor" }),
  ).toBeVisible();
  await expect(page.locator(".project-path")).toContainText("My actual authored game");
  await expect(page).not.toHaveURL(/recent=/);
  expect(errors).toEqual([]);
  console.log(
    "PASS " +
      (native ? "Electron" : "browser") +
      " current-project standalone handoff and exact authored return; no template substitution or popup window",
  );
} finally {
  await browser?.close();
  await app?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
}
