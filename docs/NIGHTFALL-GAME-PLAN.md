# Nightfall Keep — implementation plan

Requested game: an actual first-person, single-player wave-survival horror shooter, built with Pinefall Engine, in a detailed dark forest around an explorable ruined castle. This is an implementation plan, not a claim that gameplay is already complete.

## Deliverables

- Editable folder project with TypeScript gameplay modules, original/generated art, WAV sounds, materials and scene metadata; portable PIF9; standalone web export; engine-native editor/Player support.
- A bounded roughly 160×160 metre map with forest trails, cemetery, ruined outer walls, gatehouse, courtyard and keep. Landmarks, supplies and combat lanes make the space useful, not merely oversized.
- First-person movement, mouse aim/pointer lock, sprint stamina, collision, two distinct weapons, ammo/reload, muzzle flashes, tracers, impacts, recoil, weapon sway/bob/reload animation, hit feedback and enemy attacks.
- Increasing enemy waves with capped simultaneous actors, distinct enemy stats, obstacle-aware path planning, line-of-sight attacks, visible animation and telegraphed damage. Intermissions, supplies, score, best-wave persistence where available, death and restart.
- Spatial gunfire/enemy/impact cues, footsteps, reload feedback and looping wind/drone ambience, with explicit audio unlock and mute controls. No claim of recorded voice acting or licensed music.
- Cohesive night lighting: readable moonlit silhouettes, warm castle lights, textured stone/ground, fog, restrained bloom, optional scattering, shadows and device-appropriate presets. Low mode retains appearance/art direction while reducing actual render workload.

## Engine integration before gameplay

1. Reuse engine physics, scene/entity lifecycle, imported GLB cache, animation graphs, audio cues, UI store, graphics/material/image catalog, folder/PIF/export pipelines and script trust.
2. Fill any genuine FPS input/API gaps with reusable typed engine features (mouse buttons, configurable reserved recover key, first-person camera aim access/pointer lock as appropriate). Do not build a second renderer, physics engine or audio engine inside the game.
3. Keep game simulation independent of DOM where practical, with seeded generation and pure combat/navigation helpers for tests. Browser-only pointer lock/storage must be guarded and lifecycle-owned.
4. Every engine feature need not be enabled simultaneously: unsupported or irrelevant features are not advertised as gameplay. Custom shader execution remains separately trusted if used.

## Implementation order

A. Reusable FPS input contract and regression tests.
B. Original/generated art, bounded WAV cues, map generator and authored project schema/roundtrip.
C. Pure navigation/combat/wave logic, engine script adapters, animated enemies/weapons and pooled effects.
D. HUD, title/start controls, pause/help, quality/audio settings, intermission and death/restart flow.
E. Automated schema/headless/unit checks, real browser play tests, audio output observation, screenshots, editor/native loading, standalone production export and resource/long-run checks.
F. Format with Prettier, pass Biome/Oxlint/typecheck, update documentation, package game and release engine changes using the established verified publication workflow.

## Performance and acceptance

Merged static meshes divided into cullable map sectors; bounded model/material/image catalogs; shared enemy model assets; fixed limits for enemies, tracers and effects; staggered path requests; UI text refresh throttled; no per-shot world reload or unbounded entity creation. No artificial claim that a large map is streamed if it is fully resident. Existing engine import and graphics budgets remain enforced.

Verify collision/obstruction, ammo and reload accounting, fire-rate limits, damage/death, wave completion, restart/cleanup and reproducible seeded placement. Verify actual scene rendering and audible-signal generation rather than treating UI labels as proof. Physical CEDAR/Windows, subjective listening and independent acceptance remain owner-deferred and unverified; SwiftShader timings are not hardware GPU performance.

## Implementation checkpoint — 2026-11-03

A–D have a playable implementation; E has unit, real browser, built Linux Electron and production-export checks with evidence, but not hardware/listening/endurance certification. F has whole-repository formatting/lint/typecheck and separate game packaging. Publication uses the independent `nightfall-v0.1.0` game tag, not a stable engine update. The subsequent general export utility is a separate task. The [game guide](NIGHTFALL-KEEP.md) describes concrete counts, controls and limitations. Procedural stylized art is implemented, not photorealistic final asset production; enemy variants share one rig. Scattering is supported by the engine but is not enabled in this game's default profiles. No claim that every aspirational visual/performance item above is certified complete.
