import { test, expect } from "bun:test";
import { DependencyGraph, type DependencyNode } from "../packages/assets/src/dependencies";
const nodes = (): DependencyNode[] => [
  { id: "source", sourceHash: "s0", artifactHash: "s0", dependencies: [] },
  {
    id: "texture",
    sourceHash: "s0",
    artifactHash: "t0",
    dependencies: [{ id: "source", mode: "source" }],
  },
  {
    id: "material",
    sourceHash: "m0",
    artifactHash: "m0",
    dependencies: [{ id: "texture", mode: "artifact" }],
  },
  {
    id: "prefab",
    sourceHash: "p0",
    artifactHash: "p0",
    dependencies: [{ id: "material", mode: "artifact" }],
  },
  {
    id: "scene",
    sourceHash: "w0",
    artifactHash: "w0",
    dependencies: [
      { id: "prefab", mode: "artifact" },
      { id: "texture", mode: "source" },
    ],
  },
];
test("topological scheduling stops at unchanged artifacts but honors direct source consumers", async () => {
  const graph = new DependencyGraph(nodes()),
    calls: string[] = [];
  expect(
    await graph.rebuild(
      new Map([["source", { sourceHash: "s1", artifactHash: "s1" }]]),
      async (n) => {
        calls.push(n.id);
        return n.id === "texture" ? { sourceHash: "s1", artifactHash: "t0" } : n;
      },
    ),
  ).toEqual(["texture", "scene"]);
  expect(calls).toEqual(["texture", "scene"]);
  calls.length = 0;
  const result = await graph.rebuild(
    new Map([["source", { sourceHash: "s2", artifactHash: "s2" }]]),
    async (n, deps) => {
      calls.push(n.id);
      expect(deps.length).toBeGreaterThan(0);
      return {
        sourceHash: n.id === "texture" ? "s2" : n.sourceHash,
        artifactHash: n.artifactHash + "-new",
      };
    },
  );
  expect(result).toEqual(["texture", "material", "prefab", "scene"]);
  expect(calls).toEqual(result);
});
test("failed or cancelled dependency rebuild preserves complete previous graph", async () => {
  const graph = new DependencyGraph(nodes()),
    before = graph.snapshot();
  await expect(
    graph.rebuild(new Map([["source", { sourceHash: "s1", artifactHash: "s1" }]]), async (n) => {
      if (n.id === "material") throw Error("conversion failed");
      return { sourceHash: "new", artifactHash: "new" };
    }),
  ).rejects.toThrow("failed");
  expect(graph.snapshot()).toEqual(before);
  const controller = new AbortController();
  await expect(
    graph.rebuild(
      new Map([["source", { sourceHash: "s1", artifactHash: "s1" }]]),
      async () => {
        controller.abort();
        return { sourceHash: "new", artifactHash: "new" };
      },
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(graph.snapshot()).toEqual(before);
});
test("a late scheduler cannot overwrite a newer dependency edit; deletions with consumers reject", async () => {
  const graph = new DependencyGraph(nodes());
  await expect(
    graph.rebuild(new Map([["source", { sourceHash: "s1", artifactHash: "s1" }]]), async (n) => {
      graph.changed("source", { sourceHash: "newest", artifactHash: "newest" });
      return n;
    }),
  ).rejects.toThrow("changed");
  expect(graph.snapshot().find((n) => n.id === "source")!.sourceHash).toBe("newest");
  expect(() => new DependencyGraph(nodes().filter((n) => n.id !== "texture"))).toThrow("Missing");
});
