import { test, expect } from "bun:test";
import {
  missingCompanion,
  validatePending,
  repairFiles,
  rememberMissing,
  type PendingImport,
} from "../packages/assets/src/pending";
import { hashBytes } from "../packages/assets/src/blobs";
import { assetMemory } from "../packages/assets/src/budget";
async function attempt(): Promise<PendingImport> {
  const bytes = new TextEncoder().encode("source");
  return {
    id: "attempt",
    projectId: "project",
    updated: Date.now(),
    missing: "albedo.png",
    recipe: {
      importer: "pinefall-three-185",
      version: 2,
      settings: { unitScale: 1, outputUp: "Y" },
    },
    files: [{ name: "model.fbx", bytes, sha256: await hashBytes(bytes) }],
  };
}
test("missing companion reports are explicit and unsafe source names reject", () => {
  expect(
    missingCompanion(Error("Missing companion texture: albedo.png (exact filename required)")),
  ).toBe("albedo.png");
  expect(missingCompanion(Error("decode failure"))).toBeUndefined();
  expect(() =>
    missingCompanion(Error("Missing companion texture: ../bad.png (exact filename required)")),
  ).toThrow();
});
test("repair preserves original sources, enforces project scope and checks hashes", async () => {
  const value = await attempt(),
    signal = new AbortController().signal;
  const files = await repairFiles(value, [new File(["image"], "albedo.png")], "project", signal);
  expect(files.map((f) => f.name)).toEqual(["albedo.png", "model.fbx"]);
  expect(await files[1].text()).toBe("source");
  await expect(repairFiles(value, [], "other", signal)).rejects.toThrow("another project");
  value.files[0].bytes[0] ^= 1;
  await expect(validatePending(value)).rejects.toThrow("hash mismatch");
});
test("recovery budgets and cancellation release admission without persistence", async () => {
  const value = await attempt(),
    before = assetMemory.snapshot.used,
    controller = new AbortController();
  controller.abort();
  await expect(
    rememberMissing([new File(["x"], "model.fbx")], value, controller.signal),
  ).rejects.toThrow();
  expect(assetMemory.snapshot.used).toBe(before);
  await expect(
    rememberMissing(
      [new File([new Uint8Array(4_000_001)], "model.fbx")],
      value,
      new AbortController().signal,
    ),
  ).rejects.toThrow("budget");
  expect(assetMemory.snapshot.used).toBe(before);
});
