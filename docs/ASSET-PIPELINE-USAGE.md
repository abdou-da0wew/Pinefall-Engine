# Working asset pipeline (0.6.0)

## Normalization and identity

The editor's Assets panel has an explicit unit multiplier and **converter output** up-axis. A multiplier of `0.01` converts centimeters to meters. Y is the usual output axis for both formats: Three r185's FBX loader already corrects Z-up. Selecting Z applies an additional correction to the converted output; it does not describe the original FBX header. No automatic unit guessing is claimed.

The transform is a parent of the original model, retaining original geometry, skin inverse-bind data and animation tracks. Original bytes remain separate immutable sources. Recipes are versioned, validated, included in cache identity, persisted through PIF and retained on reimport unless **Override saved recipe on reimport** is checked. Partial reimports retain archived companions and can update a texture without reselecting the model.

Nodes prefer exported source IDs (FBX object IDs are propagated). Meshes may use a unique source-ID-bearing owner; skeletons may use a unique root source ID. Unique names are a fallback. Duplicate/missing identities are not matched by array position. The review pages eight identities at a time and limits each previous-identity search list to fifty options. It supports node, mesh, skeleton, material and clip remapping and rejects duplicate, foreign or wrong-kind IDs. This is identity tracking, not a new animation player or material-authoring system; Plans 02/03 are separate.

## CLI uses the same converter

Install dependencies with Bun. CLI FBX requires the Playwright Chromium installation (`bun x playwright install chromium`). GLB normalization is DOM-free; FBX uses the **same worker source** as the editor in an offline, sandboxed Chromium process. Selected bytes are fetched over a private loopback endpoint and transferred as binary buffers, not millions of JSON numbers. No external texture fetches or project scripts are permitted.

```sh
bun scripts/game.ts import project.pif character.fbx --companion diffuse.png --recipe examples/recipes/centimeters.recipe.json
bun scripts/game.ts reimport project.pif ASSET_ID edited.fbx --companion diffuse.png
bun scripts/game.ts reimport project.pif ASSET_ID edited.glb --recipe examples/recipes/centimeters.recipe.json --mapping remap.json
```

Mapping JSON maps `kind:source-key` to an old subasset ID; an empty string requests a new ID. Unknown keys, non-string values, duplicate IDs and cross-kind mappings reject. Reimport defaults to the saved recipe. Failed conversion never writes the destination project. Native/CLI saves stage a sibling temporary file, flush it, then rename; failures clean temporary files. Directory syncing is best effort and does not guarantee power-loss durability on every filesystem.

The explicit `--allow-unsandboxed-converter` flag exists for isolated test hosts only and emits a warning. It is **not** the default, not a renderer compatibility fix, and not appropriate for untrusted inputs. The sandboxed default has been exercised successfully in this workspace.

## Dependencies

`packages/assets/src/index.ts` exposes the reusable pipeline APIs. `DependencyGraph.rebuild()` stages a graph snapshot, schedules affected consumers topologically, and commits only if every cooker succeeds and the graph generation still matches. Source consumers rebuild when source digests change. Artifact-only consumers are not propagated until their producer's cooked digest changes. Cycles, missing references, excessive depth, cancellation, cooker failure and stale completion reject without replacing the old graph. Cooker callbacks must stage their own resources until success.

The editor's model sources, artifacts and placed consumers are represented by `sceneDependencyGraph`; model conversion caching keys all selected source/companion hashes and recipes. Generic material/prefab/scene chains are exercised through the scheduler API. This does not silently add the material/prefab authoring features assigned to later plans.

`prepareReimports(scene, requests, signal)` connects this graph to real model cooking and is also used by editor reimport. Each request names an existing asset ID, replacement files, and an optional recipe. Source filenames are scoped to the asset, retained companions remain available, and a recipe/source-inventory node handles recipe changes and renamed files. Up to eight source sets are prepared sequentially under a 64 MiB accounting reservation. The result contains `prepared` imports and `rebuilt` graph IDs; no authored scene is mutated. Existing review and revision-checked `adoptImport` remain the publication boundary. Failed batches may leave reusable immutable cache entries but never a partly adopted scene. Callers must keep the original target revisions and apply the same stale-result checks as the editor.

