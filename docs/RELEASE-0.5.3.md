# Pinefall Engine 0.5.3 — Worker asset pipeline, first implementation

> Historical release, design or acceptance record: retain the results and limits of its stated checkpoint. For current implementation and downloads, see [current status](CURRENT-STATUS.md).

A downloadable testing checkpoint for Plan 01. **This is not completion of the entire asset-pipeline plan. FBX conversion remains experimental.** Includes the previous UI toolkit and PIF integrity features.

## What's new

- GLB parsing and image decoding in disposable workers, with queue admission, cancellation, timeouts and stage reports.
- Shared model prototypes and owner-tagged leases; 100 instances reuse one parse, while skinned instances have independent skeletons.
- Asset preparation before replacing the active world; failed parsing retains the previous world. Texture upload staging and shader warm-up reduce avoidable first-use work but do not guarantee zero stalls.
- Import-only, placement, reports and stable-ID reimport. Reimport preserves entity transforms/components and rejects stale targets.
- Experimental ASCII/binary FBX conversion with companion PNG/JPEG files, missing/ambiguous resource rejection, and explicit conversion warnings.
- Bounded GLB chunks/accessors/hierarchies/images and FBX binary array expansion checks. Sparse accessors and unsupported compression/required extensions fail explicitly.
- PIF v3 provenance: original source/companion bytes, recipes, reports and source/artifact hashes, stored as separate archive entries.
- Deduplicated undo payloads and CLI GLB import/reimport. Three runtime and types pinned to r185.

## Compatibility and safety

**0.5.3 reads PIF v1/v2/v3. It writes v3 when assets have provenance and v2 otherwise. Earlier releases cannot open v3. Keep original project backups.** Embedded SHA-256 hashes are consistency checks, not signatures or proof that scripts are safe. Project scripts still require review and explicit approval.

Current conservative limits include 4 MB selected source/companion bytes, 2 MB cooked GLB, 2048-pixel texture dimensions, 64 MiB estimated decoded model data and a 128 MiB prototype cache. Existing scene/project bounds remain. These are safety ceilings, not performance guarantees.

FBX units, axes, pivots, proprietary materials, constraints and morph normals need comparison with the source DCC. Do not assume automatic unit normalization or lossless conversion. CLI FBX is not available yet; use the editor conversion workflow. Standalone exports load cooked GLB.

## Downloads and suggested test

- Linux x86-64 AppImage
- Windows x64 ZIP — extract the entire ZIP before launching
- Exact source ZIP
- Asset Pipeline PIF v3 sample with retained original GLB source (no custom scripts)
- SHA256SUMS

Binaries are unsigned. Verify downloaded files against SHA256SUMS.

1. Open the sample, place several additional model instances and use Play/Stop.
2. Import a small GLB, edit its transform, reimport edited source and verify the transform remains.
3. Try a small FBX with its PNG/JPEG companions; inspect warnings and compare it with your DCC.
4. Cancel an import, save/reopen PIF, and verify the previous scene and resources remain usable.
5. Report OS/driver, effective renderer, frame responsiveness and any visual differences. Physical Radeon CEDAR feedback is especially needed.

## Validation and limits

59 Bun tests / 225 assertions; TypeScript and Oxlint; production worker build; browser tests for caching, skeleton/texture transfer, 100 load/unload cycles, cancellation/races, FBX fixtures and reimport; runtime/PIF workflows and standalone export. Linux production Electron import/Play/Stop/PIF checks passed under Xvfb/SwiftShader. Final packaged-binary evidence is recorded during release preparation.

Windows packaging is not Windows execution. Physical CEDAR acceleration/performance remains untested. The standard build still reports a large shared-bundle warning.

Still open: reference-only documents, persistent content-addressed artifact storage, complete dependency invalidation, strict process-wide memory admission, full subasset remapping/conflict UI, broader real-DCC character fixtures and physical-hardware acceptance. See `docs/ASSET-PIPELINE-IMPLEMENTATION.md` and `docs/plans/01-ASSET-PIPELINE.md`.

The next feature work waits for the owner's testing feedback.

Final packaged checks: GLB and binary-FBX import/Play/Stop/PIF v3 save passed against
`build/releases/linux-unpacked/pinefall-engine`, the packaged executable produced
alongside the AppImage. Existing PIF native save/readback also passed against that
same executable. Linux AppImage and Windows ZIP built successfully. The sample was
verified as PIF v3 with a valid SHA-256 inventory. This testing used software
rendering; it is not evidence of physical GPU acceleration.
