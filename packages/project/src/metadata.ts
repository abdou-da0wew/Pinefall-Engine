/** Portable metadata: no usernames, absolute paths, machine identifiers, or saved trust. */
export interface ProjectMetadata {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  author: string;
  projectVersion: string;
  createdAt: string;
  modifiedAt: string;
  editor: {
    name: "Pinefall Engine";
    version: string;
    sceneSchema: 1;
    layout: "unspecified" | "bottom" | "right";
    activeTool: "translate" | "rotate" | "scale";
  };
}
export function newProjectMetadata(title: string): ProjectMetadata {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title,
    description: "",
    author: "",
    projectVersion: "0.1.0",
    createdAt: now,
    modifiedAt: now,
    editor: {
      name: "Pinefall Engine",
      version: "0.6.1",
      sceneSchema: 1,
      layout: "unspecified",
      activeTool: "translate",
    },
  };
}
export function parseProjectMetadata(value: unknown): ProjectMetadata {
  const fail = (): never => {
    throw Error("Invalid project/editor metadata");
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) =>
        ![
          "schemaVersion",
          "id",
          "title",
          "description",
          "author",
          "projectVersion",
          "createdAt",
          "modifiedAt",
          "editor",
        ].includes(k),
    )
  )
    return fail();
  const text = (x: unknown, max: number) => {
    if (typeof x !== "string" || x.length > max || [...x].some((c) => c.charCodeAt(0) < 9))
      return fail();
    return x;
  };
  const version = (x: unknown) => {
    const s = text(x, 64);
    if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(s)) return fail();
    return s;
  };
  const date = (x: unknown) => {
    const s = text(x, 32);
    if (
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) ||
      !Number.isFinite(Date.parse(s)) ||
      new Date(s).toISOString() !== s
    )
      return fail();
    return s;
  };
  if (v.schemaVersion !== 1 || !v.editor || typeof v.editor !== "object" || Array.isArray(v.editor))
    return fail();
  const e = v.editor as Record<string, unknown>,
    id = text(v.id, 36);
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) return fail();
  if (
    Object.keys(e).some(
      (k) => !["name", "version", "sceneSchema", "layout", "activeTool"].includes(k),
    )
  )
    return fail();
  if (
    e.name !== "Pinefall Engine" ||
    e.sceneSchema !== 1 ||
    !["unspecified", "bottom", "right"].includes(String(e.layout)) ||
    !["translate", "rotate", "scale"].includes(String(e.activeTool))
  )
    return fail();
  const createdAt = date(v.createdAt),
    modifiedAt = date(v.modifiedAt);
  if (modifiedAt < createdAt) return fail();
  const title = text(v.title, 200);
  if (!title.trim()) return fail();
  return {
    schemaVersion: 1,
    id,
    title,
    description: text(v.description, 2000),
    author: text(v.author, 200),
    projectVersion: version(v.projectVersion),
    createdAt,
    modifiedAt,
    editor: {
      name: "Pinefall Engine",
      version: version(e.version),
      sceneSchema: 1,
      layout: e.layout as ProjectMetadata["editor"]["layout"],
      activeTool: e.activeTool as ProjectMetadata["editor"]["activeTool"],
    },
  };
}
