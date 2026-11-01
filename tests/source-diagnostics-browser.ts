import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5173/tests/runtime.html", { waitUntil: "networkidle" });
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const { SourceDiagnostics } = await load("/packages/scripting/src/diagnostics-client.ts");
    const { assetMemory } = await load("/packages/assets/src/budget.ts");
    const checker = new SourceDiagnostics();
    const baseline = assetMemory.snapshot.used;
    try {
      const errors = await checker.check(
        [
          {
            id: "main",
            name: "Main.ts",
            source: `import {Script} from '@pinefall/sdk';
export default class Main extends Script {
  start() {
    this.ctx.graphics.setPost({bloom: 'wrong'});
    this.ctx.object.rotation.y = 'wrong';
  }
}`,
          },
        ],
        { "script:main": "scripts/Main.ts" },
      );
      const valid = await checker.check(
        [
          {
            id: "main",
            name: "Main.ts",
            source: `import {Script} from '@pinefall/sdk';
export default class Main extends Script { start() { this.ctx.graphics.setPost({bloom:true}); this.ctx.object.rotation.y = 1; } }`,
          },
        ],
        { "script:main": "scripts/Main.ts" },
      );
      const cancelled = new AbortController();
      cancelled.abort();
      let aborted = false;
      try {
        await checker.check([], {}, cancelled.signal);
      } catch {
        aborted = true;
      }
      checker.dispose();
      return { errors, valid, aborted, released: assetMemory.snapshot.used === baseline };
    } finally {
      checker.dispose();
    }
  });
  expect(result.errors.some((d: { line: number }) => d.line === 4)).toBe(true);
  expect(result.errors.some((d: { line: number }) => d.line === 5)).toBe(true);
  expect(result.errors.every((d: { file: string }) => d.file === "scripts/Main.ts")).toBe(true);
  expect(result.valid).toEqual([]);
  expect(result.aborted).toBe(true);
  expect(result.released).toBe(true);
  console.log(
    "PASS semantic SDK/Three diagnostics, actual source positions, incremental repair, cancellation and cleanup",
    JSON.stringify(result.errors),
  );
} finally {
  await browser.close();
}
