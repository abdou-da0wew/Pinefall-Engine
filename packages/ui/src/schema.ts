export type UIKind =
  | "panel"
  | "text"
  | "button"
  | "progress"
  | "toggle"
  | "slider"
  | "input"
  | "select";
export type UIAnchor = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
export type UIValue = string | number | boolean;
export interface UIStyle {
  background: string;
  backgroundOpacity: number;
  color: string;
  accent: string;
  opacity: number;
  fontSize: number;
  radius: number;
  border: number;
  padding: number;
  align: "left" | "center" | "right";
}
export interface UIElement {
  id: string;
  name: string;
  kind: UIKind;
  parent?: string;
  anchor: UIAnchor;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  enabled: boolean;
  text: string;
  value: UIValue;
  min: number;
  max: number;
  step: number;
  action: string;
  options: string[];
  layout: "absolute" | "row" | "column";
  gap: number;
  z: number;
  style: UIStyle;
}
export interface UIDocument {
  width: number;
  height: number;
  elements: UIElement[];
}
export function createUIElement(
  kind: UIKind,
  id: string = crypto.randomUUID(),
  name: string = kind,
): UIElement {
  return {
    id,
    name,
    kind,
    anchor: "top-left",
    x: 24,
    y: 24,
    width: kind === "panel" ? 300 : 220,
    height:
      kind === "panel"
        ? 200
        : kind === "text"
          ? 36
          : ["slider", "toggle", "progress"].includes(kind)
            ? 72
            : 44,
    visible: true,
    enabled: true,
    text:
      kind === "text"
        ? "Your text"
        : kind === "panel"
          ? ""
          : kind === "progress"
            ? "Health"
            : kind[0].toUpperCase() + kind.slice(1),
    value:
      kind === "toggle"
        ? false
        : kind === "progress" || kind === "slider"
          ? 50
          : kind === "select"
            ? "Option 1"
            : "",
    min: 0,
    max: 100,
    step: 1,
    action: "",
    options: kind === "select" ? ["Option 1", "Option 2"] : [],
    layout: "absolute",
    gap: 8,
    z: 0,
    style: {
      background: kind === "text" ? "#14211b" : "#24392b",
      backgroundOpacity: kind === "text" ? 0 : 1,
      color: "#e5e6cb",
      accent: "#c4cfa4",
      opacity: 1,
      fontSize: 18,
      radius: 8,
      border: kind === "text" ? 0 : 1,
      padding: kind === "text" ? 4 : 8,
      align: "left",
    },
  };
}
export function emptyUI(): UIDocument {
  return { width: 1280, height: 720, elements: [] };
}
function rec(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function fail(why: string): never {
  throw Error("Invalid UI: " + why);
}
function str(v: unknown, label: string, max = 100) {
  if (typeof v !== "string" || v.length > max) fail(label);
  return v;
}
function num(v: unknown, label: string, min: number, max: number) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) fail(label);
  return v;
}
function choice<T extends string>(v: unknown, values: T[]): T {
  if (typeof v !== "string" || !values.includes(v as T)) fail("enum");
  return v as T;
}
export function parseUI(value: unknown): UIDocument {
  if (!rec(value) || !Array.isArray(value.elements) || value.elements.length > 128)
    fail("canvas/128 element limit");
  const elements: UIElement[] = value.elements.map((v) => {
    if (
      !rec(v) ||
      !rec(v.style) ||
      typeof v.visible !== "boolean" ||
      typeof v.enabled !== "boolean"
    )
      fail("element");
    const st = v.style;
    const color = (v: unknown) => {
      if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v)) fail("color");
      return v;
    };
    if (!Array.isArray(v.options) || v.options.length > 32) fail("options");
    if (!["string", "number", "boolean"].includes(typeof v.value)) fail("value");
    if (typeof v.value === "number" && !Number.isFinite(v.value)) fail("value");
    if (typeof v.value === "string" && v.value.length > 1000) fail("value length");
    const e: UIElement = {
      id: str(v.id, "id"),
      name: str(v.name, "name"),
      kind: choice(v.kind, [
        "panel",
        "text",
        "button",
        "progress",
        "toggle",
        "slider",
        "input",
        "select",
      ]),
      anchor: choice(v.anchor, ["top-left", "top-right", "bottom-left", "bottom-right", "center"]),
      x: num(v.x, "x", -4096, 4096),
      y: num(v.y, "y", -4096, 4096),
      width: num(v.width, "width", 16, 4096),
      height: num(v.height, "height", 16, 4096),
      visible: v.visible,
      enabled: v.enabled,
      text: str(v.text, "text", 2000),
      value: v.value as UIValue,
      min: num(v.min, "min", -1000000, 1000000),
      max: num(v.max, "max", -1000000, 1000000),
      step: num(v.step, "step", 0.001, 1000000),
      action: str(v.action, "action"),
      options: v.options.map((o) => str(o, "option")),
      layout: choice(v.layout, ["absolute", "row", "column"]),
      gap: num(v.gap, "gap", 0, 200),
      z: num(v.z, "z", -100, 100),
      style: {
        background: color(st.background),
        backgroundOpacity: num(st.backgroundOpacity ?? 1, "background opacity", 0, 1),
        color: color(st.color),
        accent: color(st.accent),
        opacity: num(st.opacity, "opacity", 0, 1),
        fontSize: num(st.fontSize, "font size", 8, 96),
        radius: num(st.radius, "radius", 0, 100),
        border: num(st.border, "border", 0, 20),
        padding: num(st.padding, "padding", 0, 100),
        align: choice(st.align, ["left", "center", "right"]),
      },
    };
    if (!e.id || !e.name) fail("empty id/name");
    if (v.parent !== undefined) e.parent = str(v.parent, "parent");
    if (e.min >= e.max) fail("min must be less than max");
    if (
      ["progress", "slider"].includes(e.kind) &&
      (typeof e.value !== "number" || e.value < e.min || e.value > e.max)
    )
      fail("numeric value/range");
    if (e.kind === "toggle" && typeof e.value !== "boolean") fail("toggle boolean");
    if (["input", "select"].includes(e.kind) && typeof e.value !== "string") fail("string value");
    if (e.kind === "select" && !e.options.includes(String(e.value))) fail("select option");
    return e;
  });
  if (new Set(elements.map((e) => e.id)).size !== elements.length) fail("duplicate IDs");
  for (const e of elements) {
    const seen = new Set([e.id]);
    let p = e.parent;
    while (p) {
      const node = elements.find((e) => e.id === p);
      if (!node || seen.has(p) || node.kind !== "panel")
        fail("missing, cyclic, or non-panel parent");
      seen.add(p);
      p = node.parent;
    }
  }
  return {
    width: num(value.width, "canvas width", 320, 4096),
    height: num(value.height, "canvas height", 180, 2160),
    elements,
  };
}
