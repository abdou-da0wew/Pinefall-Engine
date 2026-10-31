import { hashBytes } from "./blobs";
export interface Dependency {
  id: string;
  mode: "source" | "artifact";
}
export interface DependencyNode {
  id: string;
  sourceHash: string;
  artifactHash: string;
  dependencies: Dependency[];
}
export class DependencyGraph {
  private revision = 0;
  private nodes = new Map<string, DependencyNode>();
  constructor(nodes: DependencyNode[]) {
    if (nodes.length > 4096) throw Error("Dependency graph node budget");
    for (const node of nodes) {
      if (this.nodes.has(node.id)) throw Error("Duplicate dependency ID");
      this.nodes.set(node.id, structuredClone(node));
    }
    const done = new Set<string>(),
      active = new Set<string>();
    const visit = (id: string) => {
      if (active.size > 128) throw Error("Dependency graph depth budget");
      if (active.has(id)) throw Error("Cyclic asset dependency");
      if (done.has(id)) return;
      const node = this.nodes.get(id);
      if (!node) throw Error("Missing asset dependency: " + id);
      active.add(id);
      for (const d of node.dependencies) {
        if (!["source", "artifact"].includes(d.mode)) throw Error("Invalid dependency mode");
        visit(d.id);
      }
      active.delete(id);
      done.add(id);
    };
    for (const node of nodes) visit(node.id);
  }
  snapshot() {
    return [...this.nodes.values()].map((n) => structuredClone(n));
  }
  /** Transactional topological rebuild. Original graph is unchanged on cancellation or cooker failure.
   * Source consumers rebuild on source changes; downstream artifact consumers only after a changed cooked output. */
  async rebuild(
    changes: Map<string, { sourceHash: string; artifactHash: string }>,
    cook: (
      node: DependencyNode,
      dependencies: DependencyNode[],
      signal?: AbortSignal,
    ) => Promise<{ sourceHash: string; artifactHash: string }>,
    signal?: AbortSignal,
  ) {
    const revision = this.revision;
    const staged = new DependencyGraph(this.snapshot()),
      dirty = new Set<string>(),
      rebuilt: string[] = [];
    for (const [id, value] of changes) {
      signal?.throwIfAborted();
      for (const consumer of staged.changed(id, value)) dirty.add(consumer);
    }
    const order: string[] = [],
      visited = new Set<string>();
    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      for (const d of staged.nodes.get(id)!.dependencies) visit(d.id);
      order.push(id);
    };
    for (const id of [...staged.nodes.keys()].sort()) visit(id);
    for (const id of order) {
      if (!dirty.has(id) || changes.has(id)) continue;
      signal?.throwIfAborted();
      const node = staged.nodes.get(id)!;
      const next = await cook(
        structuredClone(node),
        node.dependencies.map((d) => structuredClone(staged.nodes.get(d.id)!)),
        signal,
      );
      signal?.throwIfAborted();
      if (!next || typeof next.sourceHash !== "string" || typeof next.artifactHash !== "string")
        throw Error("Invalid cooked dependency result");
      for (const consumer of staged.changed(id, next)) dirty.add(consumer);
      rebuilt.push(id);
    }
    signal?.throwIfAborted();
    if (this.revision !== revision) throw Error("Dependency graph changed during rebuild");
    this.nodes = staged.nodes;
    this.revision++;
    return rebuilt;
  }
  /** Only direct consumers are invalidated until recooking establishes whether THEIR output changed. */
  changed(id: string, next: { sourceHash: string; artifactHash: string }) {
    const previous = this.nodes.get(id);
    if (!previous) throw Error("Missing changed dependency");
    const consumers = [...this.nodes.values()]
      .filter((n) =>
        n.dependencies.some(
          (d) =>
            d.id === id &&
            (d.mode === "source"
              ? previous.sourceHash !== next.sourceHash
              : previous.artifactHash !== next.artifactHash),
        ),
      )
      .map((n) => n.id)
      .sort();
    Object.assign(previous, next);
    this.revision++;
    return consumers;
  }
}
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonicalValue(v)]),
    );
  return value;
}
export async function conversionKey(sources: { name: string; sha256: string }[], recipe: unknown) {
  const canonical = {
    schema: 1,
    renderer: "three-r185",
    target: "webgl2-low",
    recipe: canonicalValue(recipe),
    sources: [...sources]
      .map((s) => ({ name: s.name, sha256: s.sha256 }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
  };
  return hashBytes(new TextEncoder().encode(JSON.stringify(canonical)));
}
/** Model conversion consumes source bytes; placed entities consume the cooked model only. */
export function sceneDependencyGraph(scene: import("../../runtime/src/schema").SceneDocument) {
  const nodes: DependencyNode[] = [];
  for (const asset of scene.assets) {
    const dependencies: Dependency[] = [];
    for (const source of asset.import?.sources || []) {
      const id = "source:" + asset.id + ":" + source.name;
      nodes.push({ id, sourceHash: source.sha256, artifactHash: source.sha256, dependencies: [] });
      dependencies.push({ id, mode: "source" });
    }
    nodes.push({
      id: "model:" + asset.id,
      sourceHash: JSON.stringify(asset.import?.sources.map((s) => [s.name, s.sha256]) || []),
      artifactHash: asset.import?.artifactHash || asset.data,
      dependencies,
    });
  }
  for (const entity of scene.entities)
    if (entity.mesh?.asset)
      nodes.push({
        id: "entity:" + entity.id,
        sourceHash: "",
        artifactHash: "",
        dependencies: [{ id: "model:" + entity.mesh.asset, mode: "artifact" }],
      });
  return new DependencyGraph(nodes);
}
