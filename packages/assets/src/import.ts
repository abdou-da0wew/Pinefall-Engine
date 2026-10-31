import { assetDatabase } from "./database";
import { hashBytes } from "./blobs";
import { conversionKey } from "./dependencies";
import { referenceScene, sceneReferences } from "./documents";
import { verifyImport } from "./record";
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
  const sources = await Promise.all(
    input.map(async (file) => ({ name: file.name, sha256: await hashBytes(file.bytes) })),
  );
  const key = await conversionKey(sources, { importer: "pinefall-three-185", version: 1 });
  const matchesSources = (value: PreparedImport) =>
    JSON.stringify(
      value.metadata.sources
        .map((s) => ({ name: s.name, sha256: s.sha256 }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ) === JSON.stringify([...sources].sort((a, b) => a.name.localeCompare(b.name)));
  try {
    const cached = (await assetDatabase.getArtifact(key)) as PreparedImport | undefined;
    if (cached) {
      cached.metadata = parseImport(cached.metadata);
      if (matchesSources(cached)) {
        await verifyImport(cached.data, cached.metadata);
        signal.throwIfAborted();
        onStage?.({ id: key, stage: "cache-hit", elapsedMs: 0 });
        return cached;
      }
    }
  } catch {
    signal.throwIfAborted(); /* corrupt/unavailable regenerable cache is a miss */
  }
  const result = await workerJob<PreparedImport>(
    () => new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" }),
    { files: input },
    signal,
    onStage,
  );
  result.metadata = parseImport(result.metadata);
  const working = await referenceScene(
    {
      version: 1,
      name: "Import staging",
      template: "sandbox",
      entities: [],
      assets: [{ id: "staging", name: result.name, data: result.data, import: result.metadata }],
      environment: {
        background: "#000000",
        fog: "#000000",
        fogNear: 0,
        fogFar: 100,
        sun: 1,
        gravity: -9.81,
      },
    },
    signal,
  );
  result.data = working.assets[0].data;
  result.metadata = working.assets[0].import!;
  try {
    await assetDatabase.putArtifact(key, result, sceneReferences(working));
  } catch {
    result.metadata.report.warnings.push(
      "Persistent conversion cache unavailable/full; save a PIF backup.",
    );
  }
  signal.throwIfAborted();
  return result;
}
/** Rebase on the latest document. Reimport requires the original target generation still to match. */
export function adoptImport(
  scene: SceneDocument,
  result: PreparedImport,
  target?: { id: string; data: string; revision: number },
  mapping?: Record<string, string>,
) {
  const next = cloneScene(scene);
  if (result.data.startsWith("asset:sha256:")) next.version = 2;
  const old = target ? next.assets.find((a) => a.id === target.id) : undefined;
  if (
    target &&
    (!old || old.data !== target.data || (old.import?.revision || 0) !== target.revision)
  )
    throw Error("Reimport target changed or was removed; retry");
  const metadata = parseImport({
    ...result.metadata,
    revision: (old?.import?.revision || 0) + 1,
    subassets: reconcileSubassets(result.metadata.report, old?.import, mapping),
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
