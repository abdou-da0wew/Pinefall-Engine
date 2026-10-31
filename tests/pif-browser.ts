import { chromium, expect } from "@playwright/test";
import { unpackProject, packProject } from "../packages/project/src/pif";
import { parseScene } from "../packages/runtime/src/schema";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(process.env.TEST_URL || "http://localhost:5173");
  await page.waitForFunction(
    () => !(document.querySelector('[aria-label="Play scene"]') as HTMLButtonElement)?.disabled,
  );
  const sample = parseScene(await Bun.file("examples/projects/ui-lab.scene.json").json());
  const bytes = await packProject(sample);
  await page.locator('input[accept=".pif,.json"]').setInputFiles({
    name: "UI Lab.pif",
    mimeType: "application/x-xz",
    buffer: Buffer.from(bytes),
  });
  await expect(page.getByLabel("Allow trusted scripts", { exact: true })).not.toBeChecked();
  await expect(page.locator('[data-ui-id="health-text"]')).toContainText("75");
  await page.getByLabel("Allow trusted scripts", { exact: true }).check();
  const wait = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const download = await wait;
  expect(download.suggestedFilename()).toBe("UI Lab.pif");
  await download.saveAs("build/browser-project.pif");
  expect(await unpackProject(await Bun.file("build/browser-project.pif").bytes())).toMatchObject({
    ...sample,
  });
  await page
    .locator('input[accept=".pif,.json"]')
    .setInputFiles({ name: "same.pif", mimeType: "application/x-xz", buffer: Buffer.from(bytes) });
  await expect(page.getByLabel("Allow trusted scripts", { exact: true })).not.toBeChecked();
  // Hold this worker's module request so cancellation is deterministic even when a tiny warm PIF completes in one frame.
  await page.route(
    "**/pif.worker.ts*",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue().catch(() => {});
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.getByRole("button", { name: "Cancel project operation", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("cancelled");
  await expect(page.getByRole("button", { name: "Save project", exact: true })).toBeEnabled();
  await page
    .locator('input[accept=".pif,.json"]')
    .setInputFiles({ name: "bad.pif", mimeType: "application/x-xz", buffer: Buffer.from("{}") });
  await expect(page.locator(".statusbar")).toContainText("Expected an XZ");
  await expect(page.locator('[data-ui-id="health-text"]')).toContainText("75");
  expect(errors).toEqual([]);
  console.log(
    "PASS PIF worker open/save, Ctrl+S, trust revocation, cancellation and corrupt-file recovery",
  );
} finally {
  await browser.close();
}
