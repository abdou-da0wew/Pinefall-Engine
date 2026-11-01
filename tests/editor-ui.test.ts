import { test, expect } from "bun:test";
import { validateRecentRows } from "../packages/editor/src/recent-projects";
import {
  panelDefaults,
  panelDefinitions,
  readPreferences,
} from "../packages/editor/src/preferences";
import { readdir } from "node:fs/promises";
test("recent project metadata rejects corrupted IDs, sizes and duplicate inventory", () => {
  const row = {
    id: crypto.randomUUID(),
    name: "Project",
    template: "adventure",
    updated: 123,
    bytes: 100,
  };
  expect(validateRecentRows([row])).toEqual([row]);
  for (const patch of [
    { id: "bad" },
    { bytes: NaN },
    { bytes: 512 * 1024 * 1024 + 1 },
    { name: "" },
    { template: "unknown" },
    { updated: -1 },
  ])
    expect(() => validateRecentRows([{ ...row, ...patch }])).toThrow();
  expect(() => validateRecentRows([row, row])).toThrow();
  expect(() => validateRecentRows(Array(13).fill(row))).toThrow();
});
test("shared layout definitions and safe preference defaults", () => {
  expect(panelDefaults.right).toBeGreaterThanOrEqual(300);
  expect(new Set(panelDefinitions.map((p) => p.id)).size).toBe(panelDefinitions.length);
  expect(panelDefinitions.filter((p) => p.side === "bottom")).toHaveLength(5);
  expect(readPreferences()).toEqual({
    density: "comfortable",
    reducedMotion: true,
    quality: "low",
  });
});
test("all editor control modules use source-owned shared primitives", async () => {
  const paths = (await readdir("packages/editor/src")).filter(
    (p) => p.endsWith(".tsx") && p !== "ui.tsx",
  );
  for (const path of paths) {
    const text = await Bun.file("packages/editor/src/" + path).text();
    expect(text).not.toMatch(/<(button|input|select|textarea)\b/);
  }
  expect(paths.length).toBeGreaterThan(10);
});
