# Large models and lightweight editor UI

> Historical release, design or acceptance record: retain the results and limits of its stated checkpoint. For current implementation and downloads, see [current status](CURRENT-STATUS.md).

## Accepted scope

User selected up to 200 MB model + companion input per import, and normal HTML/CSS UI with minimal GPU-promoting effects. Chromium may still GPU-composite the window. Do not disable WebGL, disable the GPU globally, weaken the sandbox, or claim strictly CPU-only compositing.

## Implementation plan (before code)

1. Audit every admission boundary: input, FBX/GLB validation, cooked artifact, disk blobs, provenance, scene validation, worker memory reservations, decoded renderer resources, checkpoints, portable PIF, recent snapshots and desktop IPC.
2. Centralize source/project/archive limits. Admit 200,000,000 input bytes while retaining explicit decoded geometry, texture, collection and transient-work budgets. Fail before reading oversize files. Keep workers cancellable and retain disk references rather than full project byte caches.
3. Remove gratuitous UI transitions/promoting effects; explicitly document that HTML/CSS rasterization/compositing is Chromium-controlled. Preserve the GPU 3D canvas and useful static UI states.
4. Test capacity boundaries and real populated geometry above previous limits. Test import -> disk library -> place -> portable save -> reopen, and oversize/decoded-budget failures. Measure memory separately from encoded file size. Keep unsupported format/decoder errors honest.
5. Run existing units/checks and browser/native regressions, update usage documentation and version only after validation. Do not publish unvalidated larger-capacity claims.

## Risks

200 MB encoded data is not a 200 MB memory footprint; FBX conversion and XZ packaging can need multiple times the source size. Old GPUs may be unable to render an admitted model. Existing monolithic PIF/base64 paths need explicit investigation before promising arbitrary 200 MB round trips. Large texture or decompression bombs must remain rejected. A synthetic large fixture is not proof of every real-world FBX exporter.

## User correction — preserve existing UI appearance

All CSS changes from the initial interpretation were reverted. No UI redesign, effects removal or animation changes. Add desktop rendering choices within existing Editor Settings instead: automatic WebGL, legacy OpenGL, explicit SwiftShader CPU 3D, and independent software UI compositing request. Persist safely and apply before Electron readiness on next launch. Never restart over unsaved work automatically. Show active Chromium diagnostics separately from preferences. Browser-only instances cannot change host GPU policy. The game's vgpu renderer is a bespoke scene implementation, not an adapter for arbitrary Three.js engine models; mark that backend unavailable until a real adapter exists, never pretend it works. R3F is not an independent GPU backend.
