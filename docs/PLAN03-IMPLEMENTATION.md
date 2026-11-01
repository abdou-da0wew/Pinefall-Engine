# Plan 03 implementation ledger

Written before implementation, following the linked R0–R3 plan and the user's correction.

## Required scope

Preserve existing UI appearance. Keep restart-only desktop GPU/compositor preferences in Editor Settings, and also expose them from Rendering. Rendering remains the place for device-local preview settings. Add authored graphics and typed runtime SDK controls without confusing device policy, project intent and runtime overrides. No fake vgpu/R3F backend switch; no sandbox weakening.

## Execution order

1. G0 foundation: bounded/versioned graphics schemas, migrations/defaults, capability snapshots, requested/effective diagnostics and resource ownership. Define portable format behavior before adding persisted fields.
2. G1 materials: PBR/unlit assets, instance-safe overrides, editor authoring and scalar SDK controls first; then texture roles, UV/channel transforms, maps and regression fixtures. Never claim a texture channel is routed without the adapter.
3. G2 lighting: independent directional/point/spot definitions and shadow budgets; then PMREM environment ownership and context restoration.
4. G3 shaders: versioned source assets, typed uniforms, staged compilation, retain-last-valid recovery, editor and SDK. GPU code remains explicitly trusted/opt-in, not sandboxed or preemptible.
5. G4 post: replace the five-tap approximation with an ordered pass stack; real bloom, grading, vignette and optional FXAA; single output conversion, HDR/LDR capability report, resize/disposal/accounting tests. DOM game UI stays outside the post chain.
6. G5: separately labeled experimental depth-aware scattering with opaque-depth, sample-stability and timing gates. Fake cone beams remain explicitly fake. Physical timing is not inferred from SwiftShader.
7. Round trips, script/headless behavior, standalone preview/export, 100-cycle resource tests, failure recovery and documentation. Publish only gates actually met; keep a precise acceptance ledger for partial work.

## Acceptance boundaries

The source plan is `docs/plans/03-MATERIALS-GRAPHICS.md` (also fetched in full from the user-provided GitHub URL). Plan 03 is not complete merely because controls exist. Physical CEDAR/Windows/listening gates remain owner-deferred, not passed. G5 must not block correct materials/lights/shader recovery, but must not be advertised as completed without its tests.

## Progress

- Baseline audited: direct Three.js WebGL renderer; shared primitive colour materials; point/spot lamps; five-tap glow; local-only RenderSettings; no arbitrary-scene vgpu adapter.
- Implementation and evidence will be recorded gate by gate below. No gates are declared complete by this initial plan.

## Stage 1 implementation and evidence

Implemented a working first vertical slice; **the complete Plan 03 is still open**.

| Gate | Implemented now                                                                                                                                                           | Still required                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| G0   | Versioned scalar graphics definitions, PIF7 compatibility, requested/effective post/shadow reporting, shared post/shadow allocation reservations, headless SDK validation | Texture/shader schemas and dependency leases, broader capability matrix                                 |
| G1   | PBR/unlit scalar assets, reusable IDs, per-entity overrides, alpha modes, material dialog, stable scalar runtime updates, prefab material-ID remapping                    | Texture maps/channel repacking/UV tools, normal-map fixtures, displacement and per-slot authoring       |
| G2   | Directional/point/spot controls, per-mesh flags, bounded shadow views/atlas allocation, downgrade reasons, runtime light API                                              | PMREM environment ownership, camera-fitted frusta, independent update modes and broader shadow fixtures |
| G3   | Not implemented                                                                                                                                                           | GLSL assets, typed uniform API, staged compile/apply, line diagnostics and last-valid recovery          |
| G4   | Actual multi-resolution bloom, grading, vignette, grain, chromatic aberration, tone mapping, FXAA, HDR/LDR target choice and disposal accounting                          | Broader HDR/LDR/cutout/transparent colour fixtures and physical performance acceptance                  |
| G5   | Only existing fake cone beams, explicitly labeled                                                                                                                         | Actual depth-aware scattering and its occlusion/stability/timing gates                                  |

