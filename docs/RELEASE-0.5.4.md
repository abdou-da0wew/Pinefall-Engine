# Pinefall Engine 0.5.4 — Persistent asset recovery and reviewed reimport

> Historical release, design or acceptance record: retain the results and limits of its stated checkpoint. For current implementation and downloads, see [current status](CURRENT-STATUS.md).

**Plan 01 continuation checkpoint, not full Plan 01 completion.** Plan 02 has not started. Publication requires authenticated upload/verification; preparing this file does not establish a public release.

## Changes

- Asset-bearing editor/runtime working documents use scene v2 SHA-256 references. Transform/history edits no longer duplicate embedded binary payloads. Already verified session references are not rehashed on each edit.
- Immutable content-addressed session blob storage: 64 MiB admission limit, 8 MB single-blob limit, hash-verified atomic inventory admission. Explicit cache/undo cleanup retains the active document.
- IndexedDB stores source/cooked blobs, conversion artifacts and current/previous recovery checkpoints. Writes acknowledge transaction completion; previous recovery survives an aborted write. Cold recovery verifies blob hashes, rejects missing/corrupt content and can fall back to the previous checkpoint.
- Legacy localStorage migration removes the old backup only after a committed checkpoint. Total recovery failure leaves existing storage intact and blocks automatic replacement until a new project is created/opened. Browser storage remains evictable: **save portable PIF backups**.
- Conversion cache keys include named source/companion hashes, canonical recipe properties, pinned Three/importer identity and target profile. Cache corruption is a miss, not permission to load unchecked data. Cache is bounded to 32 artifacts / 64 MiB; checkpoint blobs are retained separately.
- Source-vs-artifact dependency graph with cycle/missing-input checks. The editor reports placed-model consumers affected by changed cooked output. This is the current model/source/entity graph, not a complete future material/prefab dependency scheduler.
- Structured reimport review replaces the blind confirmation: before/after node/vertex counts, source count, changed output and explicit material/clip identity choices. Rename mapping preserves IDs; duplicate/foreign mappings fail. Target revision/project checks still prevent stale commits.
- PIF worker transport carries verified blob inventories. Portable JSON/prefab export expands references; PIF still contains separate source/artifact files and never requires the local database.

## Compatibility and bounds

PIF format remains v3 with provenance, v2 without it; v1/v2/v3 remain readable. Portable scene JSON remains v1. **Internal scene v2 reference documents are not portable backups.** Scripts still require explicit trust; embedded hashes are not signatures. No new sandbox bypass or production GPU flags were introduced.

Existing 4 MB source selection, 2 MB cooked GLB and 2048px image ceilings remain. Working projects have an 8 MB decoded source-plus-artifact budget (repeated source/artifact uses count), with at most 100 unique blobs per hydration/worker inventory. Session storage is separate from the prototype cache and decoder/GPU allocations: these limits are not a process-wide hard memory cap. One origin-local recovery timeline is supported; concurrent editor windows are not a collaboration system.

## Verified for this candidate

- TypeScript and Oxlint: pass, zero lint warnings/errors.
- **64 Bun tests / 250 assertions**, all pass.
- New real Chromium IndexedDB tests: cold hydration, current-to-previous recovery, injected quota failure/transaction abort, retained checkpoint, corrupted/missing blobs, persistent conversion hit and editor reload in a new JS context. The quota test injects a storage exception; it does not fill the machine's disk.
- Worker/cache browser tests: 100 instances, load cycles, rig/texture fixtures, cancellation, FBX and editor structured-reimport UI.
- Runtime and PIF browser regressions pass. Fresh standalone export and creation workflow pass.
- Linux AppImage and Windows ZIP built. Packaged Linux executable passes native GLB/binary-FBX import, Play/Stop and PIF save/readback under Xvfb/SwiftShader.
- Windows execution and physical CEDAR GPU performance **not tested**. Software rendering is not proof of hardware acceleration. Binaries are unsigned; the large shared-bundle warning remains.

## Open Plan 01 gates

Strict process-wide memory reservations; fully transactional final world construction; more granular scene/material adoption; normalized unit/axis import recipes; broad real-DCC character/morph/embedded-texture fidelity corpus; CLI FBX; stable node/mesh/skeleton identities beyond material/clip mapping; complete future cross-asset dependency scheduling; representative peak-memory/latency measurements and physical Windows/CEDAR acceptance. No zero-stutter or lossless-FBX promise is made.

## Suggested owner test

1. Open the included Asset Pipeline PIF; import your small GLB/FBX and inspect the conversion warnings.
2. Close/reopen the editor and verify the imported project recovers without importing the source again.
3. Reimport changed source, inspect the review, explicitly map renamed materials/clips, and check placed transforms.
4. Cancel a reimport; use undo/redo; save PIF, restart and reopen that portable backup.
5. Report OS/driver, actual renderer, responsiveness, memory behavior and DCC visual differences.

Pause after this candidate for publication credentials and owner testing; do not begin Plan 02.
