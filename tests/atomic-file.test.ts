import { test, expect } from "bun:test";
import { mkdtemp, readFile, readdir, mkdir, rm } from "node:fs/promises";
import { atomicWrite } from "../packages/project/src/atomic-file";
test("atomic project replacement keeps previous data on cancellation and cleans failed staging files", async () => {
  await mkdir("build", { recursive: true });
  const dir = await mkdtemp("build/atomic-"),
    path = dir + "/project.pif";
  try {
    await atomicWrite(path, "old");
    const controller = new AbortController();
    controller.abort();
    await expect(atomicWrite(path, "bad", controller.signal)).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe("old");
    await atomicWrite(path, "new");
    expect(await readFile(path, "utf8")).toBe("new");
    await mkdir(dir + "/directory");
    await expect(atomicWrite(dir + "/directory", "invalid target")).rejects.toThrow();
    expect((await readdir(dir)).some((name) => name.includes(".tmp-"))).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
