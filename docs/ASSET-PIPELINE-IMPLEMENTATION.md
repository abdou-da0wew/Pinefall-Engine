# Asset pipeline implementation work log

Started 2026-10-31 against d3b9cde. This is implementation of Plan 01, not release authorization.

## Execution sequence (written before source edits)

1. Harden GLB admission before loader allocation: required extensions, buffers/accessors, hierarchy, embedded images, decoded budgets and deterministic inspection reports. Preserve existing small project limits until larger bounds have evidence.
2. Build a one-heavy-job worker queue with abort/timeout/error cleanup, operation IDs and stage timing. GLB parsing/image decoding run in the worker; transfer a normalized Three scene representation and ImageBitmaps, not a live object graph. Yield during host reconstruction.
3. Cache loaded prototypes by content, clone rigs with SkeletonUtils, stage before replacing the active world, and explicitly dispose shared resources versus instance skeletons.
4. Integrate cancellable editor import/reimport with latest-document rebasing and stable asset IDs. Add provenance/source/artifact hashes and explicit conversion reports. Preserve transforms on reimport.
5. Extend PIF only under a reviewed v3 branch for added provenance/source payload, retain v1/v2 readers/writer compatibility where no v3 data is needed. Test tampering and source retention.
6. Investigate Three r185 FBX in a disposable worker. Register an ImageBitmap texture handler instead of using DOM ImageLoader; scope the window/URL compatibility adapter to the worker. Never enable network resource loading. Export supported conversions to a self-contained GLB; reject missing/ambiguous companions and report conversion losses. Do not claim full FBX fidelity from one fixture.
7. Run Bun tests, TypeScript/Oxlint, production worker build, browser fixture/race/cancellation tests and desktop checks where available. Document unfinished Plan 01 gates explicitly.

## Research notes

- Three GLTFLoader uses ImageBitmapLoader when supported; bitmaps need explicit lifetime management: https://threejs.org/docs/pages/GLTFLoader.html
- Installed r185 ObjectLoader has a five-argument parseObject and internal skeleton rebinding, unlike the installed r187 declarations. Align runtime and type package versions before using this interface.
- r185 GLTFExporter supports OffscreenCanvas and worker FileReader. r185 FBXLoader offers LoadingManager texture handlers, allowing a scoped adapter without a vendored loader fork; embedded textures still access window.URL.
- OffscreenCanvas.convertToBlob is worker-capable: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/convertToBlob
- Plan budgets are proposed safety ceilings, not measured performance. Browser worker execution does not eliminate GPU upload/compile stalls or make decoder memory perfectly preemptible.

## Status

The first end-to-end implementation is validated as listed below. Remaining Plan 01 gates are explicitly open; no release or physical-GPU performance claim is made.

## Implemented and verified in this working tree

- Pinned Three runtime and matching declarations to r185; no loader fork or new native importer dependency.
- `packages/assets/src/glb.ts`: independent allocation admission, chunk/buffer/accessor bounds, finite float scans, node cycles/depth, required-extension rejection, embedded PNG/JPEG dimension checks and resource ceilings. Sparse/compressed formats are explicit unsupported cases.
- `fbx.ts`: ASCII declared-array limits and binary node/property/array bounds; streaming zlib expansion checks precede the upstream synchronous decompressor. These safeguards do not constitute a complete FBX validator or an OS-enforced worker heap limit.
- `jobs.ts`: bounded FIFO queue, one active heavy worker, cancellation, timeout, crash/message-error cleanup and stage IDs/timing. No network texture resolver or Electron security relaxation.
- Worker GLB parse/image decode → transferable geometry buffers/ImageBitmaps → time-sliced geometry reconstruction. Scene graph/material/skeleton rebinding remains a bounded synchronous host step. Explicit bitmap/shared-resource disposal.
- Runtime prototype cache, owner-tagged leases, SkeletonUtils cloning, per-instance skeleton disposal, cache counters, LRU eviction of unleased entries and memory ceiling. Preparation precedes outgoing-world teardown. Texture uploads are yielded between slices; shader warm-up uses compileAsync. Individual upload/compiler calls and final scene adoption are not preemptible.
- Editor import-only/place/cancel/report/reimport; latest-document rebasing preserves unrelated edits; project switches cancel outstanding imports; stale target revisions reject. Stable asset IDs and conservative named material/clip matching. No invented identity match for unnamed/reordered entries.
- Source/recipe/report/hashes preserved in PIF v3 separate files, with v1/v2 compatibility and existing integrity/trust semantics. Original file bytes retained. GLB CLI import/reimport uses the same inspection/provenance/adoption logic.
- History interns asset/source strings across snapshots, counts UTF-8 bytes, bounds retention and releases unused entries. The authored scene compatibility schema still carries data URIs.

## Research-driven corrections made during implementation

1. Runtime/type Three revisions differed. Aligned them; avoided relying directly on the declarations' outdated internal parseObject signature by using ObjectLoader's supported parse entry with staged geometry/image hooks.
2. Vite transforms a literal `new Worker(new URL(...))`, not an arbitrary URL passed into a helper. The initial production build exposed raw TS; changed to worker factories and verified separately bundled production workers in Electron.
3. Source.getDataURL is unsuitable for transferring worker ImageBitmaps. Preseeded serialization image metadata and transferred bitmaps explicitly; retained them until resource eviction so context recreation can reuse them.
4. FBXLoader supports LoadingManager texture handlers. Used worker-local ImageBitmap handling and a narrow window.URL compatibility object, not DOM emulation or sandbox disabling.
5. Three's binary FBX parser inflates arrays synchronously. Added bounded expansion preflight instead of assuming worker termination alone prevents memory exhaustion.
6. Khronos accessor layout requires component-size and stride alignment; added checks and finite binary float validation. Source: [glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).
7. Renderer warm-up is not a zero-stall promise. Used documented `initTexture` and `compileAsync` while keeping hardware-dependent limitations explicit. Source: [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).

