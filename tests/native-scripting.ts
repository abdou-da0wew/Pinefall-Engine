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
  await page
    .locator('input[type=file][accept=".pif,.json"]')
    .first()
    .setInputFiles("examples/projects/script-lab.scene.json");
  await expect(page.getByLabel("Allow trusted scripts")).not.toBeChecked();
  await page.getByRole("button", { name: "Play scene", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop scene", exact: true })).toHaveCount(0);
  await page.getByLabel("Allow trusted scripts").check();
  await page.getByRole("button", { name: "Play scene", exact: true }).click();
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector(".viewport-stats")?.textContent?.match(/(\d+) bodies/)?.[1] || 0,
      ) > 3,
  );
  await page.getByRole("button", { name: "Stop scene", exact: true }).click();
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector(".viewport-stats")?.textContent?.match(/(\d+) bodies/)?.[1] || 0,
      ) === 3,
  );
  console.log(
    "PASS packaged Linux script import, trust gate, actual script physics spawn, stop restores authored bodies (SwiftShader)",
  );
} finally {
  await app.close();
}
