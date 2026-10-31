# Asset pipeline, asynchronous import and reimport

**Pinefall implementation plan • research date: 2026-10-31 • baseline: 0.5.2 / b8b38af**

> Planning only. This document does not claim these features are implemented. Budgets and API sketches are proposed acceptance criteria, not measured performance or final public contracts.

## Revision record

- **R0 — code audit and initial engine survey:** identified the current baseline and questions below.
- **R1 — detailed design pass:** added researched architecture, proposed contracts, workflows, work packages and acceptance tests.
- **R2 — failure-mode and source-verification pass:** Verified the r185 FBX loader boundary; added importer spikes, dependency invalidation tests, admission control and memory/staging limits.
- **R3 — cross-plan consistency review:** reconciled subsystem ownership, shared identifiers, lifecycle boundaries and the first implementable vertical slice.

Read R1 as the main design, R2 as its research-driven refinements, and R3 as the final integration check. All revisions are planning work performed on 2026-10-31; no engine feature implementation is implied.

## Existing implementation and constraints

GLB input is embedded as base64 in the in-memory scene. Engine.load clears the world and reparses each asset instance. PIF processing is worker-based, but model parsing is not thereby non-blocking.

Inspected integration points: `packages/project/src/index.ts; packages/runtime/src/engine.ts; packages/project/src/pif.ts`. Preserve TypeScript, Bun, Oxlint, Linux/Windows Electron, the WebGL 2 runtime, DOM-free headless simulation and optional UI. Do not disable Electron sandboxing to obtain graphics compatibility. Physical CEDAR and Windows execution require dedicated validation; Xvfb/SwiftShader are not substitutes.

## Scope to design

Import queue, stable identities, dependencies, decoded texture/geometry budgets, companion resources, GLB/FBX, transactional adoption, caching, reimport and schema migration.

## How to use this plan

R1 explains the concepts and selected architecture; R2 records substantive follow-up research, corrections and additional failure cases. Proposed interfaces are design sketches, not existing APIs. Source links support the adjacent technical claims; numerical budgets are Pinefall hypotheses to validate, not upstream engine benchmarks. Resolve the remaining implementation questions through the listed spikes and fixtures before freezing public contracts.

## Shared release rule

No feature is complete because its checkbox exists. Require real behavior, project round trips, script/headless compatibility where applicable, a standalone export check, resource cleanup tests, documentation and an explicit unsupported-feature report. Release numbers are provisional; ship by acceptance gates, not dates.

## R1 — Research-led implementation design

### 1. Why the pipeline must change

An asset is not a filename and importing is not simply calling a loader. Separate four objects: the **source** supplied by the artist; an **import recipe** describing conversion; an immutable **artifact** produced by that recipe; and a **live instance** holding runtime state. Unity documents a similar separation between original files, GUID-bearing import metadata and regenerable artifacts. Adopt the separation, not Unity's exact file format. [1](https://docs.unity3d.com/2023.2/Documentation/Manual/AssetDatabaseCustomizingWorkflow.html)

Godot's import settings survive reimport and source changes trigger regeneration. The useful principle is reproducibility: changing a file should rerun a known recipe rather than guess new settings. Pinefall should preserve original bytes and record every conversion that can affect appearance. [1](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/import_process.html)

**Outcome:** a developer can import a character with textures, instantiate it repeatedly, replace its source, and keep scene references, material overrides and animation references intact. Failure must leave the previous asset usable.

### 2. Proposed data model and ownership

```ts
// Proposed contracts, not existing SDK.
interface AssetRecord {
  id: string;                  // permanent project identity, never a content hash
  kind: 'model' | 'texture' | 'material' | 'audio' | 'shader' | 'prefab' | 'animation' | 'scene';
  displayName: string;
  source: { blobHash: string; relativeName: string; mime: string };
  dependencies: { assetId: string; mode: 'source' | 'artifact' }[];
  recipe: { importer: string; version: number; settings: unknown };
  artifactHash?: string;
  subassets: { id: string; sourceKey: string; kind: string }[];
}
interface ImportJob {
  id: string; projectId: string; sourceRevision: number;
  stage: 'queued' | 'read' | 'inspect' | 'convert' | 'validate' |
         'stageGPU' | 'commit' | 'complete' | 'failed' | 'cancelled';
  bytesRead: number; totalBytes?: number;
}
```

