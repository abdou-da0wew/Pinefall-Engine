# Pinefall Engine 0.7.0 — graphics authoring and folder workflows

**Local release candidate. Not yet pushed or published.** See [current status](CURRENT-STATUS.md). This version completes the bounded Plan03 software scope and the requested folder-workflow follow-ups; owner-deferred physical acceptance is not claimed.

## Included

- PNG/JPEG map resources and external Radiance HDR environments; bounded worker decoding, independent texture views, source-aware PMREM ownership and rollback on allocation/upload failure.
- Canonical color/emissive/normal/ORM/alpha/displacement authoring, UV0/UV1 transforms and bounded triangle inspection, cancellable channel packing preserving PNG hidden RGB/alpha, and source-guarded per-slot material overrides.
- Half/full-resolution scattering, adaptive thin-edge integration, nearest-transparent-interface depth, directional Basic/PCF shadow sampling and depth-rejected/clamped temporal reprojection. Defaults preserve the inexpensive prior mode.
- Context recovery cleanup for obsolete geometry/material/texture/shadow handles, plus history/PMREM invalidation and tested repeated replacement after restoration.
- Persistent Home folder cards, unified native portable/raw PIF opening, explicit authored-source registration, browser shader file exchange, external IDE workflow and no embedded source editing.
- Portable PIF9 image/map/slot/extended-material/scattering serialization. Native raw backups remain PIF8 and preserve invalid/unapplied/unregistered drafts. Older portable projects remain readable; older apps cannot read PIF9.
- Updated original materials reference, SDK exports, authoring guide and tested co-author hook. Existing appearance and Rendering/device controls retained.

## Verification and packaging

Final gate counts, native packaging results and screenshot links are recorded in [completion evidence](evidence/graphics-completion/README.md). The tested source passes typecheck/Oxlint, unit/roundtrip/headless gates, actual GPU pixel/failure/context fixtures, native authoring/external-workflow checks and a production standalone reference.

Production Vite/Rollup uses a bounded Node heap under a Bun-authored TypeScript build wrapper: forcing this dependency tool through Bun exhausted the 2 GiB build sandbox. Authored implementation/tests remain TypeScript/Bun. This does not alter rendering or production sandbox policy.

The release asset set consists of Linux x64 AppImage, Windows x64 ZIP, source ZIP, these notes and SHA256SUMS. Check the local evidence and checksums rather than assuming upload success. Windows packaging is not Windows execution certification. Binaries are unsigned.

## Explicit limits

32 images, 16 MiB/source, 128 MiB encoded catalog/decoded admission, 2048-pixel maximum image edge; 64 source-guarded slot overrides per entity; 4,096-triangle UV inspection sample. No UV unwrapping, tessellation or displacement collision cooking. Packing supports canonical Three.js channels and a bounded PNG subset; runtime PNG support is broader. HDR is 2:1 Radiance RGBE, not EXR.

Nearest-interface depth is not multilayer transparent transport. Volumetric shadows use the brightest visible directional light, not point/spot or VSM. Temporal rejection/clamping is not a universal ghost-free guarantee. Custom shaders retain the bounded unlit interface, not arbitrary render passes or sampler uniforms. These are the supported contracts, not hidden completion claims.

All recorded GPU tests use SwiftShader. Physical CEDAR/Windows, listening, hardware timings and independent acceptance remain owner-deferred, unverified and not release blockers. The authenticated publication operation remains outstanding because the previously supplied transient credential is absent from this resumed environment; no replacement token is requested.
