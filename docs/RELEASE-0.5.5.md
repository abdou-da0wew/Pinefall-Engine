# Pinefall Engine 0.5.5 — Transactional world staging and shared asset admission

> Historical release, design or acceptance record: retain the results and limits of its stated checkpoint. For current implementation and downloads, see [current status](CURRENT-STATUS.md).

**Plan 01 is still incomplete.** This release contains the 0.5.4 persistent-storage/reimport work plus the tested changes below. It does not implement Plan 02.

## New behavior

- Construct the replacement physics world, primitive resources, lights, hierarchy and cloned model instances off-scene before clearing the active world. Entity staging yields after a 2 ms slice; individual constructors/uploads remain non-preemptible.
- Failed physics construction, failed instance cloning, admission exhaustion and stale/cancelled generations release staging resources and retain the previous document, object bindings, physics world and leases. Retry remains usable.
- Shared conservative admission ledger across the host's source pool, import workers, model reconstruction/prototypes, cloned instances and world staging. Budget: 384 MiB accounted, including a reserved 64 MiB source pool; workers reserve 128 MiB; model preparation reserves 160 MiB across worker and host reconstruction before reducing to its retained estimate. Instance and world estimates coexist with the previous generation.
- Reservations reject before covered construction, resize atomically, and release idempotently. Accounted current/peak values appear in renderer diagnostics and bounded scene events.
- Diagnostic/UI observers cannot interrupt ordinary ownership transitions; behavior cleanup errors are contained and logged.

**These estimates are not measured heap or GPU residency and are not an OS-enforced process cap.** Browser/driver overhead, PIF buffers and implementation-dependent decoder allocations still need representative measurement. Do not interpret a 384 MiB accounting ceiling as a 384 MiB process-memory guarantee. Unused cached prototypes are not proactively purged before every reservation; pressure can reject a replacement rather than sacrifice the live world.

## Included from 0.5.4

Reference-only scene v2 working documents; immutable SHA-256 blobs; persistent IndexedDB conversion cache and current/previous recovery; canonical recipe/source cache keys; source/artifact dependency semantics for current model consumers; explicit material/clip remapping; verified worker blob transport and portable PIF export. See `RELEASE-0.5.4.md` for limits and migration details.

## Validation

- **66 Bun tests / 259 assertions**, all passing; TypeScript and Oxlint pass.
- Browser fault injection fails physics construction after preparation and model cloning after partial instance acquisition: previous world identity/bindings survive, leases and reservations recover, and retry succeeds.
- Injected admission pressure preserves the active document. One hundred scene-load/unload cycles return accounted world/instance memory to the same baseline. These are synthetic regression fixtures, not broad performance certification.
- Existing 100-instance cache, rigs, textures, FBX, cancellation/races and structured-reimport UI suite passes.
- Real IndexedDB corruption/missing-blob/injected-quota/recovery/cache/reload tests pass. Runtime/PIF browser suites and freshly exported standalone game pass.
- Linux AppImage and Windows x64 ZIP built. Packaged Linux GLB/binary-FBX import, Play/Stop and PIF save/readback pass under Xvfb/SwiftShader.
- Windows execution and physical CEDAR acceleration/latency/peak memory remain untested. Binaries are unsigned; large-bundle and packaging-metadata warnings remain.

## Remaining Plan 01 gates, explicitly not finished

| Gate       | Remaining evidence or implementation                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A0         | Representative source/DCC fixtures, physical low/high profile latency distributions, real decoder/process/GPU peak-memory measurements |
| A1         | Complete future cross-asset dependency scheduling/registry beyond the current model/source/entity graph                                |
| A2         | Calibration/coverage of allocation estimates across PIF/decoder/driver paths; no hard process heap isolation claim                     |
| A3         | Granular intra-model material/scene adoption and physical shader/context-loss/pressure stress matrix                                   |
| A4         | Explicit normalized unit/axis recipe controls and independent-exporter character/morph/embedded-texture fidelity corpus                |
| A5         | Stable mesh/node/skeleton identities and conflict mapping beyond current materials/clips                                               |
| A6         | CLI FBX conversion and equivalent normalized recipes between CLI/editor                                                                |
| Acceptance | A second developer's edited textured-character reimport, overrides/PIF/export check, plus Windows/CEDAR owner testing                  |

## Compatibility / owner test

PIF remains v1/v2/v3 readable; provenance writes v3. Portable scene JSON remains v1. Internal reference documents are not standalone backups. Save PIF before testing. Hashes establish consistency, not publisher authenticity or script safety. Scripts still require explicit approval; production sandbox settings are unchanged.

Open the sample, place/reimport models, cancel a replacement, use Play/Stop, restart to verify recovery, and save/reopen PIF. Check the renderer diagnostic's admission values and report actual OS/driver/renderer, visible glitches, responsiveness and memory behavior. Pause after publication for owner testing under the standing release workflow.
