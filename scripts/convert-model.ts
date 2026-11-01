import { IMPORT_BYTES } from "../packages/assets/src/limits";
import { chromium } from "@playwright/test";
import { parseImport, verifyImport, safeName } from "../packages/assets/src/record";
import { parseRecipe, type ImportRecipe } from "../packages/assets/src/recipe";
import type { PreparedImport } from "../packages/assets/src/import";
/** CLI uses the exact browser worker, including ImageBitmap/OffscreenCanvas texture conversion.
 * No network resources or user scripts are executed. Chromium's sandbox is ON by default. */
export async function convertModel(
  paths: string[],
  recipe: ImportRecipe,
  allowUnsandboxed = false,
): Promise<PreparedImport> {
  if (!paths.length || paths.length > 33)
    throw Error("Select one model and at most 32 companion images");
  const files: { name: string; bytes: Uint8Array }[] = [];
  let total = 0;
  for (const path of paths) {
    const file = Bun.file(path);
    total += file.size;
    if (total > IMPORT_BYTES) throw Error("Source budget exceeds 200 MB");
    files.push({ name: safeName(path.split(/[\\/]/).pop()!), bytes: await file.bytes() });
  }
  const compiled = await Bun.build({
    entrypoints: ["packages/assets/src/import.worker.ts"],
    target: "browser",
    format: "esm",
    minify: true,
  });
  if (!compiled.success) throw Error("Converter build failed: " + compiled.logs.join("\n"));
  const worker = await compiled.outputs[0].text();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (
        request.method !== "GET" ||
        url.hostname !== "127.0.0.1" ||
        (request.headers.get("Origin") && request.headers.get("Origin") !== url.origin)
      )
        return new Response("Forbidden", { status: 403 });
      if (url.pathname === "/")
        return new Response("<!doctype html><title>Pinefall offline converter</title>", {
          headers: {
            "Content-Type": "text/html",
            "Content-Security-Policy":
              "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self' blob: data:; img-src blob: data:",
          },
        });
      if (/^\/input\/\d+$/.test(url.pathname)) {
        const file = files[Number(url.pathname.split("/").pop())];
        if (file)
          return new Response(new Uint8Array(file.bytes), {
            headers: { "Content-Type": "application/octet-stream" },
          });
      }
      if (url.pathname === "/converter.js")
        return new Response(worker, { headers: { "Content-Type": "application/javascript" } });
      return new Response("Not found", { status: 404 });
    },
  });
  let browser;
  try {
    if (allowUnsandboxed)
      console.error(
        "WARNING: converter Chromium sandbox explicitly disabled for this invocation. Use only trusted inputs in an isolated test environment.",
      );
    browser = await chromium.launch({ headless: true, chromiumSandbox: !allowUnsandboxed });
    const context = await browser.newContext();
    const origin = `http://127.0.0.1:${server.port}`;
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    const page = await context.newPage();
    await page.goto(origin);
    const result = await page.evaluate(
      async ({ names, recipe }) => {
        const files: { name: string; bytes: Uint8Array }[] = [];
        for (const [i, name] of names.entries())
          files.push({
            name,
            bytes: new Uint8Array(await (await fetch("/input/" + i)).arrayBuffer()),
          });
        return new Promise<PreparedImport>((resolve, reject) => {
          const worker = new Worker("/converter.js", { type: "module" });
          const timer = setTimeout(() => {
            worker.terminate();
            reject(Error("Conversion timed out"));
          }, 120000);
          const done = () => {
            clearTimeout(timer);
            worker.terminate();
          };
          worker.onerror = (e) => {
            done();
            reject(Error(e.message));
          };
          worker.onmessageerror = () => {
            done();
            reject(Error("Invalid worker message"));
          };
          worker.onmessage = (e) => {
            if (e.data.stage) return;
            done();
            if (e.data.error) reject(Error(e.data.error));
            else resolve(e.data);
          };
          worker.postMessage(
            { files, recipe },
            files.map((f) => f.bytes.buffer),
          );
        });
      },
      { names: files.map((f) => f.name), recipe: parseRecipe(recipe) },
    );
    result.metadata = parseImport(result.metadata);
    await verifyImport(result.data, result.metadata);
    return result;
  } finally {
    await browser?.close();
    server.stop(true);
  }
}
