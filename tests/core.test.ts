import { test, expect } from "bun:test";
import { createTemplate } from "../examples/templates";
import { parseScene, serializeScene } from "../packages/runtime/src/schema";
import { History } from "../packages/editor/src/history";
import { Events } from "../packages/runtime/src/events";
test("four templates roundtrip and contain valid bodies", () => {
  for (const type of ["adventure", "first-person", "driving", "sandbox"] as const) {
    const scene = createTemplate(type);
    expect(parseScene(JSON.parse(serializeScene(scene)))).toEqual(scene);
    expect(scene.entities.some((e) => e.physics)).toBe(true);
  }
});
test("validation rejects cycles, duplicates and nonfinite transforms", () => {
  const s = createTemplate("adventure");
  s.entities[0].transform.position[0] = NaN;
  expect(() => parseScene(s)).toThrow();
  s.entities[0].transform.position[0] = 0;
  s.entities.push(s.entities[0]);
  expect(() => parseScene(s)).toThrow();
});
test("undo redo isolated snapshots", () => {
  const history = new History(),
    s = createTemplate("sandbox");
  history.commit(s);
  const original = s.name;
  s.name = "changed";
  expect(history.undo(s)?.name).toBe(original);
  expect(history.redo(s)?.name).toBe("changed");
});
test("events bounded with unsubscribe", () => {
  const bus = new Events();
  let count = 0;
  const off = bus.subscribe(() => count++);
  for (let i = 0; i < 250; i++) bus.emit("test", "event");
  off();
  bus.emit("test", "last");
  expect(count).toBe(250);
  expect(bus.entries.length).toBe(200);
  expect(bus.jsonl().split("\n").length).toBe(200);
});