Proof recorded in `tests/plan03.test.ts`, `tests/plan03-browser.ts`, `tests/plan03-editor.ts` and `tests/plan03-export.ts`. Unit suite: 137 tests / 727 assertions at this checkpoint. The browser graphics test passes 100 effect-toggle/resize cycles, checks a grey patch at 128/128/128, checks post texture/reservation cleanup, instance isolation, scalar material identity, shadow profile constraints and a context-loss/restore cycle. Browser and built Linux Electron UI tests author and cold-reopen the new data. A production standalone export loads the original reference scene and runs its trusted graphics SDK script without render errors.

Native UI testing uncovered an existing timing race: the Home save `beforeunload` guard could survive until a passive-effect cleanup and block an immediate Electron reload after Home became visible. Its registration/cleanup now uses a layout effect; the native author/save/Home/reload test passes.

No CSS/theme changes. Desktop driver/compositor controls remain restart-only, accessible from Rendering; preview graphics controls remain local unless explicitly applied to the project. `docs/GRAPHICS-SDK.md` documents the concrete APIs and limits. `examples/projects/materials-post-reference.pif` is original procedural PIF7 content.

Next stage: texture/UV asset integration and environment ownership, followed by the custom-shader compile/apply pipeline. Do not mark the whole plan done or publish a completed Plan 03 release from this checkpoint.

Additional checks: forced LDR target selection/bloom/FXAA and cleanup pass in the graphics regression. The material dialog reuses the existing colour picker; its portal now stays inside a containing native dialog and focuses after reparenting, so Escape closes only the picker. The existing colour-picker regression and the nested native-dialog regression pass. No theme/CSS changes were made.

## Completion pass — execution plan

User requested completion of all remaining software gates. Implement the custom-shader contract and last-valid compile/apply recovery first, then integrate texture/UV resources and PMREM ownership, shadow update policy, and bounded depth-aware scattering. Each change must reach schema/PIF/SDK/editor/runtime and tests; do not relabel existing approximations. Preserve the theme. Physical hardware and independent-user acceptance remain owner-deferred rather than passed. Record any unfinished gate explicitly if implementation is interrupted.


## Shader continuation — 0.6.3-dev.1

**Plan 03 remains incomplete.** The Stage 1 matrix above is historical. G3 now has bounded unlit GLSL assets, independent applied/source/uniform drafts, staged compile/link/apply, line diagnostics, stable typed uniforms, consent controls, PIF/SDK/headless/editor/standalone integration and last-valid recovery. Skinning/morph/instance pixel fixtures, cancellation/revocation/context recovery, resource cleanup and native editor checkpoint/reopen have been exercised. No custom lit/depth/sampler contract is claimed.

Audit fixes include in-flight consent revocation, pending compile invalidation on context loss, incorrect instanced world positions, malformed shader inventory handling, missing archive allowlist coverage for uniform drafts, standalone permission loss on quality changes, and a legacy second context-loss handler that left the engine paused after restoration. Tests cover the fixed behaviors rather than inferring success from screenshots.

Still open: G0 texture/environment ownership; G1 maps, channel packing, UV tools, per-slot authoring, displacement and fixtures; G2 PMREM, independent shadow update modes and fitted frusta; G4 broader color/alpha/HDR fixtures and failure-atomic resource admission; G5 real depth-aware scattering. Physical CEDAR/Windows, listening and independent acceptance remain owner-deferred, not passed. No completed Plan 03 release is authorized by these results alone.

Checkpoint evidence: typecheck/Oxlint pass (200 files, zero warnings/errors); 141 unit tests / 754 assertions pass; shader GPU fixture passes 20 replacements with zero retained shader programs after permission disable; general graphics fixture passes 100 post/resize cycles, grey-patch color, LDR fallback and context recovery. Built Linux Electron editor and both standalone reference exports pass. Existing script, shortcut and Player-handoff regressions also pass. Evidence files are in `docs/evidence/plan03-shaders/`. The new shader dialog alone receives scoped width/textarea/log-wrap rules; the existing theme and other controls are unchanged.
