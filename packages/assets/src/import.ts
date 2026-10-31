import { workerJob, type JobUpdate } from "./jobs";
import { parseImport, reconcileSubassets, type AssetImport } from "./record";
import { parseScene, cloneScene, type SceneDocument, type Asset } from "../../runtime/src/schema";
export interface PreparedImport {
  name: string;
  data: string;
  metadata: AssetImport;
}
export async function prepareImport(
  files: File[],
  signal: AbortSignal,
  onStage?: (u: JobUpdate) => void,
): Promise<PreparedImport> {
  if (files.reduce((n, f) => n + f.size, 0) > 4_000_000)
    throw Error("Input files exceed 4 MB budget");
  const input = [];
  for (const file of files) {
    signal.throwIfAborted();
    input.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  }
  signal.throwIfAborted();
  const result = await workerJob<PreparedImport>(
    () => new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" }),
    { files: input },
    signal,
    onStage,
  );
  result.metadata = parseImport(result.metadata);
  return result;
}
/** Rebase on the latest document. Reimport requires the original target generation still to match. */
export function adoptImport(
  scene: SceneDocument,
  result: PreparedImport,
  target?: { id: string; data: string; revision: number },
) {
  const next = cloneScene(scene);
  const old = target ? next.assets.find((a) => a.id === target.id) : undefined;
  if (
    target &&
    (!old || old.data !== target.data || (old.import?.revision || 0) !== target.revision)
  )
    throw Error("Reimport target changed or was removed; retry");
  const metadata = parseImport({
    ...result.metadata,
    revision: (old?.import?.revision || 0) + 1,
    subassets: reconcileSubassets(result.metadata.report, old?.import),
  });
  const asset: Asset = {
    id: old?.id || crypto.randomUUID(),
    name: old?.name || result.name,
    data: result.data,
    import: metadata,
  };
  const same =
    !target &&
    next.assets.find(
      (a) =>
        a.import?.artifactHash === metadata.artifactHash &&
        a.import?.sources[0]?.sha256 === metadata.sources[0].sha256,
    );
  if (same) return { scene: next, asset: same };
  if (old) next.assets[next.assets.indexOf(old)] = asset;
  else next.assets.push(asset);
  return { scene: parseScene(next), asset };
}
