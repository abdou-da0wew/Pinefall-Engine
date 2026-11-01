import { enterEditor, newEditorGame } from "./editor-navigation";
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
  await enterEditor(page);
  await page.waitForFunction(
    () => !(document.querySelector('[aria-label="Play scene"]') as HTMLButtonElement)?.disabled,
  );
  await newEditorGame(page);
  await page.getByLabel("Game name", { exact: true }).fill("Script Workshop");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await page.getByRole("button", { name: "Scripts", exact: true }).click();
  const importSource = async (source: string) => {
    await page
      .locator('input[accept=".ts"]')
      .setInputFiles({
        name: "CustomScript.ts",
        mimeType: "text/plain",
        buffer: Buffer.from(source),
      });
  };
  await importSource(
    `import {Script} from '@pinefall/sdk'; export const defaults={speed:2}; export default class Test extends Script {start(){this.ctx.log('script-browser-ok');} update(dt:number){this.ctx.object.rotation.y+=Number(this.ctx.props.speed)*dt;}}`,
  );
  expect(await page.getByLabel("TypeScript source").count()).toBe(0);
  await page.locator(".entity-row").filter({ hasText: "Player" }).click();
  await page
    .getByLabel("Attach script", { exact: true })
    .selectOption({ label: "CustomScript.ts" });
  await page.getByRole("button", { name: "Play scene", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop scene", exact: true })).toHaveCount(0);
  await page.getByLabel("Allow trusted scripts", { exact: true }).check();
  await page.getByRole("button", { name: "Play scene", exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Stop scene", exact: true }).click();
  await page.getByRole("button", { name: /Console \(/ }).click();
  await expect(page.locator(".console")).toContainText("script-browser-ok");
  await page.getByRole("button", { name: "Scripts", exact: true }).click();
  await page.screenshot({ path: "build/external-script-panel.png" });
  await importSource(
    `import {Script} from '@pinefall/sdk'; export default class Test extends Script {start(){this.ctx.log('changed');}}`,
  );
  await expect(page.getByLabel("Allow trusted scripts", { exact: true })).not.toBeChecked();
  // Reloaded scenes retain source/attachments but never retain permission.
  await page.waitForTimeout(600);
  await page.reload();
  await enterEditor(page);
  await page.waitForFunction(
    () => !(document.querySelector('[aria-label="Play scene"]') as HTMLButtonElement)?.disabled,
  );
  await expect(page.getByLabel("Allow trusted scripts", { exact: true })).not.toBeChecked();
  expect(errors).toEqual([]);
  await page.goto("http://localhost:5173/build/script-lab-web/index.html");
  await expect(page.getByRole("button", { name: "Trust scripts and play" })).toBeVisible();
  await page.waitForTimeout(700);
  const before = await page.locator("#stats").textContent();
  await page.getByRole("button", { name: "Trust scripts and play" }).click();
  await page.waitForTimeout(3200);
  await expect(page.locator("#trust")).toBeHidden();
  await expect(page.locator("#error")).toBeEmpty();
  const after = await page.locator("#stats").textContent();
  const draws = (value: string | null) => Number(value?.match(/(\d+) draws/)?.[1] || 0);
  expect(draws(after)).toBeGreaterThan(draws(before));
  await page.screenshot({ path: "build/external-script-player.png" });
  expect(errors).toEqual([]);
  console.log(
    "PASS external-file import/update/attach script, trust gate, real execution, source-change and reload revoke trust; exported player scripts spawn geometry; no page errors",
  );
} finally {
  await browser.close();
}
