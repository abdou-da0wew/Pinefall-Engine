import { transform } from "sucrase";
/** Syntax checking / TypeScript erasure only. Does not evaluate code or type-check it. */
export function compileScript(source: string, name = "script.ts") {
  if (!source.trim() || source.length > 64000)
    throw Error("Script must contain 1–64000 characters");
  return transform(source, {
    transforms: ["typescript", "imports"],
    filePath: name,
    production: true,
  }).code;
}
