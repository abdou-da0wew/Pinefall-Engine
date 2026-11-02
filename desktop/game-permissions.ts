/** Only pointer capture/fullscreen in the exact bundled top-level pages; all other permissions stay denied. */
export function allowsGamePermission(
  permission: string,
  url: string | undefined,
  isMainFrame: boolean,
  allowed: ReadonlySet<string>,
) {
  if (!isMainFrame || !url || !["pointerLock", "fullscreen"].includes(permission)) return false;
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return allowed.has(parsed.href);
  } catch {
    return false;
  }
}
