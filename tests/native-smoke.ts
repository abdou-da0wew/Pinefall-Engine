import { _electron } from "@playwright/test";
const app = await _electron.launch({
  executablePath:
    process.env.TEST_DESKTOP_EXECUTABLE ||
    `${process.cwd()}/build/releases/linux-unpacked/pinefall-engine`,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  timeout: 30000,
});
try {
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "Play scene", exact: true }).waitFor();
  await page.waitForFunction(
    () => !(document.querySelector('[aria-label="Play scene"]') as HTMLButtonElement)?.disabled,
  );
  await page.getByRole("button", { name: "Play scene", exact: true }).click();
  await page.getByRole("button", { name: "Stop scene", exact: true }).click();
  console.log("PASS packaged Linux editor start/play/stop; SwiftShader test flags only");
} finally {
  await app.close();
}