These interfaces omit implementation-specific buffers intentionally. `unknown` settings require importer-specific runtime validation, not an unsafe cast. `relativeName` is a logical label; it is never automatically resolved against arbitrary disk paths.

An asset ID survives a content change. A content hash changes when bytes change. The artifact cache key is a canonical hash of source digest, importer version, normalized recipe, dependency digests and target profile. Record both source dependencies and artifact dependencies; a converter reading raw source must not depend only on the converted output. Unity explicitly distinguishes these dependency kinds. [4](https://docs.unity3d.com/6000.4/Documentation/Manual/UpgradeGuideUnity64.html)

Subassets need persistent IDs for mesh primitives, material slots, skeletons and clips. Importer source identifiers are preferred. A normalized hierarchy path is a fallback, not proof of identity: duplicate names and moved nodes require an explicit matching report. Never silently bind a deleted sword material slot to the next array index.

Ownership rules: the asset store owns original blobs; the artifact store owns immutable conversion output; a runtime resource manager owns GPU allocations; instances own transforms, skeleton pose, animation state and material overrides. A reference-counted lease prevents disposal while an instance or pending replacement still uses a resource. Count leases by owner, not just a global integer, to diagnose leaks.

### 3. Asynchronous transaction algorithm

1. Capture project ID, document revision, target asset ID and recipe; reserve a job ID.
2. Read with byte limits; hash source bytes off the UI thread. Detect type from signatures as well as suffixes. Reject contradictory MIME/signature information.
3. Inspect counts, dimensions, dependencies and unsupported features before expensive allocation.
4. Convert in a worker or dedicated desktop service with memory reservations. Publish stage-level progress; an unknown total is indeterminate, not a fake percentage.
5. Validate the normalized artifact independently of the importer. Check finite bounds, indices, buffer lengths, hierarchy acyclicity and referenced resources.
6. Transfer owned buffers to the runtime staging layer. Create resource batches under a frame budget. Warm shader variants where supported, then validate first use.
7. Recheck project/source generation. Atomically replace the asset record and runtime bindings only if the request is still current. Retain the previous generation until successful adoption.
8. Release old leases, scratch storage and job resources. Report completion only after usable adoption.

Worker communication must specify ownership. Transferring an ArrayBuffer detaches the sender's copy; typed-array views are serializable but their backing buffer is what is transferred. Do not detach the only copy of a source needed for retry or archival storage. [MDN transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)

Cancellation means **no later adoption**, not necessarily instant interruption of a driver call. Check cancellation at stage boundaries and inside chunked loops; terminate an unresponsive conversion worker. Ignore late responses using project/job generations and release their buffers. Do not terminate a shared worker that owns other jobs without explicitly restarting/retrying those jobs.

`parseAsync()` is not evidence that expensive parsing occurs off-thread. Likewise GPU texture upload can still stall. MDN warns that several WebGL queries synchronize with the GPU process; avoid per-frame capability polling and synchronous readbacks. [1](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)

### 4. Import formats and feature policy

| Input | Initial support contract | Explicit rejection/warning |
|---|---|---|
| GLB 2.0 | Meshes, transforms, UV sets, normals, materials; retain skin/clip data for Plan 02 | Required extension without a bundled compatible decoder |
| FBX | Static meshes first; then skinned/animated fixtures and companion textures | Unsupported shader graphs, constraints or animation conversions listed individually |
| PNG/JPEG | Colour or data texture role selected explicitly | Oversized decoded dimensions, not only compressed file size |
| Height/depth maps | Preserve original numeric meaning and declared range | Do not reinterpret camera depth as mesh displacement automatically |
| Compressed textures | Separate capability-gated milestone | No assumption that every GPU supports the same compressed format |

FBX import is a conversion boundary, not a promise to reproduce every DCC feature. Retain source bytes and the conversion report. Normalize units/up-axis once at the model boundary, preserving animation/skeleton consistency; do not bake the same conversion into both root transform and vertices.

Companion-resource UI should list unresolved URI, proposed local match, and ambiguity. Exact relative matches win. Basename-only matches require confirmation when duplicate names exist. Reject absolute paths, traversal, network schemes and case-folding collisions. Blob URLs are session-local implementation details; never serialize them into PIF.

### 5. Editor workflow and reimport semantics

Provide a job panel with queue order, current stage, counts, estimated memory, warnings, retry and cancel. Keep orbit, selection and the current world responsive during conversion. Import preview contains hierarchy, materials, UV channels, skeleton/clip summary and bounds. Allow “import only” separately from “place instance.”

Reimport produces a diff: added/removed nodes, material slots, clips and changed bounds. Existing instance transforms survive. User material overrides remain overrides. Missing clip or prefab references become visible unresolved references; they do not select the first available replacement. Apply the asset update and reference remap as one undoable transaction. Preserve both generations until the undo retention budget permits eviction.

File watching on desktop should debounce bursts and hash after writes settle. Browser import uses explicit file selection/reimport; do not pretend it can monitor arbitrary user folders without the relevant permission/API.

### 6. Integration and persistence migration

Introduce proposed `packages/assets` modules for registry, recipes, jobs, dependency graph, import adapters and resource leases. Keep importer orchestration out of `Engine.load`. Replace base64-bearing scene snapshots with lightweight asset references only after a migration exists. This also stops undo history from duplicating every binary blob.

PIF v2 currently allows a narrow path/type set and small fixed budgets. Adding new asset kinds or a multi-scene registry requires a reviewed container/schema revision, provisionally **PIF v3**, not relaxing v2 validators in place. Preserve source, metadata and required artifacts; label optional caches as regenerable. Every payload remains covered by the integrity inventory. Old formats migrate into a new working copy; they are never overwritten before successful round-trip verification.

### 7. Work packages and release gates

| Package | Deliverable | Gate |
|---|---|---|
| A0 | Timing/memory instrumentation and representative fixtures | Baseline report separates read/parse/decode/upload/compile |
| A1 | Registry, blob store, recipes and migration adapter | Identity/dependency/round-trip tests pass |
| A2 | Cancellable queue and transactional adoption | Cancel/race/retry never replaces a newer scene |
| A3 | Cached GLB import and cloned instances | 100 instances do not parse the same artifact 100 times |
| A4 | FBX converter and companion texture resolver | Fixture matrix passes, losses reported |
| A5 | Reimport diff, remapping and undo | Overrides remain correct after source reorder/delete |
| A6 | Editor polish, CLI import and export integration | Same artifact hash for equivalent supported recipes |

Start with one active heavy conversion on the low profile and two on a stronger profile. These are policy defaults to benchmark, not claims about optimal worker counts. Proposed UI target: input feedback under 100 ms p95 during supported imports; record worst tasks over 50 ms. Main-thread adoption slices target 2–4 ms, but a driver upload is not preemptible. Reject or downsample oversized resources before they enter that stage.

### 8. Verification, risks and completion

Fixtures: tiny valid GLB; textured model; repeated instances; two FBXs from different exporters; skeleton; duplicate material names; missing texture; bad index; huge declared image; decompression bomb; unsupported extension; renamed/deleted clip; cancellation immediately before commit; project closed mid-conversion.

Measure warm/cold import time, worker peak allocation, decoded texture bytes, render resource counts, p50/p95/p99 frame durations and cancellation latency. Test low/high profiles at fixed viewport sizes on physical target machines. The sandbox's SwiftShader result is a correctness smoke test only.

Do not ship A4 merely because a cube loads. A release gate requires a second developer to reimport an edited textured character, retain instance overrides, close/reopen PIF, and run the exported player. Risks still requiring experiments are FBX worker compatibility, cache invalidation granularity and peak memory while old/new generations coexist. Roll back to the last valid generation on conversion/adoption failure; if memory cannot accommodate both, offer an explicit loading transition instead of silently destroying the current world.

### Dependencies

Plan 02 consumes skeleton/clip assets; Plan 03 owns texture/material meaning; Plan 04 consumes stable prefab/subasset IDs; Plan 05 supplies job tracing and ownership diagnostics; Plan 06 owns export dependency closure. None may introduce a second competing asset registry.

## R2 — Importer feasibility, dependency correctness and failure review

### Research finding: FBX is not made worker-safe by `loadAsync`

The actual Three r185 loader calls synchronous `parse` after `FileLoader`, creates `TextureLoader`, keeps parser state in module-level variables, and uses a `window.URL` path for embedded binary images. It also documents unsupported morph/blend-shape normals. This is stronger evidence than relying on an old worker-support issue. The current adapter cannot simply be moved into a worker unchanged. [Three r185 source](https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/jsm/loaders/FBXLoader.js)

**Changed decision:** make an importer feasibility gate mandatory before promising nonblocking FBX. Compare two bounded spikes:

- **Preferred first spike:** isolate a pinned Three importer in a worker, replace browser image loading with dependency descriptors and transferable decoded data, return a normalized artifact rather than a live Three object graph. Any maintained patch must be small, recorded and regression-tested on upgrades. Do not interleave multiple parses through shared module state.
- **Alternative:** evaluate ufbx compiled to WASM with a TypeScript integration layer. Its native API has separate temporary/result allocator limits and allocation-count limits, useful for defensive parsing; those limits are not automatically enforced on image decoding or downstream GPU uploads. [3](https://ufbx.github.io/reference) The upstream project is a C FBX parser, not an already validated drop-in Pinefall WASM converter. Review its exact pinned license, generated glue, build reproducibility and conversion fidelity before choosing it. [ufbx repository](https://github.com/ufbx/ufbx)

Keep all authored engine/orchestration code TypeScript. Third-party C/WASM would be a dependency decision requiring license/provenance evidence, not permission to rewrite the engine in another language. Neither spike has been implemented or timed in this planning task.

**Spike fixtures:** ASCII/binary FBX, embedded/external images, duplicate texture basenames, centimetre/Z-up export, negative scale, skinned character with multiple clips, malformed array counts, missing textures and cancellation during decode. Measure UI frame latency and peak process memory, not just worker duration. Reject an importer that achieves responsiveness by doubling unbounded memory. If neither candidate passes, ship honest “FBX conversion unavailable for this build” rather than blocking the renderer behind an async function.

### Research correction: source versus artifact dependencies

Use Unity's versioned 6.4 upgrade guide and API documentation, not an unverified redirected URL. A source change that leaves an artifact identical need not invalidate artifact-only consumers, but raw-source readers must still rerun. [3](https://docs.unity3d.com/6000.4/Documentation/Manual/UpgradeGuideUnity64.html) [1](https://docs.unity3d.com/ScriptReference/AssetImporters.AssetImportContext.DependsOnSourceAsset.html)

New test: A imports B's artifact and C reads B's raw bytes. Change B's irrelevant source metadata without changing its artifact; A stays cached, C reruns. Change B's artifact; both relevant consumers rerun. Detect dependency cycles before scheduling and bound retries if an importer discovers new dependencies mid-conversion. Missing dependencies remain recorded so adding the file later can repair the import.

### Admission control and staged adoption refinement

Reserve estimated memory before starting, with one heavy import by default on low profile. Track source bytes + conversion heap + output buffers + decoded images + old/new live generations, not only the archive size. Existing PIF v2 limits remain 16 MiB compressed, 40 MiB decoded archive, 64 MiB XZ dictionary and 100 entries; a v3 design must establish revised limits from measured peak memory rather than blindly increasing them.

A 4096×4096 RGBA8 image is 64 MiB before mipmaps, approximately 85.3 MiB with a complete mip chain, and may coexist with source/decode copies. Ten small compressed PNGs can therefore exceed a low-end GPU budget. Initial recipe proposes a 2048 dimension ceiling for the low profile unless the user explicitly opts into a higher limit. This is an engine policy, not a claim about the device's maximum texture size.

Propose a 2 ms CPU staging slice per rendered frame and a warning for any import-attributable main-thread task over 50 ms. Individual GPU allocations/uploads cannot always be preempted to meet that slice. Subdivide artifacts, downscale before upload and delay expensive optional resources; report remaining first-use stalls. A cancellation acknowledgment target of 250 ms applies to the host UI/job state, not a promise that every driver call stops in that time.

### Shared contract and implementation seams

Use `{projectId, documentRevision, operationId, generation}` on jobs and diagnostics. A reimport commits against the target asset generation, not only the global document revision: unrelated camera edits should not discard hours of conversion, while a changed recipe/source must invalidate adoption. Reconcile scene overrides against the new artifact before the atomic asset swap.

Implementation sequence in current code: add blob/asset references alongside `packages/runtime/src/schema.ts`; teach `packages/project/src/index.ts` and `pif.ts` to translate legacy data; create the asset service; move decoding out of `packages/runtime/src/engine.ts`; finally remove base64 snapshots after migrations and undo pinning pass. Editor handlers in `packages/editor/src/main.tsx` become service clients, not import engines. Headless receives metadata/geometry needed for collision, never a dependency on DOM image elements.

### Exit review and unresolved decisions

A1–A3 must land before material/audio import makes the archive schema wider. Decide parser backend, source-retention policy, texture codecs and low-memory limits from the spike report. Build a fixture manifest with author/license, expected feature count, expected conversion warnings and expected failure code. Required fault injection: worker crash, stale completion after project close, cancelled GPU staging, full cache disk, dependency deletion and schema downgrade. Preserve the original and last good artifact in every failed replacement. Exported players consume cooked artifacts; they do not parse FBX on their first gameplay frame.


## R3 — Final integration check

The asset registry explicitly includes material and scene asset kinds so Plans 03/04 do not require untyped side channels. The importer owns source conversion, not simulation or renderer settings. Before coding, freeze the normalized artifact schema, lease interface, job cancellation protocol and PIF migration fixtures together. Start with one GLB fixture through the complete pipeline before widening supported formats.

### Companion plans

- [Animation, character presentation and audio](02-ANIMATION-AUDIO.md)
- [Materials, textures, lighting, shaders and post-processing](03-MATERIALS-GRAPHICS.md)
- [Reusable gameplay, prefabs, components and scene lifecycle](04-GAMEPLAY-AUTHORING.md)
- [Debugging, profiling, recovery and editor quality of life](05-DEBUGGING-RELIABILITY.md)
- [Game export, input, save games, security and production readiness](06-SHIPPING-DEVELOPER-READINESS.md)


## Implementation checkpoint — 2026-10-31 (unreleased)

An end-to-end first slice now exists; the plan itself remains the target, not a
claim that all gates are complete. See [implementation log, research corrections,
tests and remaining A0–A6 gates](../ASSET-PIPELINE-IMPLEMENTATION.md). In particular,
reference-only documents/persistent artifact storage and full dependency invalidation,
DCC fidelity/normalization, complete subasset conflict UX and physical hardware
acceptance are still open. Do not mark Plan 01 fully implemented from this checkpoint.

## Continuation checkpoint — 0.5.4 candidate

Implemented SHA-256 reference working documents, persistent IndexedDB source/artifact/cache/recovery storage, named-source/recipe conversion identity, current model/source/entity dependency semantics, and explicit material/clip identity remapping. PIF remains portable v3. Verified tests and outstanding gates are listed in `../RELEASE-0.5.4.md`; do not infer full Plan 01 completion or publication from the version bump. Plan 02 has not started.
