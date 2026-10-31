import { fromDataURI } from "./glb";
import { defaultRecipe, parseRecipe, type ImportRecipe } from "./recipe";
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
  inputRecipe: ImportRecipe = defaultRecipe(),
): Promise<PreparedImport> {
  const recipe = parseRecipe(inputRecipe);
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
  const key = await conversionKey(sources, recipe);
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
      if (
        matchesSources(cached) &&
        JSON.stringify(cached.metadata.recipe) === JSON.stringify(recipe)
      ) {
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
    { files: input, recipe },
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
  if (result.data.startsWith("asset:sha256:") && next.version !== 3) next.version = 2;
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

/** Replace only selected source names; retain archived companions/model for partial reimport.
 * Changing the model filename replaces the old model, not unrelated texture companions. */
export function reimportInputs(asset: Asset, selected: File[]): File[] {
  const names = new Set(selected.map((f) => f.name.toLowerCase()));
  if (names.size !== selected.length) throw Error("Ambiguous reimport filenames");
  const replacesModel = selected.some((f) => /\.(glb|fbx)$/i.test(f.name));
  const retained = (asset.import?.sources || []).filter(
    (s) => !names.has(s.name.toLowerCase()) && !(replacesModel && /\.(glb|fbx)$/i.test(s.name)),
  );
  return [
    ...selected,
    ...retained.map((s) => new File([new Uint8Array(fromDataURI(s.data))], s.name)),
  ];
}
