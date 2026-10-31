import { test, expect } from "bun:test";
import {
  normalizeHex,
  hexToRgb,
  rgbToHex,
  rgbToHsv,
  hsvToRgb,
  pickerBounds,
} from "../packages/editor/src/color";
test("hex normalization and validation", () => {
  expect(normalizeHex("abc")).toBe("#aabbcc");
  expect(normalizeHex(" #C4CfA4 ")).toBe("#c4cfa4");
  expect(normalizeHex("#12345")).toBeNull();
  expect(normalizeHex("#gggggg")).toBeNull();
});
test("RGB and HSV roundtrip saturated, neutral and dark colors", () => {
  for (const hex of [
    "#000000",
    "#ffffff",
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#d8d1a7",
    "#14211b",
    "#c4cfa4",
  ])
    expect(rgbToHex(hsvToRgb(rgbToHsv(hexToRgb(hex))))).toBe(hex);
});
test("picker stays inside narrow, short and bottom/right edge viewports", () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 850, height: 650 },
    { width: 320, height: 240 },
  ]) {
    const p = pickerBounds(
      { right: viewport.width - 1, top: viewport.height - 30, bottom: viewport.height - 10 },
      viewport,
      540,
    );
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.left + p.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(p.top + Math.min(540, p.maxHeight)).toBeLessThanOrEqual(viewport.height - 8);
  }
});
