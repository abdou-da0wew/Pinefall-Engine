# Remaining-feature execution plan

Written 2026-11-01 before the next implementation tranche. Implementation plan; current results are recorded below.

1. Documentation and attribution: audit all Markdown, distinguish current guides from historical records, correct stale workflows/limits/publication claims, add a tested tracked TypeScript commit-msg hook and documented installation. Preserve other co-authors and avoid duplicate trailers.
2. Texture resources: define typed bounded image/HDR resources and reference bindings before adding controls; wire folder, PIF, snapshot, prefab and export ownership. Decode off the interaction path; validate dimensions before allocation; preserve the previous runtime on failures.
3. Material maps and slots: canonical channel semantics, sRGB versus linear roles, UV0/UV1 validation/transforms, stable per-slot bindings, copy-on-write materials/samplers, normal/displacement parameters and transparent/masked behavior. Do not silently bind invalid UV channels or change slots after reimport.
4. Channel-packing tools: deterministic CPU/worker packing into supported Three.js channels, explicit source channels and inversion, dimension policy, source retention and roundtrip fixtures. No fake arbitrary channel-routing controls.
5. HDR environments: bounded external HDR decoding, renderer-local PMREM leases, staging/cancellation/context recovery and labeled device fallback. Verify resource lifetime under repeated replacement.
6. Scattering: explicitly define and test transparent-layer behavior, light-shadow sampling and temporal reprojection/history rejection before advertising those capabilities. Cover motion/disocclusion, thin geometry, camera cuts, resize, context loss and timing. Preserve a bounded non-temporal low-end mode.
7. Folder UX: one native archive-open route with legacy detection, Home-level persistent folders, explicit new-file registration, browser shader file import, and operation-generation/lifetime guards for root switching/navigation/saves.
8. Gate matrix: schema/roundtrip/headless/standalone; pixel and GPU fixture tests for ORM, normal handedness, UV sets, slots, skinning, alpha, displacement and HDR; failed allocations and repeated context loss; timing measurements with clear software/hardware labels. Owner-deferred physical checks remain unverified.
9. Update current guides and evidence after each implemented slice; version, commit with the configured co-author, push and publish appropriately labeled builds. Do not rewrite published history or mark unimplemented gates complete.

## Execution result — 0.7.0 candidate

Stages 1–8 are implemented with the bounded contracts in [graphics authoring](GRAPHICS-AUTHORING.md). Native Home/legacy/raw opening, registration and external-file regression suites pass. Graphics pixel, failure, context, native authoring and production standalone gates pass; physical acceptance remains owner-deferred. Stage 9 documentation/version/artifact preparation is local; push/publication still requires the previously authorized transient credential, which is not available in the resumed environment. No public-release claim is made. See [current status](CURRENT-STATUS.md).
