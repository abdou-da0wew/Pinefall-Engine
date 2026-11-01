export interface EditorPreferences {
  density: "comfortable" | "compact";
  reducedMotion: boolean;
  quality: "low" | "high";
}
export const defaultPreferences: EditorPreferences = {
  density: "comfortable",
  reducedMotion: true,
  quality: "low",
};
export function readPreferences(): EditorPreferences {
  try {
    const p = JSON.parse(localStorage.getItem("pinefall.editor.preferences.v1") ?? "null");
    return {
      density: p?.density === "compact" ? "compact" : "comfortable",
      reducedMotion: p?.reducedMotion !== false,
      quality: p?.quality === "high" ? "high" : "low",
    };
  } catch {
    return { ...defaultPreferences };
  }
}
export function savePreferences(p: EditorPreferences) {
  localStorage.setItem("pinefall.editor.preferences.v1", JSON.stringify(p));
  applyPreferences(p);
}
export function applyPreferences(p: EditorPreferences) {
  document.documentElement.dataset.density = p.density;
  document.documentElement.dataset.reducedMotion = String(p.reducedMotion);
}
export const panelDefaults = {
  left: 252,
  right: 310,
  bottom: 236,
  dock: "bottom" as const,
  focus: false,
};
export const panelDefinitions = [
  { id: "hierarchy", title: "Scene hierarchy", side: "left" },
  { id: "inspector", title: "Inspector", side: "right" },
  { id: "assets", title: "Asset library", side: "bottom" },
  { id: "console", title: "Console", side: "bottom" },
  { id: "ui", title: "UI designer", side: "bottom" },
  { id: "scripts", title: "Scripts", side: "bottom" },
  { id: "guide", title: "Quick start", side: "bottom" },
] as const;
