# Plan02 integration checkpoint — not full-plan acceptance

Date: 2026-10-31. Candidate remains 0.6.0; this is not a new public release.

## Streaming/persistent release-candidate continuation

The bounded WAV streaming profile and explicit persistent music are implemented and tested in Chromium and Linux Electron, including packaged Linux runtime tests. Current suite: **125 tests / 644 assertions**, check160files. Candidate **0.6.0-rc.1** includes Linux/Windows packages and the original combined workshop. Full acceptance remains blocked by external gates in [PLAN02-ACCEPTANCE.md](PLAN02-ACCEPTANCE.md); older checkpoint sections below remain historical.

## Authored buffered audio continuation

AudioDefinition1/scene3/PIF6, content-addressed working audio, scoped SDK, pause/spatial/epoch routing and the Audio studio are implemented. The original combined workshop passes headless, exported-browser and Linux Electron PIF-player tests. Current full suite: **123 tests / 628 assertions**. See [AUTHORED-AUDIO.md](AUTHORED-AUDIO.md) for precise contracts and evidence. Streaming, persistent ownership and remaining acceptance are still open. Earlier numbers below are historical checkpoints.

## Root-motion continuation

Root motion and its on-demand path dialog are now implemented for the documented kinematic-capsule profile. Current evidence: 114 unit tests / 567 assertions, graphical/headless wall parity, 100 motion Play/Stop cycles, Linux Electron smoke and standalone export smoke. See [ROOT-MOTION.md](ROOT-MOTION.md) for contracts and limits. The original checkpoint evidence below is retained as history; full Plan02 is still incomplete.

## Implemented and locally tested

- Scene v3 animator components and PIF v5 integrity-covered persistence. Previous scene/PIF versions remain readable. Downgrading an animated scene is rejected.
- Stable imported clip subasset references, non-destructive trim recipes, strict reference/channel/graph validation and bounded metadata.
- Per-instance skeletal/morph evaluation with independent rigs, 1D normalized-phase blending, deterministic transition priority and frozen evaluated source-pose crossfades. Interrupted fades do not accumulate layers.
- Scoped script animation snapshots, parameter changes, state play/crossfade and marker subscriptions.
- Dedicated editor inspector: clip creation/binding, trim start/end, validated declarative graph JSON, skeleton overlay, play/pause, seek, speed, time, parameter inspection and transition preview. Invalid drafts do not replace the accepted graph. This is a textual graph editor, not a visual node canvas. Preview events do not reach gameplay listeners.
- Headless skeletal evaluation uses the same GLTFLoader/AnimationMixer mathematical path, without textures or a WebGL renderer.
- Shared fixed-step dispatcher: queued structural admission, stable entity order, input snapshot, animation evaluation, one Rapier step, transform synchronization, sorted contacts and then animation markers. Pending destruction suppresses subsequent scoped listeners and markers immediately, while resources release at the following boundary.
- Bounded catch-up diagnostics, 512 queued structural commands, 4096 contacts per tick with explicit fail-closed pause on overflow, and per-animator marker limits.
- Constructor, failed spawn and staged-world rollback; animation ownership releases before model leases.

## API and persistence details

`AnimatorDefinition` is exported from `packages/animation/src`. Definitions contain version 1, initial state, typed parameters, clip recipes, states and transitions. Limits: 32 parameters, 32 recipes, 64 states, 128 transitions, 64,000 serialized metadata characters. Each recipe names a retained clip subasset and source-track trim interval. Markers use time relative to the trimmed interval. A 1D state's declared `clip` owns gameplay markers, regardless of which blend sample currently has the largest weight.

Transitions use `eq`, `gt` or `lt`, priority, minimum state time and fade duration. Ties retain authored order; only one transition is selected per fixed boundary. Immediate structural transition cycles are rejected. Ordinary timed cycles remain supported. All fades freeze the actually evaluated outgoing pose; they do not continue the outgoing clip clock. Playback preview speed resets to authored speed on Play.

`spawn()` now returns a validated queued entity description, not an already-live object/body. Admission is at the next fixed boundary. An admission failure emits `Structural command rejected` and rolls back resources. `destroy()` during Play marks the entity/descendants pending and removes them at the next boundary. Stop/unload discards pending commands. Script input is a read-only fixed-step snapshot. Existing tests were updated to assert the actual boundary contract rather than expecting immediate lease allocation.

Animation event data includes entity, state, clip, activation, loop, kind, fixed tick and within-tick offset. These are simulation timings, not an acoustic latency measurement.

## Current evidence

- `bun run check`: PASS, TypeScript and Oxlint, 142 files.
- `bun test tests`: PASS, **105 tests / 524 assertions / 20 files**.
- `bun tests/animator-browser.ts`: PASS. Real imported skinned GLB; independent poses; graphical/headless pose and marker parity; invalid-trim staged rollback; editor creation, trims, skeleton overlay, preview and invalid-draft isolation.
- Same browser test: **100 Play/Stop cycles**, two animator owners, two model leases, one prototype parse and unchanged admitted-memory reservations.
- `bun tests/assets-browser.ts`: PASS, including queue-boundary lease checks, prior worker/cache/FBX/cancellation/staging checks and editor recovery.
- `bun tests/runtime-browser.ts`: PASS, queued spawn, Stop restoration, camera/controller movement and script fault isolation.
- `bun run build`: PASS. Existing large-chunk warning remains.

Browser evidence uses Chromium/SwiftShader in this environment. It is not CEDAR GPU validation, physical audio QA, native Windows execution or proof of a hard RSS/GPU memory cap. The memory checks concern the shared admission-accounting model.

## Still required for the full requested Plan02

The bounded software profiles and listed local regressions are implemented; **external acceptance remains open**: physical Linux/Windows listening and device recovery, measured audiovisual alignment, CEDAR hardware, native Windows execution and independent review. Earlier Plan01 physical gates remain open too. Use PLAN02-ACCEPTANCE.md as the current gate ledger. A release candidate is not 100% completion. Broader UI modularization remains after Plan02 acceptance.
