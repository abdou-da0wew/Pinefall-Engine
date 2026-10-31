import { assetDatabase, type AssetDatabase } from "./database";
import { hashBytes } from "./blobs";
import { safeName } from "./record";
import { parseRecipe, type ImportRecipe } from "./recipe";
import { assetMemory } from "./budget";
export interface PendingImport {
  id: string;
  projectId: string;
  recipe: ImportRecipe;
  missing: string;
  updated: number;
  target?: { id: string; data: string; revision: number };
  files: { name: string; bytes: Uint8Array; sha256: string }[];
}
export function missingCompanion(error: unknown) {
  const match = /Missing companion texture: (.+) \(exact filename required\)/.exec(String(error));
  if (!match) return undefined;
  safeName(match[1]);
  return match[1];
}
export async function validatePending(value: PendingImport): Promise<PendingImport> {
  if (
    !value ||
    typeof value.id !== "string" ||
    value.id.length > 100 ||
    !value.id ||
    typeof value.projectId !== "string" ||
    !value.projectId ||
    value.projectId.length > 100 ||
    !Number.isFinite(value.updated) ||
    !Array.isArray(value.files) ||
    !value.files.length ||
    value.files.length > 33
  )
    throw Error("Invalid pending import");
  safeName(value.missing);
  parseRecipe(value.recipe);
  if (
    value.target &&
    (typeof value.target.id !== "string" ||
      typeof value.target.data !== "string" ||
      value.target.data.length > 3_000_000 ||
      !Number.isSafeInteger(value.target.revision) ||
      value.target.revision < 0)
  )
    throw Error("Invalid recovery target");
  let total = 0;
  const names = new Set<string>();
  for (const file of value.files) {
    safeName(file.name);
    if (!(file.bytes instanceof Uint8Array)) throw Error("Invalid pending source bytes");
    total += file.bytes.length;
    if (total > 4_000_000) throw Error("Pending source budget");
    if (names.has(file.name.toLowerCase())) throw Error("Ambiguous pending sources");
    names.add(file.name.toLowerCase());
    if ((await hashBytes(file.bytes)) !== file.sha256) throw Error("Pending source hash mismatch");
  }
  return value;
}
export async function rememberMissing(
  files: File[],
  context: Omit<PendingImport, "files" | "updated">,
  signal: AbortSignal,
  db: AssetDatabase = assetDatabase,
) {
  signal.throwIfAborted();
  if (files.length > 33 || files.reduce((n, f) => n + f.size, 0) > 4_000_000)
    throw Error("Pending source budget");
  const reservation = assetMemory.reserve(16 * 1024 * 1024, "pending-import");
  try {
    const saved: PendingImport = {
      ...context,
      recipe: parseRecipe(context.recipe),
      updated: Date.now(),
      files: [],
    };
    for (const file of files) {
      signal.throwIfAborted();
      const bytes = new Uint8Array(await file.arrayBuffer());
      saved.files.push({ name: file.name, bytes, sha256: await hashBytes(bytes) });
    }
    await validatePending(saved);
    signal.throwIfAborted();
    await db.putPending(saved, signal);
    return saved;
  } finally {
    reservation.release();
  }
}
export async function repairFiles(
  attempt: PendingImport,
  selected: File[],
  projectId: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  await validatePending(attempt);
  signal.throwIfAborted();
  if (attempt.projectId !== projectId) throw Error("Recovery belongs to another project");
  const names = new Set(selected.map((f) => f.name.toLowerCase()));
  if (names.size !== selected.length) throw Error("Ambiguous repair filenames");
  const files = [
    ...selected,
    ...attempt.files
      .filter((f) => !names.has(f.name.toLowerCase()))
      .map((f) => new File([new Uint8Array(f.bytes)], f.name)),
  ];
  if (files.length > 33 || files.reduce((n, f) => n + f.size, 0) > 4_000_000)
    throw Error("Repair source budget");
  return files;
}
