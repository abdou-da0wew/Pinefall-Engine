import { test, expect } from "bun:test";
import { createGame } from "../packages/project/src";
import { entity, parseScene, serializeScene } from "../packages/runtime/src/schema";
import {
  moveNodes,
  deleteNodes,
  duplicateNodes,
  descendants,
} from "../packages/editor/src/hierarchy-model";
test("collections group physics without changing physics transforms, nested roundtrip", () => {
  const scene = createGame("collections");
  scene.collections = [
    { id: "a", name: "World" },
    { id: "b", name: "Actors", parent: "a" },
  ];
  const player = scene.entities[1];
  moveNodes(scene, [player.id], "b");
  expect(player.collection).toBe("b");
  expect(player.parent).toBeUndefined();
  expect(player.transform.position).toEqual([0, 1, 6]);
  expect(parseScene(JSON.parse(serializeScene(scene)))).toEqual(scene);
  expect(descendants(scene, ["a"]).has(player.id)).toBe(true);
});
test("transform parenting and unparenting preserve world positions", () => {
  const s = createGame("parent");
  const p = entity("Parent", "box", [10, 0, 0]),
    child = entity("Child", "box", [12, 1, 0]);
  s.entities.push(p, child);
  moveNodes(s, [child.id], p.id);
  expect(child.transform.position[0]).toBeCloseTo(2);
  moveNodes(s, [child.id], null);
  expect(child.transform.position[0]).toBeCloseTo(12);
  expect(child.parent).toBeUndefined();
});
test("invalid cycles, missing collections and physics parenting rejected", () => {
  const s = createGame("invalid");
  s.collections = [
    { id: "a", name: "A" },
    { id: "b", name: "B", parent: "a" },
  ];
  expect(() => moveNodes(s, ["a"], "b")).toThrow();
  expect(() => moveNodes(s, [s.entities[1].id], s.entities[0].id)).toThrow("Physics");
  s.entities[0].collection = "missing";
  expect(() => parseScene(s)).toThrow();
});
test("duplicate and delete complete subtrees without dangling references", () => {
  const s = createGame("copy");
  s.collections = [{ id: "a", name: "Collection" }];
  moveNodes(
    s,
    s.entities.map((e) => e.id),
    "a",
  );
  const copies = duplicateNodes(s, ["a"]);
  expect(s.entities.length).toBe(4);
  expect(descendants(s, copies).size).toBe(3);
  deleteNodes(s, ["a"]);
  expect(s.entities.length).toBe(2);
  expect(() => parseScene(s)).not.toThrow();
});
