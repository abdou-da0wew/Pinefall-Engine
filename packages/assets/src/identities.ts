export type SubassetKind = "node" | "mesh" | "skeleton" | "material" | "clip";
export interface SourceIdentity {
  kind: SubassetKind;
  key: string;
  label: string;
  ambiguous: boolean;
}
/** Called only after independent GLB structural validation. Source IDs are scoped to one asset/kind. */
export function inspectIdentities(doc: Record<string, unknown>): SourceIdentity[] {
  const result: SourceIdentity[] = [];
  for (const [kind, field] of [
    ["node", "nodes"],
    ["mesh", "meshes"],
    ["skeleton", "skins"],
  ] as const) {
    const values = (doc[field] || []) as {
      name?: string;
      extras?: { pinefallSourceId?: unknown; pinefallNormalization?: boolean };
    }[];
    const nodes = (doc.nodes || []) as {
      name?: string;
      mesh?: number;
      children?: number[];
      extras?: { pinefallSourceId?: string };
    }[];
    const keys = values.map((v, index) => {
      if (typeof v.extras?.pinefallSourceId === "string")
        return `source:${v.extras.pinefallSourceId}`;
      if (kind === "mesh") {
        const owners = nodes.filter((n) => n.mesh === index);
        if (owners.length === 1 && typeof owners[0].extras?.pinefallSourceId === "string")
          return "owner-source:" + owners[0].extras.pinefallSourceId;
      }
      if (kind === "skeleton") {
        const joints = (v as { joints?: number[] }).joints || [],
          children = new Set(joints.flatMap((i) => nodes[i]?.children || []));
        const roots = joints.filter((i) => !children.has(i));
        if (roots.length === 1) {
          const root = nodes[roots[0]];
          if (typeof root?.extras?.pinefallSourceId === "string")
            return "root-source:" + root.extras.pinefallSourceId;
          if (root?.name) return "root-name:" + root.name;
        }
      }
      return typeof v.name === "string" && v.name ? `name:${v.name}` : "";
    });
    for (const [i, value] of values.entries()) {
      if (kind === "node" && value.extras?.pinefallNormalization === true) continue;
      const ambiguous = !keys[i] || keys.filter((k) => k === keys[i]).length !== 1;
      const label = typeof value.name === "string" ? value.name : `[unnamed:${kind}:${i}]`;
      const key = ambiguous ? `ambiguous:${i}:${label}` : keys[i];
      if (key.length > 2000 || label.length > 2000)
        throw Error("Subasset identity length exceeds budget");
      result.push({ kind, key, label, ambiguous });
    }
  }
  return result;
}
export function parseIdentities(value: unknown): SourceIdentity[] {
  if (!Array.isArray(value) || value.length > 4096) throw Error("Invalid source identities");
  const keys = new Set<string>();
  return value.map((v) => {
    if (
      !v ||
      !["node", "mesh", "skeleton"].includes(v.kind) ||
      typeof v.key !== "string" ||
      !v.key.length ||
      v.key.length > 2000 ||
      typeof v.label !== "string" ||
      v.label.length > 2000 ||
      typeof v.ambiguous !== "boolean" ||
      keys.has(v.kind + ":" + v.key)
    )
      throw Error("Invalid source identity");
    keys.add(v.kind + ":" + v.key);
    return { kind: v.kind, key: v.key, label: v.label, ambiguous: v.ambiguous };
  });
}