## Test evidence

- Bun suite: **59 tests / 225 assertions**, all passing at the recorded checkpoint.
- TypeScript and Oxlint: pass, no warnings/errors.
- Production Vite build: pass; pre-existing large shared-chunk warning remains.
- New browser suite: worker inspection, one parse for 100 placed instances, reload reuse,
  100 scene-load/unload cycles with stable parse/lease counts, failed-load preservation,
  spawn/destroy ownership, latest-load wins, queued/immediate/active cancellation,
  independent skinned clones and preserved clips, transferred PNG texture,
  authored ASCII/binary FBX fixtures, companion image conversion, missing/ambiguous
  companions rejected, editor import and reimport.
- Existing runtime browser suite: pass (spawn/Stop restoration, camera rigs, movement,
  script isolation). Existing PIF browser suite: pass (save/open/trust/cancel/corruption).
- Existing creation workflow: updated file-picker selector and passed actual import,
  Play/Stop and a freshly exported standalone game loading cooked model assets.
- Production Linux Electron smoke: GLB import, renderer adoption, Play/Stop and native
  PIF v3 binary save/readback passed under Xvfb/SwiftShader. Expanded native FBX
  coverage is recorded after the final run below.
- Initial native Play test encountered a previous test's saved scripted project;
  isolated the test with a new blank game rather than bypassing script trust.
- Initial development PIF test encountered Vite's dependency-reoptimization reload;
  rerun passed. This is not counted as evidence that all dev reload races are solved.

## Remaining Plan 01 gates — do not mark the full plan complete

| Area | Remaining work |
|---|---|
| A0 | Physical CEDAR/Windows and representative maximum-budget latency/peak-memory measurements; no p95/zero-stutter claim from tiny fixtures |
| A1 | Reference-only authored/runtime documents, persistent content-addressed blob/artifact database, complete source-vs-artifact dependency graph and invalidation |
| A2 | Strict process-wide memory reservation/admission and rollback after failures during final non-asset world construction; worker heap usage is not OS-capped |
| A3 | Scene graph/material adoption batching beyond geometry/texture slices; shader/context-loss and cache-pressure stress matrix on physical GPUs |
| A4 | Two real DCC exporter character fixtures, unit/axis normalization recipes, broad animation/morph fidelity checks, embedded FBX texture corpus and CLI FBX conversion |
| A5 | Full source-node/mesh/skeleton identity remapping, interactive conflict/diff UI and material overrides (those component systems do not yet exist) |
| A6 | Desktop file watching, persistent cache invalidation/export cooking keyed by all dependencies, second-developer acceptance |

This is a substantial end-to-end first implementation, **not completion of every Plan 01 gate**.
Keep the feature unreleased until these remaining requirements are resolved. No source push,
release tag or artifact publication was performed by this implementation task.


## Final verification checkpoint

Production Electron validation was rerun after the final worker changes and passed
both GLB **and binary FBX** import, renderer adoption, Play/Stop, and PIF v3 save.
The full new browser suite passed again after 100-cycle and active-cancel additions.
CLI `new → import → verify-pif --require-integrity` produced a verified PIF v3;
`authenticated: false` was correctly retained. Native test launch uses test-only
`--no-sandbox` under Xvfb; production BrowserWindow sandbox settings were not changed.
No Windows execution, physical CEDAR test, signing or publication took place.

## Release authorization update — 0.5.3

After the implementation checkpoint, the owner explicitly authorized publication and established the release-after-major-update workflow in `docs/RELEASE-WORKFLOW.md`. The earlier “unreleased/no publication” statements describe the implementation phase, not the current authorization. Release 0.5.3 packages this first slice with all remaining gates still disclosed.

Release-preparation evidence for 0.5.3: Linux AppImage/Windows ZIP built; the asset
suite (including binary FBX) and existing PIF native suite passed against the
packaged Linux executable. The new Asset Pipeline sample verifies as PIF v3 with
source provenance. Publication is authorized by the owner; public verification is
reported separately after upload rather than assumed from the local build.

## Superseding 0.5.4 continuation evidence

The A1 reference-document/persistent-storage work and material/clip remap portion of A5 now have implementation and tests. See `RELEASE-0.5.4.md` for exact scope, limits and the remaining gates; the historical table above describes the 0.5.3 baseline. Current evidence: 64 tests / 250 assertions, typecheck/lint/build, real IndexedDB recovery/corruption/injected-quota/cache/reload tests, browser regressions, fresh standalone export, and packaged Linux native tests. Windows packaging passed, execution untested. No physical-GPU or broad DCC acceptance claim.

## 0.5.5 transactional adoption and admission

Final entity/physics/hierarchy/model construction now stages separately from the live world, yields during entity construction, and rolls back on injected physics/clone failures. A shared conservative asset ledger accounts for source-pool allowance, workers, model decode/prototypes, clones and old/new world coexistence; this is not measured or OS-enforced process memory. Pressure and 100-cycle release tests pass. Exact scope and still-open A0–A6 implementation/acceptance gates are in `RELEASE-0.5.5.md`. The plan is not complete.
