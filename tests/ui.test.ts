import { test, expect } from "bun:test";
import { createUIElement, parseUI } from "../packages/ui/src/schema";
import { UIStore } from "../packages/ui/src/store";
import { sampleHUD, UI_DEMO_SCRIPT } from "../packages/ui/src/presets";
import { createGame } from "../packages/project/src";
import { HeadlessEngine } from "../packages/headless/src";
import { entity, parseScene, serializeScene } from "../packages/runtime/src/schema";
import type { SceneDocument } from "../packages/runtime/src/schema";
function attach(s: SceneDocument, source: string) {
  s.scripts = [{ id: "controller", name: "controller.ts", source }];
  s.entities[1].scripts = [{ id: "attachment", script: "controller", enabled: true, props: {} }];
}
test("UI schemas roundtrip and reject invalid IDs, parents, values and styles", () => {
  const s = createGame("UI");
  s.ui = sampleHUD();
  expect(parseScene(JSON.parse(serializeScene(s)))).toEqual(s);
  const bad = () => structuredClone(s.ui!);
  let x = bad();
  x.elements.push(x.elements[0]);
  expect(() => parseUI(x)).toThrow("duplicate");
  x = bad();
  x.elements[0].parent = x.elements[0].id;
  expect(() => parseUI(x)).toThrow();
  x = bad();
  x.elements[1].parent = "none";
  expect(() => parseUI(x)).toThrow();
  x = bad();
  x.elements[0].width = Infinity;
  expect(() => parseUI(x)).toThrow();
  x = bad();
  x.elements[0].style.background = "url(https://example.com)";
  expect(() => parseUI(x)).toThrow();
  x = bad();
  x.elements.find((e) => e.kind === "progress")!.value = 101;
  expect(() => parseUI(x)).toThrow();
});
test("UI mutations are transactional, isolated and no-op writes do not dirty the renderer", () => {
  const ui = new UIStore();
  ui.load(sampleHUD());
  const before = ui.snapshot();
  const rev = ui.revision;
  ui.setText("health-text", "Health: 75 / 100");
  expect(ui.revision).toBe(rev);
  expect(() => ui.setValue("health-bar", 999)).toThrow();
  expect(ui.snapshot()).toEqual(before);
  const e = ui.get("health-text")!;
  e.text = "mutated copy";
  expect(ui.get(e.id)!.text).not.toBe(e.text);
  ui.setStyle(e.id, { radius: 12 });
  expect(ui.get(e.id)!.style.radius).toBe(12);
  ui.remove("hud-panel");
  expect(ui.snapshot().elements).toHaveLength(0);
});
test("headless event dispatch respects disabled/hidden ancestors and supports actions and unsubscribe", () => {
  const ui = new UIStore();
  ui.load(sampleHUD());
  let count = 0;
  const off = ui.onAction("heal", () => count++);
  expect(ui.dispatch("heal-button", "click")).toBe(false);
  ui.interactive = true;
  expect(ui.dispatch("heal-button", "click")).toBe(true);
  expect(count).toBe(1);
  ui.setVisible("hud-panel", false);
  expect(ui.dispatch("heal-button", "click")).toBe(false);
  ui.setVisible("hud-panel", true);
  ui.setEnabled("hud-panel", false);
  expect(ui.dispatch("heal-button", "click")).toBe(false);
  ui.setEnabled("hud-panel", true);
  off();
  ui.dispatch("heal-button", "click");
  expect(count).toBe(1);
});
test("runtime UI actions, updates and pause/resume work without a DOM; authored data stays unchanged", async () => {
  const s = createGame("HUD");
  s.ui = sampleHUD();
  attach(s, UI_DEMO_SCRIPT);
  const original = serializeScene(s),
    e = await HeadlessEngine.create(s);
  e.allowSceneScripts = true;
  try {
    e.step(60);
    expect(e.ui.get("hud-title")!.text).toContain("1.0s");
    e.ui.dispatch("heal-button", "click");
    expect(e.ui.get("health-bar")!.value).toBe(85);
    e.ui.dispatch("power-slider", "change", 66);
    expect(e.ui.get("status-text")!.text).toBe("Power: 66");
    e.ui.dispatch("shield-toggle", "change", true);
    expect(e.ui.get("status-text")!.text).toBe("Shield on");
    e.ui.dispatch("pause-button", "click");
    expect(e.paused).toBe(true);
    e.step(30);
    expect(e.report().ticks).toBe(60);
    e.ui.dispatch("pause-button", "click");
    e.step(2);
    expect(e.report().ticks).toBe(62);
    expect(serializeScene(s)).toBe(original);
    expect(e.report().ui.elements.length).toBeGreaterThan(5);
    expect(e.events.entries.filter((e) => e.type === "error")).toHaveLength(0);
  } finally {
    e.dispose();
  }
});
test("real physics sensor trigger changes UI through a script lifecycle hook", async () => {
  const s = createGame("trigger UI");
  s.ui = sampleHUD();
  attach(s, UI_DEMO_SCRIPT);
  const hazard = entity("Hazard", "sphere", [0, 1, 6], [2, 2, 2]);
  hazard.tag = "hazard";
  hazard.physics = {
    type: "fixed",
    shape: "sphere",
    mass: 1,
    friction: 0,
    restitution: 0,
    sensor: true,
  };
  s.entities.push(hazard);
  const e = await HeadlessEngine.create(s);
  e.allowSceneScripts = true;
  try {
    e.step(3);
    expect(e.ui.get("health-bar")!.value).toBe(55);
    expect(e.ui.get("status-text")!.text).toBe("Hazard hit");
  } finally {
    e.dispose();
  }
});
test("script UI listeners clean up on entity destruction and callback errors disable only the offender", async () => {
  const s = createGame("cleanup");
  s.ui = sampleHUD();
  attach(
    s,
    `export default ctx=>({start(){ctx.ui.onAction('heal',()=>{ctx.ui.setText('health-text','alive');throw Error('UI error');});},update(){ctx.ui.setText('hud-title','running');}});`,
  );
  const e = await HeadlessEngine.create(s);
  e.allowSceneScripts = true;
  try {
    e.step();
    e.ui.dispatch("heal-button", "click");
    e.ui.setText("hud-title", "disabled");
    e.step();
    expect(e.ui.get("hud-title")!.text).toBe("disabled");
    expect(e.events.entries.filter((e) => e.type === "error")).toHaveLength(1);
    e.ui.dispatch("heal-button", "click");
    expect(e.events.entries.filter((e) => e.type === "error")).toHaveLength(1);
    e.destroy(s.entities[1].id);
    e.ui.setText("health-text", "destroyed");
    e.ui.dispatch("heal-button", "click");
    expect(e.ui.get("health-text")!.text).toBe("destroyed");
  } finally {
    e.dispose();
  }
});
test("text input, select, and runtime widget creation use the same validated state model", () => {
  const ui = new UIStore();
  ui.interactive = true;
  const input = createUIElement("input", "name"),
    select = createUIElement("select", "choice");
  ui.create(input);
  ui.create(select);
  let value = "";
  ui.on("name", "submit", (e) => {
    value = String(e.value);
  });
  ui.dispatch("name", "change", "<img src=x>");
  ui.dispatch("name", "submit");
  expect(value).toBe("<img src=x>");
  ui.dispatch("choice", "change", "Option 2");
  expect(ui.get("choice")!.value).toBe("Option 2");
  expect(() => ui.dispatch("choice", "change", "invalid")).toThrow();
});
