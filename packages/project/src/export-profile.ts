export interface ExportProfile {
  schemaVersion: 1;
  id: string;
  target: "web" | "linux-appimage" | "windows-zip";
  app: { id: string; name: string; version: string };
  window: { width: number; height: number; fullscreen: boolean };
  quality: "low" | "high";
  /** Explicit portable paths only; dynamic resources cannot be safely inferred from code. */
  include: string[];
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw Error("Invalid export profile fields");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    throw Error("Invalid export profile text");
  return value;
}
function number(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max)
    throw Error("Invalid export window bounds");
  return value;
}
export function parseExportProfile(value: unknown): ExportProfile {
  const p = record(value, ["schemaVersion", "id", "target", "app", "window", "quality", "include"]),
    app = record(p.app, ["id", "name", "version"]),
    window = record(p.window, ["width", "height", "fullscreen"]);
  if (
    typeof p.target !== "string" ||
    typeof p.quality !== "string" ||
    p.schemaVersion !== 1 ||
    !["web", "linux-appimage", "windows-zip"].includes(String(p.target)) ||
    !["low", "high"].includes(String(p.quality)) ||
    typeof window.fullscreen !== "boolean"
  )
    throw Error("Unsupported export profile version/options");
  const id = text(p.id, 64),
    appId = text(app.id, 150),
    version = text(app.version, 64);
  if (
    !/^[a-z][a-z0-9-]*$/.test(id) ||
    !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*){2,}$/.test(appId) ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(
      version,
    )
  )
    throw Error("Invalid export identity/version");
  if (!Array.isArray(p.include) || p.include.length > 256)
    throw Error("Invalid export include inventory");
  const seen = new Set<string>();
  const include = p.include.map((value) => {
    const path = text(value, 240);
    if (
      path.includes("\\") ||
      path.startsWith("/") ||
      path
        .split("/")
        .some(
          (part) =>
            !part ||
            part.startsWith(".") ||
            part === "." ||
            part === ".." ||
            !/^[a-zA-Z0-9_. -]+$/.test(part) ||
            part.endsWith(".") ||
            part.endsWith(" ") ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        ) ||
      seen.has(path.toLowerCase())
    )
      throw Error("Unsafe or duplicate export resource path");
    seen.add(path.toLowerCase());
    return path;
  });
  return {
    schemaVersion: 1,
    id,
    target: p.target as ExportProfile["target"],
    app: { id: appId, name: text(app.name, 100), version },
    window: {
      width: number(window.width, 640, 7680),
      height: number(window.height, 360, 4320),
      fullscreen: window.fullscreen,
    },
    quality: p.quality as ExportProfile["quality"],
    include,
  };
}
export function defaultExportProfile(name: string): ExportProfile {
  return parseExportProfile({
    schemaVersion: 1,
    id: "web",
    target: "web",
    app: { id: "org.pinefall.game", name, version: "0.1.0" },
    window: { width: 1280, height: 720, fullscreen: false },
    quality: "low",
    include: [],
  });
}
