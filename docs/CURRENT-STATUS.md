# Current implementation and release status

Reviewed 2026-11-01. Current source version: **0.7.0**. This page supersedes historical checkpoint inventories.

## Publication

The 0.7.0 release contains the verified implementation and packaged assets described below. The authoritative publication location is [v0.7.0](https://github.com/abdou-da0wew/Pinefall-Engine/releases/tag/v0.7.0). Publication verifies asset sizes and SHA-256 digests before making the release public. Earlier local-candidate evidence records preparation status, not a publication receipt. Credentials are used transiently and are not stored in repository files or Git configuration.

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

Release packaging and physical acceptance are separate: Windows is packaged but execution-untested, and physical CEDAR/independent acceptance remains owner-deferred. Historical release notes and evidence retain the results of their own checkpoints.