## Host reconstruction and ownership

Geometry bounds are computed in the worker. Typed animation buffers transfer without JSON float arrays, including cubic tangents; the host preserves glTF cubic-spline quaternion normalization. Materials, tracks and hierarchy objects reconstruct in cooperative slices. `ModelCache.acquireAsync` pins prototypes during cancellable instance construction and remaps only newly owned skeletons. Synchronous `acquire` remains available for explicit immediate spawning; it is not a nonblocking API.

The ObjectLoader adapter is pinned to Three r185: runtime `parseObject` takes five arguments although the corresponding type declaration omits textures. Tests must pass before a Three upgrade. The supported final `parse` entry performs bounded skeleton/light binding against already reconstructed resources; individual bindings, constructors and GPU/driver calls cannot be preempted. No physical latency guarantee follows from cooperative scheduling alone.

## Compatibility and explicit unsupported cases

PIF **v4** is required for recipe-v2 provenance and expanded identities. 0.6.0 reads v1/v2/v3/v4; older provenance remains v3 and projects without provenance remain v2. Older engines reject v4 instead of silently losing settings. Portable scene JSON remains embedded; reference-only working documents still require their blob database.

Current admission is 200 MB combined source/companions and 200 MB cooked model data, 2048px imported companion images, 256 MiB inspected decoded model data and 480 MB encoded model/source project capacity. Decoded/render and shared-work budgets are independent; passing encoded admission does not certify hardware performance.

FBX loader/exporter warnings are captured into bounded import reports, in addition to the experimental-conversion warning. Constraints, proprietary shading, some interpolation/conversion cases and morph normals are not universally lossless. Supported importer behavior and rejection policy must not be confused with full FBX specification coverage.

## Reproducible validation

```sh
bun run check
bun test tests
bun tests/dcc-fidelity.ts --fetch
bun tests/cli-parity.ts
bun tests/dcc-browser.ts
bun tests/normalization-browser.ts
bun tests/reimport-batch-browser.ts
```

Browser suites require the development server; `TEST_BASE_URL` selects it. External fixture hashes/URLs are pinned in `tests/fixtures/dcc-manifest.json`. The external binaries are cached, not redistributed. Five DCC-exported OBJ poses independently check skinned vertices from Blender and Maya; the Blender morph-character regression catches the numeric-to-named morph binding mismatch fixed in this implementation. These are numerical/functional tests, not independent human visual approval of every material or exporter feature.


## Persistent missing-companion repair

If FBX conversion reports a missing local texture, the editor stores a failed-attempt record separately from accepted assets. After reload, **Repair MODEL: missing FILE** accepts the missing companion, merges it with retained source files, and reruns the same conversion/review pipeline. A failed repair leaves the pending record and last-good asset intact. Successful adoption removes the record; **Discard failed import** explicitly deletes it. This is repair on user-supplied file arrival, not an unrestricted filesystem watcher or network fetch.

Records include SHA-256 source digests, recipe, project ID and the original reimport target/revision. Corrupt bytes, another project, or a changed target cannot silently adopt. IndexedDB schema 2 preserves existing schema-1 stores. At most eight attempts and 4 MB source bytes per attempt are retained; the ninth attempt fails without evicting older recovery data. Small metadata summaries are listed without retaining all source buffers in React state. Retention failure is reported rather than pretending the files were saved. Recovery records are local, evictable working state, **not included in PIF backups**; keep original source files.

Run `bun tests/pending-browser.ts` for real failed-FBX/reload/repair, migration, quota and corruption checks. `bun tests/pending-native.ts` exercises packaged Electron repair; set `TEST_DESKTOP_EXECUTABLE` to the actual binary.
