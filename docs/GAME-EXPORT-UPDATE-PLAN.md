# General-purpose game export update

2026-11-03. Starts **after** the separately published Nightfall Keep 0.1.0 game at tag `nightfall-v0.1.0` / commit `6f92e61c8b9ef82ee4ad49115eb2715f4573aa07`. The game release is immutable. This plan extends the existing shipping/readiness plan, rather than moving Nightfall gameplay into the engine.

## Goal

A developer selects an authored project/PIF, defines product identity and target profiles, and exports a genuinely standalone game. No editor, external-IDE bridge, Nightfall-specific filename, gameplay import or publishing credential is required in the shipped player. CLI and editor must share the same typed export service.

## Implementation order and acceptance

1. **Profile/preflight contract.** Strict versioned export profiles for web, Linux AppImage and Windows ZIP; validated app ID/name/version, viewport and graphics defaults; no script strings, shell commands, signing secrets or absolute resource paths. Preflight validates project/resource/script syntax without executing game scripts, states which targets are only planned and reports budgets/trust requirements. Unit-test invalid/unknown fields and portable path handling.
2. **Transactional assembly.** Fresh sibling staging directory; reject unsafe output paths, traversal, symlinks and overwrite attempts; cancellable jobs and per-step progress; prior output retained on failure. Compile generic minimal player and referenced PIF. Use a build manifest/dependency graph for workers/WASM/dynamic imports; require explicit include declarations for runtime-computed resource paths. Do not guess that substring matching proves a complete closure. Preserve legal notices.
3. **Generic desktop packaging.** Shared sandboxed game bootstrap, game identity/icon/window configuration and narrow permissions. No editor preload or project bridge. Real Linux AppImage and Windows ZIP outputs; signing configuration refers to external secret sources, never serializes credentials. Build-host capability checks distinguish unsupported hosts from execution-untested targets.
4. **Editor workflow.** Export dialog with profile selection, dry-run report, validation errors, output location, cancellation, progress and open-output actions. Shared source-owned controls; no embedded code editor. Save profiles with the editable project, not global machine paths. No duplicate wizard-only business logic.
5. **Evidence and release.** Roundtrip profiles, two unrelated games (Nightfall plus another starter), failed/cancelled staging, missing assets/worker dependencies, native no-editor assertion, real web/native player smoke tests, hashes/final manifests, reproducibility comparison, clean formatting/types/Biome/Oxlint. Publish the engine update separately only after the complete workflow passes. Physical Windows/CEDAR/listening remain explicitly unverified until owner testing.

## Boundary

The Nightfall release's game-specific packaging script is a working reference, **not the completed generic exporter**. Initial profile/preflight work is not an executable-export release. Existing `export-web` remains available during migration. No unsupported target will be presented as successfully built, and no signing or physical performance result is inferred from packaging.

## First implementation checkpoint

Strict profile schema and non-executing preflight are implemented and unit-tested. `bun run game export-plan path/to/game.pif [profile.json]` reports target intent, counts, trust requirements and an explicit `preflight-only` status with no artifact. This foundation is separate from the immutable game release. Transactional assembly, generic desktop packaging and editor export UI remain unfinished; they are not presented as available export functionality.
