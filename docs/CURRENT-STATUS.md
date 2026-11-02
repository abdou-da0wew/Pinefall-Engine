# Current implementation and release status

Reviewed 2026-11-03. Published base version: **0.7.1**, current source is **0.8.0-dev.0**, an unreleased Nightfall game/FPS-input update. This page supersedes historical checkpoint inventories.

## Nightfall Keep — separate game release

[Nightfall Keep](NIGHTFALL-KEEP.md) is now a playable Pinefall Engine FPS with a forest/castle map, pooled wave enemies/projectiles, two weapons, supplies, skeletal animation, synthesized audio, HUD, pause and death/restart. Reusable mouse/key press latching, configurable recover-key/pointer capture, night ambient/sun-color authoring, desktop permission scoping and Home launch are included. The separate `nightfall-v0.1.0` game release has a PIF, standalone Windows/Linux game executables, web and editable-folder exports, source and a creation guide. It is pre-shipped sample content, not engine-core gameplay. See [evidence](evidence/nightfall/README.md) for actual gates and remaining limits; no new stable engine release is implied. General-purpose game export improvements follow separately.

## Publication

The 0.7.1 release adds Prettier-only formatting, Biome plus Oxlint lint gates and repository-wide cleanup to the verified implementation and packaged assets described below. The authoritative publication location is [v0.7.1](https://github.com/abdou-da0wew/Pinefall-Engine/releases/tag/v0.7.1). Publication verifies asset sizes and SHA-256 digests before making the release public. Earlier local-candidate evidence records preparation status, not a publication receipt. Credentials are used transiently and are not stored in repository files or Git configuration.

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

## Code-quality update

Prettier formats supported authored files repo-wide; Biome formatter/assist are disabled. Both linters reject warnings. `bun run check` now includes the formatting gate. Oxfmt has been removed. [Configuration and rule policy](CODE-QUALITY.md) · [0.7.1 notes](RELEASE-0.7.1.md).

## Export workflow follow-up

Nightfall Keep 0.1.0 was published separately with eight verified assets at [its game release](https://github.com/abdou-da0wew/Pinefall-Engine/releases/tag/nightfall-v0.1.0). The next engine export update has begun: strict game-independent profiles and non-executing `export-plan` preflight are implemented. Assembly, generic executable packaging and the editor workflow are still pending under [the dedicated plan](GAME-EXPORT-UPDATE-PLAN.md). This is not a second completed engine release.
