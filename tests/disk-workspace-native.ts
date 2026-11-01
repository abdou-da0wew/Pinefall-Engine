import { _electron, expect } from "@playwright/test";
import { mkdtemp, rm, writeFile, rename, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
const profile = await mkdtemp(resolve("build/disk-native-profile-"));
const root = await mkdtemp(resolve("build/disk-native-project-"));
const app = await _electron.launch({
  args: [
    ".",
    `--user-data-dir=${profile}`,
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
  cwd: process.cwd(),
});
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.engineDesktop?.workspace);
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, root);
  const grant = await page.evaluate(async () => {
    const api = window.engineDesktop!.workspace;
    const grant = await api.choose();
    if (!grant) throw Error("Missing disk grant");
    const bytes = new TextEncoder().encode("export const value = 1;");
    const hash = await api.write(grant.id, "scripts/Player.ts", bytes, null);
    const read = await api.read(grant.id, "scripts/Player.ts", 0, 100);
    if (new TextDecoder().decode(read.bytes) !== "export const value = 1;")
      throw Error("Native read mismatch");
    const url = `pinefall-project://${grant.id}/scripts/Player.ts`;
    const fromProtocol = await (await fetch(url)).text();
    if (fromProtocol !== "export const value = 1;")
      throw Error("Native streaming protocol mismatch");
    let traversal = false,
      invalidSession = false;
    try {
      await api.read(grant.id, "../secret", 0, 100);
    } catch {
      traversal = true;
    }
    try {
      await api.inventory("not-a-grant");
    } catch {
      invalidSession = true;
    }
    if (!traversal || !invalidSession) throw Error("Filesystem capability boundary failed");
    return { ...grant, hash };
  });
  expect(grant.root).toBe(root);
  expect(await readFile(join(root, "scripts/Player.ts"), "utf8")).toContain("value = 1");
  const changed = page.evaluate(
    (id) =>
      new Promise<string[]>((resolve, reject) => {
        const api = window.engineDesktop!.workspace;
        const timer = setTimeout(() => {
          off();
          reject(Error("Watch deadline"));
        }, 10000);
        const off = api.onChanged((event) => {
          if (event.id === id && event.paths.includes("scripts/Player.ts")) {
            clearTimeout(timer);
            off();
            resolve(event.paths);
          }
        });
      }),
    grant.id,
  );
  await writeFile(join(root, "scripts/.external-editor-save"), "export const value = 2;");
  await rename(join(root, "scripts/.external-editor-save"), join(root, "scripts/Player.ts"));
  expect(await changed).toContain("scripts/Player.ts");
  await page.evaluate(async ({ id, hash }) => {
    const api = window.engineDesktop!.workspace;
    let conflict = false;
    try {
      await api.write(id, "scripts/Player.ts", new TextEncoder().encode("stale"), hash);
    } catch {
      conflict = true;
    }
    if (!conflict) throw Error("External edit overwritten");
    await api.close(id);
    let closed = false;
    try {
      await api.inventory(id);
    } catch {
      closed = true;
    }
    if (!closed) throw Error("Closed grant remained usable");
  }, grant);
  expect(await readFile(join(root, "scripts/Player.ts"), "utf8")).toContain("value = 2");
  console.log(
    "PASS native disk bridge: explicit folder grant, bounded read/write, external atomic-save watch, conflict protection, root/session confinement and shutdown",
  );
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
}
