/** Reusable asset-pipeline surface. Browser-only conversion is explicit; records/recipes/graphs are DOM-free. */
export { BlobStore, DiskBlobStore, blobs, hashBytes, isBlobRef } from "./blobs";
export { MemoryBudget, assetMemory } from "./budget";
export { DependencyGraph, sceneDependencyGraph, conversionKey } from "./dependencies";
export type { Dependency, DependencyNode } from "./dependencies";
export { parseRecipe, defaultRecipe, normalizeGlb } from "./recipe";
export type { ImportRecipe, Normalization } from "./recipe";
export { prepareImport, adoptImport, reimportInputs } from "./import";
export type { PreparedImport } from "./import";
export { prepareGlbRecord, parseImport, reconcileSubassets, verifyImport } from "./record";
export type { AssetImport, SourceFile } from "./record";
export { referenceScene, materializeScene, materializeSceneAsync } from "./documents";
export { ModelCache } from "./cache";
export { AssetDatabase } from "./database";

export { prepareReimports } from "./reimport";
export type { ReimportRequest } from "./reimport";

export { rememberMissing, repairFiles, validatePending, missingCompanion } from "./pending";
export type { PendingImport } from "./pending";

export { readAssetBytes } from "./glb";
