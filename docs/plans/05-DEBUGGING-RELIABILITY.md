# Debugging, profiling, recovery and editor quality of life

> Historical release, design or acceptance record: retain the results and limits of its stated checkpoint. For current implementation and downloads, see [current status](../CURRENT-STATUS.md).

**Pinefall implementation plan • research date: 2026-10-31 • baseline: 0.5.2 / b8b38af**

> Planning only. This document does not claim these features are implemented. Budgets and API sketches are proposed acceptance criteria, not measured performance or final public contracts.

## Revision record

- **R0 — code audit and initial engine survey:** identified the current baseline and questions below.
- **R1 — detailed design pass:** added researched architecture, proposed contracts, workflows, work packages and acceptance tests.
- **R2 — failure-mode and source-verification pass:** Verified Khronos WebGL 2 query behavior and IndexedDB durability; added query bounds, journal chaining, source-map integration and hang limitations.
- **R3 — cross-plan consistency review:** reconciled subsystem ownership, shared identifiers, lifecycle boundaries and the first implementable vertical slice.

Read R1 as the main design, R2 as its research-driven refinements, and R3 as the final integration check. All revisions are planning work performed on 2026-10-31; no engine feature implementation is implied.

## Existing implementation and constraints

There are bounded logs, FPS/render statistics, exception isolation, snapshot history and local recovery data. These are not a source-mapped debugger, GPU profiler, transactional backup system or complete memory profiler.

Inspected integration points: `packages/runtime/src/events.ts; packages/runtime/src/behavior-safety.ts; packages/editor/src/history.ts; desktop/main.ts`. Preserve TypeScript, Bun, Oxlint, Linux/Windows Electron, the WebGL 2 runtime, DOM-free headless simulation and optional UI. Do not disable Electron sandboxing to obtain graphics compatibility. Physical CEDAR and Windows execution require dedicated validation; Xvfb/SwiftShader are not substitutes.

## Scope to design

Source-mapped errors, runtime inspection, pause/step, overlays, CPU/GPU attribution, bounded traces, memory ownership, command registry, undo transactions, journals and migrations.

## How to use this plan

R1 explains the concepts and selected architecture; R2 records substantive follow-up research, corrections and additional failure cases. Proposed interfaces are design sketches, not existing APIs. Source links support the adjacent technical claims; numerical budgets are Pinefall hypotheses to validate, not upstream engine benchmarks. Resolve the remaining implementation questions through the listed spikes and fixtures before freezing public contracts.

## Shared release rule

No feature is complete because its checkbox exists. Require real behavior, project round trips, script/headless compatibility where applicable, a standalone export check, resource cleanup tests, documentation and an explicit unsupported-feature report. Release numbers are provisional; ship by acceptance gates, not dates.

## R1 — Research-led implementation design

### 1. What the tools must answer

