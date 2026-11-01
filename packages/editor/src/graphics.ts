// Shared desktop contract. No renderer-side Node access or arbitrary command-line switches.
export interface GraphicsPreferences {
  compositor: "default" | "software";
  renderer: "auto" | "legacy-gl" | "software";
}
export interface GraphicsState {
  active: GraphicsPreferences;
  saved: GraphicsPreferences;
  features: Record<string, string>;
}
export const defaultGraphics: GraphicsPreferences = { compositor: "default", renderer: "auto" };
export function parseGraphics(value: unknown): GraphicsPreferences {
  if (!value || typeof value !== "object") throw Error("Invalid graphics settings");
  const v = value as Record<string, unknown>;
  if (
    !["default", "software"].includes(String(v.compositor)) ||
    !["auto", "legacy-gl", "software"].includes(String(v.renderer)) ||
    Object.keys(v).some((k) => k !== "compositor" && k !== "renderer")
  )
    throw Error("Unsupported graphics settings");
  return {
    compositor: v.compositor as GraphicsPreferences["compositor"],
    renderer: v.renderer as GraphicsPreferences["renderer"],
  };
}
export function graphicsSwitches(
  p: GraphicsPreferences,
  platform: string,
): Array<[string, string]> {
  const switches: Array<[string, string]> = [];
  if (p.compositor === "software" || p.renderer === "software")
    switches.push(["disable-gpu-compositing", ""]);
  if (p.renderer === "software")
    switches.push(
      ["use-gl", "angle"],
      ["use-angle", "swiftshader"],
      ["enable-unsafe-swiftshader", ""],
      ["disable-accelerated-video-decode", ""],
    );
  if (p.renderer === "legacy-gl") {
    switches.push(["use-gl", "angle"], ["use-angle", "gl"], ["disable-features", "Vulkan"]);
    if (platform === "linux") switches.push(["ozone-platform", "x11"]);
  }
  return switches;
}
