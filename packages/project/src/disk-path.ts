export function projectRelativePath(input: unknown): string {
  if (typeof input !== "string" || input.length > 240 || !input.length || input.includes("\\"))
    throw Error("Invalid project-relative path");
  const parts = input.split("/");
  if (
    parts.length > 16 ||
    parts.some(
      (p) =>
        !p ||
        p.startsWith(".") ||
        [...p].some((c) => c.charCodeAt(0) < 32) ||
        /[<>:"|?*]/.test(p) ||
        /[. ]$/.test(p) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p),
    )
  )
    throw Error("Unsafe project-relative path");
  return parts.join("/");
}
