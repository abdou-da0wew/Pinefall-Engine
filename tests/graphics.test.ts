import { test, expect } from "bun:test";
import { defaultGraphics, parseGraphics, graphicsSwitches } from "../packages/editor/src/graphics";
test("desktop graphics preferences reject arbitrary switches and unsupported renderers", () => {
  expect(parseGraphics(defaultGraphics)).toEqual(defaultGraphics);
  for (const value of [
    null,
    {},
    { compositor: "software", renderer: "vgpu" },
    { ...defaultGraphics, noSandbox: true },
  ])
    expect(() => parseGraphics(value)).toThrow();
});
test("software compositor keeps WebGL available; CPU mode explicitly selects SwiftShader", () => {
  const ui = graphicsSwitches({ compositor: "software", renderer: "auto" }, "linux");
  expect(ui).toEqual([["disable-gpu-compositing", ""]]);
  const cpu = graphicsSwitches({ compositor: "default", renderer: "software" }, "linux");
  expect(cpu).toContainEqual(["use-angle", "swiftshader"]);
  expect(cpu).toContainEqual(["disable-gpu-compositing", ""]);
  expect(
    cpu.some(([key]) => ["disable-gpu", "no-sandbox", "disable-gpu-sandbox"].includes(key)),
  ).toBe(false);
  expect(graphicsSwitches(defaultGraphics, "linux")).toEqual([]);
  expect(
    graphicsSwitches({ compositor: "default", renderer: "legacy-gl" }, "linux"),
  ).toContainEqual(["ozone-platform", "x11"]);
});
