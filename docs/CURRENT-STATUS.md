# Current implementation and release status

Reviewed 2026-11-01. Current source version: **0.7.0**. This page supersedes historical checkpoint inventories.

## Publication

**0.7.0 is prepared locally, not pushed or published.** Publication is authorized, but the previously supplied transient GitHub credential is not present in the resumed environment. No replacement credential is requested, no secret is stored in the repository, and no public-release claim is made. The last verified public development release remains [v0.6.3-dev.2](https://github.com/abdou-da0wew/Pinefall-Engine/releases/tag/v0.6.3-dev.2); historical stable release: v0.6.2. Their files do not include the subsequent source changes.

## Implemented software scope

- Folder-first editable TS/GLSL/metadata/assets, external IDE launching, automatic bounded syntax/semantic diagnostics, offline typings, explicit hash-checked Apply and last-working-runtime retention. No embedded source editor or implicit code trust; this is not a full LSP.
- Persistent Home folder cards and guarded handoff; unified native portable PIF1–7/PIF9 and raw PIF8 opening into an empty folder; explicit TS/GLSL/shader/material registration. Browser GLSL/uniform file exchange supports explicit trusted staged Apply.
- Streamed raw PIF8 folder backups preserve invalid, unapplied and unregistered files. Manual, interval, settled-change and customized-shortcut repacking remain available. Native raw transport is independent of portable PIF9 scene/resource semantics.
- PBR/unlit surfaces; canonical texture maps; bounded UV triangle inspection and UV0/UV1 transforms; worker channel packing; source-guarded per-slot overrides; normal/displacement controls; bounded external Radiance HDR and source-aware PMREM leases.
- Independent lighting/shadow budgets and update modes, fitted directional frusta, staged custom-unlit shaders and ordered HDR/LDR post processing.
- Half/full-resolution depth-aware scattering with adaptive edge integration, optional nearest transparent-interface depth, brightest-directional Basic/PCF shadow sampling, depth-rejected/clamped temporal history and explicit fallbacks.
- Allocation/cancellation rollback, source/view ownership and context-loss cleanup retaining CPU data. A repeated-context test exposed obsolete GL disposal handles; this is fixed and covered by replacement-after-restoration tests.
- Existing animation/audio, 200 MB combined model/companion import admission, game UI, headless and Player workflows retained. Device/Rendering controls and the existing theme remain intact.

Precise bounds, supported channels, transparent/shadow/history limitations and reproduction commands: [graphics authoring](GRAPHICS-AUTHORING.md), [graphics SDK](GRAPHICS-SDK.md), [PIF](PIF.md), [folder workflow](DISK-PROJECTS-IMPLEMENTATION.md).

## Verification

The completion suites cover canonical packed bytes and rendered ORM channels, normal handedness, alpha/displacement shadows, UV selection, per-slot isolation/source guards, HDR pixels and PMREM regeneration, failed allocation/cancellation, repeated resource replacement/context recovery, thin geometry, moving depth, history/camera-cut/resize invalidation and budget rejection. Existing 100-cycle post and 20-cycle shader suites also pass.

Actual Linux Electron authoring covers disk-backed PNG/HDR imports, UV inspection, invalid-UV rollback, slot authoring, HDR/scattering controls, raw backup and PIF9-to-folder opening. Unified-source, external-code/restart and native disk-bridge suites pass. Production standalone reference verifies actual bitmap/half-float uploads and GPU draw calls. Check the [0.7.0 release notes](RELEASE-0.7.0.md) and [evidence](evidence/graphics-completion/README.md) for final counts, packaging and logs.

**Physical AMD CEDAR, physical Windows execution, listening, hardware timing and independent acceptance remain owner-deferred and unverified.** SwiftShader submit/readback timings are not hardware GPU timing or performance certification. These deferred checks are not publication blockers. Production sandbox policy is unchanged; unsandboxed flags are limited to the root-run test environment.

## Delivery boundary

The outstanding delivery operation is authenticated push/publication, not another advertised partial graphics implementation. The local version/tag/artifacts must not be confused with an existing GitHub release. Historical release notes retain the results of their own versions; unpublished features must not be attributed to those downloads.
