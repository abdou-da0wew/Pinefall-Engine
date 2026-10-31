import { assetMemory } from "./budget";
import { sceneDependencyGraph, DependencyGraph, conversionKey } from "./dependencies";
import { hashBytes } from "./blobs";
import { prepareImport, reimportInputs, type PreparedImport } from "./import";
import { parseRecipe, type ImportRecipe } from "./recipe";
import type { JobUpdate } from "./jobs";
import { cloneScene, type SceneDocument } from "../../runtime/src/schema";
export interface ReimportRequest {
  assetId: string;
  files: File[];
  recipe?: ImportRecipe;
}
/** Cook a whole dependency transaction without mutating the caller's scene. Review/adoptImport
 * remains the publication boundary (and checks the original revision). Source IDs are asset-scoped:
 * two unrelated albedo.png files must never silently replace each other. */
async function prepareBatch(
  scene: SceneDocument,
  requests: ReimportRequest[],
  signal: AbortSignal,
  onStage?: (update: JobUpdate) => void,
) {
  signal.throwIfAborted();
  scene = cloneScene(scene);
  if (!requests.length || requests.length > 8) throw Error("Reimport batch budget");
  const nodes = sceneDependencyGraph(scene).snapshot(),
    byId = new Map(nodes.map((n) => [n.id, n]));
  const changes = new Map<string, { sourceHash: string; artifactHash: string }>(),
    prepared = new Map<string, PreparedImport>();
  const work = new Map<string, { files: File[]; recipe: ImportRecipe }>();
  for (const request of requests) {
    signal.throwIfAborted();
    const asset = scene.assets.find((a) => a.id === request.assetId);
    if (!asset?.import) throw Error("Reimport requires an asset with retained source provenance");
    const modelId = "model:" + asset.id;
    if (work.has(modelId)) throw Error("Duplicate reimport asset");
    const files = reimportInputs(asset, request.files),
      recipe = parseRecipe(request.recipe || asset.import.recipe);
    if (files.length > 33 || files.reduce((n, file) => n + file.size, 0) > 4_000_000)
      throw Error("Reimport source budget");
    work.set(modelId, { files, recipe });
    prepared.set(asset.id, {
      name: asset.name,
      data: asset.data,
      metadata: structuredClone(asset.import),
    });
    const model = byId.get(modelId)!,
      dependencies: typeof model.dependencies = [];
    for (const file of files) {
      signal.throwIfAborted();
      const id = "source:" + asset.id + ":" + file.name;
      const hash = await hashBytes(new Uint8Array(await file.arrayBuffer()));
      signal.throwIfAborted();
      if (!byId.has(id)) {
        const node = { id, sourceHash: "", artifactHash: "", dependencies: [] };
        nodes.push(node);
        byId.set(id, node);
      }
      changes.set(id, { sourceHash: hash, artifactHash: hash });
      dependencies.push({ id, mode: "source" });
    }
    // The recipe node also represents the source-name inventory, including removed companions.
    const recipeId = "recipe:" + asset.id;
    const before = await conversionKey(
      asset.import.sources.map((s) => ({ name: s.name, sha256: "" })),
      asset.import.recipe,
    );
    const after = await conversionKey(
      files.map((f) => ({ name: f.name, sha256: "" })),
      recipe,
    );
    nodes.push({ id: recipeId, sourceHash: before, artifactHash: before, dependencies: [] });
    changes.set(recipeId, { sourceHash: after, artifactHash: after });
    dependencies.push({ id: recipeId, mode: "source" });
    model.dependencies = dependencies;
  }
  const graph = new DependencyGraph(nodes);
  const rebuilt = await graph.rebuild(
    changes,
    async (node) => {
      signal.throwIfAborted();
      const request = work.get(node.id);
      if (!request) return node; // placed entities consume the changed model; no independent binary cook
      const result = await prepareImport(request.files, signal, onStage, request.recipe);
      signal.throwIfAborted();
      prepared.set(node.id.slice("model:".length), result);
      return {
        sourceHash: JSON.stringify(result.metadata.sources.map((s) => [s.name, s.sha256])),
        artifactHash: result.metadata.artifactHash,
      };
    },
    signal,
  );
  signal.throwIfAborted();
  return { prepared, rebuilt };
}

/** Up to eight 4 MB source sets; reserve retained inputs, hashing and transaction metadata. */
export async function prepareReimports(
  scene: SceneDocument,
  requests: ReimportRequest[],
  signal: AbortSignal,
  onStage?: (update: JobUpdate) => void,
) {
  signal.throwIfAborted();
  if (!requests.length || requests.length > 8) throw Error("Reimport batch budget");
  const reservation = assetMemory.reserve(64 * 1024 * 1024, "reimport-batch");
  try {
    return await prepareBatch(scene, [...requests], signal, onStage);
  } finally {
    reservation.release();
  }
}
