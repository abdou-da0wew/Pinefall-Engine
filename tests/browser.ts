import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:5173");
await page.getByRole("button", { name: "Play scene", exact: true }).waitFor();
await page.waitForFunction(
  () => !(document.querySelector('[aria-label="Play scene"]') as HTMLButtonElement)?.disabled,
);
await page.screenshot({ path: "docs/editor.png" });
for (const template of ["adventure", "first-person", "driving", "sandbox"]) {
  await page.getByLabel("Game template").selectOption(template);
  await page.getByRole("button", { name: "Play scene", exact: true }).click();
  await page.waitForTimeout(800);
  if (template === "sandbox")
    await page.getByRole("button", { name: "Spawn crate", exact: true }).click();
  await page.getByRole("button", { name: "Stop scene", exact: true }).click();
}
await page.getByRole("button", { name: "Rendering", exact: true }).click();
await page.getByRole("button", { name: "HIGH / FX", exact: true }).click();
await page.waitForTimeout(1000);
await page.goto("http://localhost:5173/game.html?template=adventure");
await page.waitForFunction(() =>
  document.querySelector("#score")?.textContent?.includes("signals"),
);
await page.keyboard.press("KeyW");
await page.screenshot({ path: "docs/player.png" });
await browser.close();
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "PASS editor four-template play/stop, sandbox spawn, high FX, standalone; browser page errors: 0. SwiftShader only.",
);