The editor must help distinguish five questions: what failed, which authored source caused it, what is slow, who still owns memory, and how to recover work safely. FPS alone answers none of them. Godot's profiler distinguishes inclusive time from a function's own time, while its debugging tools separate inspectors, monitors and profilers. Adopt that separation instead of adding every number to one noisy overlay. [1](https://docs.godotengine.org/en/stable/tutorials/scripting/debug/the_profiler.html)

The current behavior wrapper catches synchronous exceptions and rejects asynchronous hooks; it is not a sandbox and cannot interrupt an infinite loop. The current history stores bounded full snapshots measured by string length; it is not byte-accurate command history. Keep these limitations visible until replaced.

### 2. Diagnostic envelope and source mapping

```ts
// Proposed internal diagnostic; not a serialized scene component.
interface Diagnostic {
  version: 1;
  severity: "info" | "warning" | "error";
  subsystem: "script" | "asset" | "physics" | "render" | "project" | "platform";
  code: string;
  message: string;
  operationId?: string;
  entityId?: string;
  assetId?: string;
  source?: { scriptId: string; revision: string; line: number; column: number };
  count: number;
  firstSeen: number;
  lastSeen: number;
}
```

Use stable bounded codes for metric labels. Entity IDs and full paths belong in bounded event payloads, never unbounded metric dimensions. Redact personal paths, tokens, source contents and save data before support export; preview the resulting bundle for consent.

Compiler outputs must retain a source map and stable virtual filename keyed by script ID and content hash. Composition matters: TypeScript transform, engine wrapper and bundle transform each move source positions. A fixed line subtraction is not a robust source-map implementation. Test multi-line imports, comments, injected wrappers and minification. Retain map/source pairs for the active revision plus a small bounded history; an old stack must never open a new revision at a plausible but wrong line.

Capture syntax/type diagnostics separately from runtime errors and host failures. Preserve the original error cause/stack where safe. Error grouping keys include subsystem, code, source revision and normalized top frame; repeated failures increment a count instead of allocating one console row per frame.

### 3. Runtime inspector, pause and stepping

Maintain two explicit inspection targets: authored document and live runtime. Runtime edits are temporary unless the user deliberately invokes “Apply supported changes to scene.” Keep transform/physics writes at engine synchronization boundaries, not direct React updates in the middle of a tick. Invalid or read-only properties should explain why they cannot be changed.

Pause freezes simulation ticks and graph events but leaves editor UI responsive. Single-step advances one fixed tick through the authoritative Plan 04 ordering and then renders. Rendering interpolates with a defined value during pause. Audio uses the Plan 02 pause policy rather than continuing an invisible scene indefinitely. Input is frozen/cleared according to whether the user steps with a recorded snapshot or live input.

Phase one is engine pause/step plus source-mapped errors. JavaScript line breakpoints require deliberate Chromium DevTools Protocol integration and source-map testing; do not label phase one a complete language debugger. Trusted scripts can access live objects today, so a safe remote object inspector must whitelist properties and avoid invoking arbitrary getters or evaluating expressions by default.

### 4. CPU profiler design

Use `performance.now()` around engine phases: input, scripts, animation, physics, event dispatch, scene reconciliation, render submission and editor updates. A nested span tree computes inclusive versus exclusive times without double-counting children. Sample detailed per-script spans only when recording, and cap recursion/span count.

Store a ring of frames and aggregate p50/p95/p99, minimum/maximum and sample count over a declared window. Display slow-frame events with correlated import/reimport/GC observations. GC pauses are not accurately attributable from a simple timer around a script; label unknown/unattributed gaps honestly.

Provisional budgets: normal telemetry under 1% CPU overhead in the reference workload; detailed recording under 5% or an explicit warning; 1200 frame summaries and a 16 MiB detailed-trace cap with dropped-event counters. Measure both instrumented and uninstrumented builds. Never promise these costs without a paired benchmark.

### 5. GPU and memory investigation

CPU render submission time is not GPU completion time. WebGL timer queries are asynchronous; unavailable extensions produce `GPU time: unavailable`, not a fake estimate. MDN distinguishes the WebGL 1 extension API from the WebGL 2 query API. [2](https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query)

First record whole-frame GPU samples with a bounded delayed query queue. Then support non-overlapping pass samples, avoiding invalid nested elapsed queries. Context loss invalidates pending measurements. Label samples with frame ID, render resolution, profile, render-pass count and missing/disjoint status.

Resource tracking is ownership accounting: asset cache bytes, decoded CPU geometry/image bytes, estimated GPU textures/targets/buffers, audio buffers, pools, workers, object URLs, listeners and active voices. `renderer.info` counts are useful but are not total process or driver VRAM. Maintain allocation IDs, owner scope, size estimate, acquire/release traces in detailed mode and before/after scene snapshots.

Memory tests compare settled snapshots after warm-up rather than expecting every cache to return immediately to zero. Shared caches and driver pools retain memory intentionally; leaks are unbounded growth or orphaned ownership. Keep JS heap, process RSS and estimated GPU memory separate. Raw GPU memory figures are often unavailable; never rename an estimate as measured VRAM.

### 6. Commands, transactions and history

Introduce a command registry used by menus, toolbar, shortcuts and command palette. Each command supplies enablement reason, validation, execution and undo semantics. One drag is one coalesced transaction, not 200 independent history entries. Selection/view changes are editor state; define whether they enter history rather than mixing them unpredictably with document edits.

Commands generate forward/reverse patches against stable IDs and a document revision. Before commit, validate references, hierarchy invariants and schema. Publish one document change and one runtime reconciliation request. A failed compound command rolls back completely. Imports include external resource leases pinned by history entries so undo can restore old data without a stale cache reference.

Replace character-count accounting with UTF-8/binary byte estimates and pinned-resource accounting. Propose a 32 MiB configurable undo budget initially, with oldest-entry eviction and clear reporting of large operations. A large import may require a checkpoint rather than an enormous reverse patch. History truncation must release its resource pins.

### 7. Recovery, backups and migration

A recovery journal is not a substitute for an explicit `.pif` save. Use a checkpoint plus sequential validated command records containing project ID, base revision, command schema/version, sequence, payload and checksum. Flush asynchronously with bounded batching; display the most recent recoverable revision. Recovery is a user-confirmed branch, not an automatic overwrite of the original.

Native save procedure: capture a coherent document revision; serialize/compress in a worker; validate output; write a temporary sibling file; complete platform-specific flush/replace; retain a previous known-good generation; then acknowledge the saved revision. If the user edits during compression, only the captured revision is marked saved. Native durability and Windows replacement behavior need tests, not a blanket claim of atomicity on every filesystem.

Migration functions are pure version-to-version transforms followed by validation. Never modify the only original archive in place. Present a summary and compatibility warning; save the migrated copy under explicit consent. Unknown future versions fail closed with useful reader/version information. Preserve metadata and integrity semantics from PIF v2; changed bytes require new hashes, not copied old proof.

### 8. Quality-of-life workflows

Add searchable command palette, shortcut conflict view, focus-safe shortcuts, hierarchy filtering, multi-select inspector, entity breadcrumbs, frame-selection, diagnostic click-to-source and import task panel. Operations that mutate multiple entities preview count and unsupported targets. Persist layout/preferences separately from portable game content; provide a safe “reset layout” entry if a panel disappears off-screen.

Project open/close, Play/Stop and crash recovery should ask only when genuinely necessary. A busy save can be cancelled without destroying the active document. A long task displays phase, bounded progress or indeterminate status, cancel availability and memory pressure—not a fabricated linear percentage.

### 9. Implementation and acceptance

| Stage | Delivery                                      | Failure injection                                      |
| ----- | --------------------------------------------- | ------------------------------------------------------ |
| DR0   | Diagnostic envelope/source maps               | Syntax error, runtime throw, stale source revision     |
| DR1   | Live inspector/pause/step                     | Mutation during physics/event dispatch                 |
| DR2   | CPU frame tree and GPU query adapter          | Missing extension, disjoint, context loss              |
| DR3   | Ownership ledger and resource scopes          | 100 open/play/stop/reimport cycles                     |
| DR4   | Transaction commands and byte-bounded history | Partial failure, undo after source deletion            |
| DR5   | Journal/checkpoint/recovery/migrations        | Truncation, disk full, process kill at each save phase |

Completion requires a developer to locate a seeded script error, identify a GPU-heavy versus CPU-heavy scene correctly, find a deliberately leaked resource, undo an import, and recover an interrupted edit session. Headless tests cover transaction/migration/simulation order; graphical/native tests cover inspector/source links/GPU and disk behavior. Avoid claiming that a passing browser-only test proves Windows file durability.

## R2 — Verified GPU timing, recovery durability and bounded diagnostics

### GPU profiler implementation correction

The authoritative WebGL 2 extension is `EXT_disjoint_timer_query_webgl2`. Queries are core WebGL 2 objects: `createQuery`, `beginQuery(ext.TIME_ELAPSED_EXT, q)`, `endQuery`, and later `getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)`. Read `QUERY_RESULT` only when available and `GPU_DISJOINT_EXT` is false. Results are nanoseconds; do not truncate them with 32-bit bitwise arithmetic. The Khronos example deletes queries on completion or disjoint status. [Khronos WebGL 2 timer specification](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)

**Changed acceptance:** forbid busy-waiting and same-task synchronous result collection. Return to the browser event loop and poll on later frames. A single later animation frame is not guaranteed to suffice. Centralize disjoint-state handling, invalidate the affected in-flight batch conservatively, and record a missing sample instead of a zero-duration frame. Limit pending queries to 16 initially; if the GPU falls behind, skip measurement rather than allocate indefinitely. A stale query expires after a configurable frame/time window and is deleted without blocking.

Use either whole-frame or non-overlapping elapsed-pass measurements for a recording interval; do not nest active TIME_ELAPSED queries. Timestamp support must be checked separately before relying on it. During context loss, drop all old-context references and increment the profiler generation. Unit tests use a fake delayed query adapter; real-device checks verify API behavior and overhead.

### Compiler and hang-recovery refinement

The current `packages/scripting/src/compiler.ts` uses Sucrase TypeScript/import transforms and returns `.code`; it does not currently preserve maps or perform editor semantic typechecking. Extend its return type deliberately to `{code,map,sourceRevision,diagnostics}` and update callers in `packages/scripting/src/runtime.ts` and editor scripting UI. Add a worker-based TypeScript diagnostic service separately; don't relabel syntax stripping as typechecking.

An exception wrapper can disable a repeatedly failing hook, but it cannot regain control from a synchronous infinite loop in the same renderer. Use a separately supervised Play renderer/process as a later isolation milestone if robust Stop-on-hang is required. A watchdog in that same blocked event loop is ineffective. Desktop main-process supervision may offer terminate/recover, with the authored document journal kept outside the hung play process. Browser exports retain a clearly stated limitation until a compatible execution architecture exists.

### Journal sequencing and browser durability correction

A checksum proves a journal record's bytes are consistent, not that its preceding records exist. Each record needs sequence, base/result revision and previous-record digest. Recover only the longest valid prefix from a verified checkpoint. A corrupt record stops replay; never skip it and apply later commands against the wrong document. Compaction writes and verifies a new checkpoint before replacing the old journal, preserving the old generation until completion.

IndexedDB request success is not transaction completion. Resolve a save only on `transaction.oncomplete`; handle error/abort and do expensive compression/hashing **before** opening the short write transaction. MDN documents transaction lifetimes and relaxed durability behavior. [1](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction) For critical saves, request `durability: 'strict'` where supported, but identify it as a browser durability hint rather than an absolute power-loss guarantee. [2](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability)

Desktop durability has distinct steps: write, flush file, replace/rename within the intended filesystem, and relevant directory flush where supported. Test Windows sharing violations/antivirus locks and Linux interruption rather than assuming POSIX behavior everywhere. Preserve the previous valid generation when any step fails. A successful UI message includes the saved revision; edits after that revision remain dirty.

### Local SLOs and diagnostics cardinality

Use operational targets appropriate to a local engine, not cloud-scale telemetry labels:

- **Responsiveness:** p95 input-to-editor-response under 100 ms on the reference task, plus count of main-thread stalls over 50 ms.
- **Import reliability:** success/failure/cancel by bounded importer/stage/error code; conversion times and peak memory recorded per bounded operation trace.
- **Save integrity:** no observed loss of the last acknowledged valid generation across the specified injected-failure matrix; report the number of tested interruption points, not “100% durable.”
- **Resource stability:** settled live resources plateau over 100 cycles, with cache/pool caps and unexplained-growth alerts.

Proposed local caps: 5,000 aggregated diagnostic rows or 8 MiB, whichever first; 16 MiB active detailed trace; rotated native logs capped at 20 MiB total. Truncate oversized messages/stacks safely and count dropped/coalesced records. An error storm must not itself freeze the app. Correlate project operation IDs across renderer/worker/main boundaries while keeping high-cardinality IDs out of metric series.

### Expanded gates and rollout

First land diagnostics/ownership primitives needed by every other plan; visible debugger polish may arrive later. Keep snapshot undo as a fallback while transaction commands roll out command-by-command. Never mix snapshot rollback and patch rollback for one operation without an explicit adapter. Migration of recovery journals is separate from project-file migration; an old unreadable recovery record should be offered as a preserved diagnostic copy, not silently deleted.

Add tests for astral Unicode byte accounting, huge error messages, repeated identical failures, clipboard/shortcut focus, journal sequence gaps, checksum-valid but schema-invalid data, out-of-order save completions, renderer hang, missing GPU timer support and disjoint invalidation. Privacy tests seed fake credentials/paths into diagnostics and verify redacted support export. No logs or source files are uploaded automatically.

Unresolved implementation choices: source-map library and wrapper mapping strategy, Play process isolation cost, native checkpoint replacement protocol and default trace retention. Each needs an architecture decision and measured prototype before the corresponding gate is marked complete.

## R3 — Final integration check

Document revision, asset generation and simulation tick are different identifiers and must not share one overloaded counter. Recovery checkpoints capture document state; player saves capture game-defined simulation state; neither is a dump of diagnostic runtime objects. Land the diagnostic envelope, ownership scopes and operation correlation before major import/render features, then progressively replace snapshot history with commands under parity tests.

### Companion plans

- [Asset pipeline, asynchronous import and reimport](01-ASSET-PIPELINE.md)
- [Animation, character presentation and audio](02-ANIMATION-AUDIO.md)
- [Materials, textures, lighting, shaders and post-processing](03-MATERIALS-GRAPHICS.md)
- [Reusable gameplay, prefabs, components and scene lifecycle](04-GAMEPLAY-AUTHORING.md)
- [Game export, input, save games, security and production readiness](06-SHIPPING-DEVELOPER-READINESS.md)
