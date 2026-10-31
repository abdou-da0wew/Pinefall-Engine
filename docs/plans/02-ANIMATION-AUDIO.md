# Animation, character presentation and audio

**Pinefall implementation plan • research date: 2026-10-31 • baseline: 0.5.2 / b8b38af**

> Planning only. This document does not claim these features are implemented. Budgets and API sketches are proposed acceptance criteria, not measured performance or final public contracts.

## Revision record

- **R0 — code audit and initial engine survey:** identified the current baseline and questions below.
- **R1 — detailed design pass:** added researched architecture, proposed contracts, workflows, work packages and acceptance tests.
- **R2 — failure-mode and source-verification pass:** Inspected SkeletonUtils clone implementation; tightened skeleton ownership, marker boundaries, audio epoch recovery and decoded-PCM limits.
- **R3 — cross-plan consistency review:** reconciled subsystem ownership, shared identifiers, lifecycle boundaries and the first implementable vertical slice.

Read R1 as the main design, R2 as its research-driven refinements, and R3 as the final integration check. All revisions are planning work performed on 2026-10-31; no engine feature implementation is implied.

## Existing implementation and constraints

There is no dedicated animation graph or audio subsystem. The shared lifecycle and headless host provide integration points, not an implemented animation/audio feature.

Inspected integration points: `packages/runtime/src/engine.ts; packages/runtime/src/behaviors.ts; packages/scripting/src/sdk.ts; packages/headless/src/index.ts`. Preserve TypeScript, Bun, Oxlint, Linux/Windows Electron, the WebGL 2 runtime, DOM-free headless simulation and optional UI. Do not disable Electron sandboxing to obtain graphics compatibility. Physical CEDAR and Windows execution require dedicated validation; Xvfb/SwiftShader are not substitutes.

## Scope to design

Skeletal playback, per-instance skeletons, transitions, deterministic event timing, root motion, audio buses, positional sound, voice limits, pause policies and headless validation.

## How to use this plan

R1 explains the concepts and selected architecture; R2 records substantive follow-up research, corrections and additional failure cases. Proposed interfaces are design sketches, not existing APIs. Source links support the adjacent technical claims; numerical budgets are Pinefall hypotheses to validate, not upstream engine benchmarks. Resolve the remaining implementation questions through the listed spikes and fixtures before freezing public contracts.

## Shared release rule

No feature is complete because its checkbox exists. Require real behavior, project round trips, script/headless compatibility where applicable, a standalone export check, resource cleanup tests, documentation and an explicit unsupported-feature report. Release numbers are provisional; ship by acceptance gates, not dates.

## R1 — Research-led implementation design

### 1. Concepts and intended developer experience

A **clip** is immutable sampled animation data; an **action** is one playback instance with time, speed, weight and loop state; a **graph** selects/blends actions; a **skeleton pose** is mutable per-character output. Sharing clips saves memory, but sharing a mutable skeleton between characters causes interference. The Three r185 SkeletonUtils implementation is the version-pinned reference for clone/retarget behavior; use its verified clone semantics described in R2 rather than substituting a generic object clone. [Three r185 source](https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/jsm/utils/SkeletonUtils.js)

Godot distinguishes animation playback, blend nodes, blend spaces and state-machine transitions. Adopt that conceptual hierarchy, but start Pinefall with a small declarative state machine rather than a full visual graph language. [1](https://docs.godotengine.org/en/stable/tutorials/animation/animation_tree.html)

The release demonstration is a character that idles, walks, turns, attacks and recovers, with footstep events and positional sounds. Two instances must animate independently. Pause, scene changes and exported builds must behave consistently.

### 2. Architecture and asset contracts

Proposed packages: `packages/animation` for DOM-free graph evaluation, event scheduling and pose adapters; `packages/audio` for bus/voice policy with browser and null backends. Do not add AudioContext or renderer types to the shared simulation interface.

```ts
// Illustrative public-facing data, pending contract review.
interface AnimatorDefinition {
  skeletonAssetId: string;
  initialState: string;
  states: Record<string, { clipId: string; loop: boolean; speed: number }>;
  transitions: { from: string; to: string; parameter: string;
                 operator: 'eq' | 'gt' | 'lt'; value: number | boolean;
                 fadeSeconds: number; priority: number }[];
  rootMotion: 'disabled' | 'horizontal-kinematic';
}
interface AudioCue {
  assetId: string; busId: string;
  spatial: boolean; gainDb: number; loop: boolean;
  priority: number; pausePolicy: 'game' | 'ui' | 'persistent';
}
```

No string expressions or arbitrary callbacks embedded in graph conditions. Validate referenced state/clip/parameter IDs and finite ranges. Separate authored definitions from runtime handles, cursors and device objects. Clip changes participate in asset dependency/reimport reports from Plan 01.

Proposed SDK: `ctx.animation.setParameter`, `play`, `crossFade`, `onEvent`; `ctx.audio.play`, `stop`, `fade`, `setBusGain`. Return scoped voice/action handles; disposal of the owning script/entity releases listeners and nonpersistent voices. Do not make users manage raw browser nodes for ordinary gameplay.

### 3. Clock and lifecycle contract

Use an authoritative simulation tick for graph decisions and gameplay-relevant events. Rendering interpolates presentation between simulation snapshots; it does not issue duplicate gameplay events. Audio uses its own device clock for scheduling sound output. Explicitly convert between simulation event time and AudioContext time; wall-clock timers are not the source of gameplay truth.

Recommended fixed-tick order: consume input snapshot → scripts request animation parameters/intended movement → evaluate graph/root-motion proposal → controller resolves motion → physics → trigger events → animation gameplay events/queued mutations at the documented boundary. Render samples pose/interpolation afterward. The exact mutation ordering is frozen jointly with Plan 04 before code lands.

For an event at clip-local time `e`, dispatch when the advancing interval crosses `e`, not when a floating-point time equals it. Use `(previous, current]` intervals, explicit wrap splitting, iteration number and event ID. Handle a large step crossing several loops without dropping or duplicating events. Put a validated maximum on events per tick; report overflow rather than allowing unbounded work. Preview seeking defaults to no gameplay events. Reverse playback initially excludes gameplay markers unless a later explicit reverse-event policy is selected.

Crossfade policy must define event ownership. Default: the selected gameplay action owns attack/interaction markers; cosmetic footstep events can follow a documented weight threshold with deduplication. Do not let both source and target clips deal damage during a fade.

### 4. Skeletal runtime and root motion

Allocate a pose/skeleton and animation mixer per character instance; share immutable geometry, clips and textures. Dispose mixer bindings and release leases when the character is destroyed. Preserve skin indices, weights, bind matrices and skeleton references on import; do not rebuild skeleton identity from display names alone.

Initial support: ordinary clip playback, loop/once, speed, normalized state time, crossfades and a simple 1D speed blend. Add additive animation and bone masks only after base/rest-pose conventions are tested. Generic retargeting, IK and motion matching are deferred; importer conversion must report what it cannot preserve.

Root motion is a desired displacement, not permission to teleport through collision geometry. Godot exposes root-motion deltas separately from the visual skeleton, supporting that separation. [1](https://docs.godotengine.org/en/stable/tutorials/animation/animation_tree.html) For Pinefall's first mode, extract horizontal translation/yaw, remove it from the visible root pose, submit it to the kinematic controller and accept the collision-corrected motion. Preserve vertical motion under the existing character/physics policy. Block unsupported dynamic-body/root-motion combinations and nonuniform root scale rather than producing unstable physics.

### 5. Audio graph, loading and voice management

Use a browser backend with a master gain, child buses (music/effects/dialogue/UI), optional limiter and per-voice gain/panner. Bus graphs must be acyclic. Godot's bus-oriented interface is a useful model for routing and clipping visibility; use precise amplitude conversion `gain = 10^(dB/20)` and do not equate an amplitude ratio with perceived loudness. [1](https://docs.godotengine.org/en/stable/tutorials/audio/audio_buses.html)

Short effects use reusable decoded AudioBuffers. Each playback creates a fresh AudioBufferSourceNode: the node cannot be started twice. Cache buffers, not already-started nodes. [MDN AudioBufferSourceNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode) Long music tracks use media-element streaming where appropriate; sample-accurate streaming is a separate, more complex requirement, not a property of every music backend. [MDN audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)

Create/resume the audio context from a user interaction and handle suspended state explicitly. Display an unobtrusive “Enable audio” action if necessary; do not silently report successful audible playback while the context is blocked. [MDN audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)

Provisional low-profile budget: 24 real voices, 8 positional panners, 32 MiB decoded PCM cache. These are configurable starting points to test. Rank voices by authored priority, bus role, estimated audibility and age. Steal/fade the least important voice rather than abruptly clipping arbitrary dialogue. Virtual looping voices retain their logical cursor while inaudible; recreate a real source at the correct offset when admitted. All voice handles have generation IDs so a late completion callback cannot stop a recycled voice.

### 6. Spatial sound, pause and cleanup

One active listener follows the selected camera or explicit listener entity; switching listeners has a transition policy. Initial attenuation is a documented distance curve with inner distance, outer cutoff and rolloff. Use mono positional effects by default; make stereo downmixing explicit. Occlusion is initially optional, rate-limited raycast plus a simple gain/low-pass approximation, not acoustic simulation.

Pause game buses without pausing UI sounds. For buffer sources, retain the logical playback offset and recreate on resume; AudioBufferSourceNode is not a pause/resume object. Scene-scoped voices stop on unload, while explicitly persistent music is owned by a persistent audio service. Window focus loss, Stop and hidden tabs each have a documented policy. Device loss and decoding failure must not stall simulation.

### 7. Editor tooling and work packages

- **AA0:** build clip/skeleton/audio fixtures and a null backend; instrument ownership.
- **AA1:** import inspection, clip list, trimming recipe and character preview; seeking is side-effect-free.
- **AA2:** per-instance playback and minimal state machine; parameter inspector and transition preview.
- **AA3:** interval-based events and root-motion/controller integration.
- **AA4:** audio asset preview, bus mixer, cue inspector and device-unlock UI.
- **AA5:** voice budgeting, spatial playback, pause/unload policies and script APIs.
- **AA6:** headless/export parity and authored tutorial scene.

Animation preview needs play/pause, speed, frame/time display, skeleton overlay and root-motion path. Audio preview needs stop/mute and should never autoplay merely because the asset is selected. Asset validation should show unsupported channels and missing skeleton bindings before Play.

### 8. Tests and acceptance gates

Unit tests cover invalid references and unbounded immediate-transition cycles (ordinary timed state cycles are allowed), deterministic transition priority, event wrap/seek/large-step behavior, fade interruption and voice-stealing policy. Headless tests inspect event/voice-command traces rather than requiring a sound device. Browser tests verify independent skinned clones, output graph routing, user-gesture unlock, Stop cleanup and context suspension. Audible QA checks click-free fades, loop seams, left/right orientation and dialogue intelligibility.

The demonstration passes when an attack event fires once, movement stops at a wall despite root motion, footsteps match the supported clip within a measured tolerance, two characters have independent phase, game pause leaves UI audio responsive, and 100 Play/Stop cycles show no growing live handles. Propose ±30 ms audio/visual event alignment on the reference device, measured rather than assumed; device latency is reported separately.

Risks: exporter skeleton conventions, audio codec availability, latency variance and blended-event ambiguity. Recovery: preserve the last valid graph, use an explicit missing-clip pose, and disable only the failing audio cue. Do not convert missing assets into apparently successful silent playback without a diagnostic.

### Cross-plan dependencies

Plan 01 supplies assets/leases and preserves skeletal channels. Plan 04 owns authoritative lifecycle, scene ownership and controller motion. Plan 05 owns traces and runtime inspection. Plan 06 supplies action input and exported-game start/unlock flow. No animation subsystem is allowed to become a second physics authority.

## R2 — Verified clone semantics, event boundaries and clock recovery

### Source inspection changes the cloning contract

Three r185 `SkeletonUtils.clone` explicitly rebuilds the skeleton bone references through a clone lookup, requires the bones to be descendants of the cloned root, and shares geometries/materials by reference. This implementation has now been inspected, rather than only inferred from documentation. [Three r185 SkeletonUtils source](https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/jsm/utils/SkeletonUtils.js)

**Refinement:** import inspection must identify the complete skeleton ownership root. Cloning a selected mesh without external sibling bones is not supported by this helper; either expand the clone root to include the rig or reject the incomplete selection with a repair action. Animation instances own skeleton pose/bone texture lifecycle, but cannot dispose shared geometry/materials directly. Per-instance material changes require Plan 03's copy-on-write overrides. Add a two-character test that moves one arm and changes one material while proving the other instance and shared cache remain valid.

The runtime's r185 dependency is the research anchor; implementation must pin and test the resolved lockfile version and align Three type definitions rather than treating newer declarations as runtime capability proof. Retargeting remains deferred even though the utility exposes retarget helpers: bone-name mapping, rest poses, scale and hip behavior need content-specific validation.

### Boundary policy additions

The earlier `(previous,current]` rule does not define markers at zero. New policy: a state-entry marker fires once on a new activation token; a time-zero loop marker fires on each explicit loop boundary only if marked repeatable. Seeking, preview and restoring a save do not invent entry events. Same-time markers use stable authored order; action activation ID + marker ID + loop index form a deduplication key.

If a tick crosses many loops, calculate crossed intervals arithmetically instead of iterating without limit. Initial cap: 64 gameplay marker deliveries per entity per tick, with the action paused and a diagnostic on overflow rather than silently dropping damage events. Cosmetic marker overflow may be coalesced under a separate declared policy. Transition interruption selects a deterministic source pose and dominant gameplay owner; it never lets a fading action regain ownership after cancellation.

Save animation state only where the game needs it: graph revision, state ID, normalized cursor, playback direction, transition progress and relevant parameters. On missing/revised graph data, use an explicit game-defined fallback. Root motion restores from a consistent previous/current sample so loading does not apply the entire first frame as displacement.

### Audio scheduling is not a wall-clock loop

`AudioBufferSourceNode` is one-shot and buffer reuse is independent of node reuse; playback rate also affects pitch. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode) Do not promise independent pitch/time-stretch controls using that node alone. Reject unsupported combinations or label a future processing backend.

Maintain an audio scheduling epoch mapping simulation time to `AudioContext.currentTime`. Reset the epoch after suspension/resume, device/context replacement or large discontinuities. Schedule ordinary effects with a short configurable lookahead; late noncritical effects may start immediately or be dropped according to cue policy, while gameplay truth remains the simulation event. Never replay every missed effect after a background tab returns.

A visual ±30 ms target is an integration benchmark, not an end-to-end acoustic latency guarantee. Measure event scheduling error and separately report available device/output latency information. Auditory checks on real Linux/Windows devices remain required. Streaming music starts/seeks may have looser tolerance than buffered effects; crossfades must not claim sample-accurate synchronization across arbitrary media streams.

### Resource/security limits added after review

Decoded PCM budgeting uses `frames × channels × 4` bytes for float32 sample storage; three minutes of stereo at 48 kHz is roughly 65.9 MiB, exceeding the proposed 32 MiB low-profile effects cache. Therefore long music defaults to streaming and is not admitted through the effects decoder just because its compressed file is small. Validate duration/channel/rate metadata where available, limit concurrent decodes, and release rejected buffers immediately.

Decode APIs may not provide cooperative cancellation. Cancellation invalidates adoption and releases results on arrival; it does not falsely report that the native decoder was interrupted. Worker termination is only claimed for work actually owned by that worker. Untrusted media still needs bounded input and maintained browser codecs.

Voice stealing must reserve dialogue/UI classes or explicitly document priority semantics. Fade-out nodes count against a short release-tail budget; otherwise stealing 100 voices can momentarily create 100 extra tails. Zero-length cues, NaN gain, cyclic buses and extremely short repeating sounds are validation failures. Panners/filters update at a bounded control rate where appropriate, not through redundant graph reconstruction every frame.

### Headless and staged rollout refinements

The null audio backend returns a logical generation-tagged handle and records `not-rendered` status; it must not claim audible success. Headless animation evaluates required gameplay graph/marker/root-motion data without constructing a WebGL renderer. If a feature needs actual pose evaluation, use the same tested mathematical path or declare the fixture unsupported; do not skip gameplay events because no mesh is visible.

Proposed modules: `packages/animation` and `packages/audio` own the subsystem logic described in R1; thin adapters in `packages/runtime/src/animation/*` and `audio/*` connect them to shared scope/time services; `packages/scripting/src/sdk.ts` exposes narrow handles; `packages/headless/src/index.ts` selects null presentation backends; editor preview belongs in dedicated panels rather than increasing `main.tsx` responsibilities indefinitely. `engine.ts` owns scheduling integration but not every subsystem implementation.

Before AA3: agree the tick/event/queued-mutation order with Plan 04 and implement its trace fixture. Before AA5: agree persistent-world ownership and game/UI/persistent pause behavior. Before export: test unsupported codecs, blocked audio, listener swap, scene cancellation, 100 start/stop cycles, repeated seeks and voice overflow. Keep graphs/cues in the revised asset schema; do not add ad hoc data blobs outside PIF integrity coverage.


## R3 — Final integration check

Subsystem packages own graph/audio policy; runtime modules are adapters, not a competing second implementation. Follow the final tick order in Plan 04 R2: physics events precede animation gameplay marker delivery, and structural callback mutations enter the next boundary. Ordinary animation state cycles are legal; only unbounded immediate transition evaluation is rejected. Start with two independent skinned instances and one buffered cue before adding graphs and streaming.

### Companion plans

- [Asset pipeline, asynchronous import and reimport](01-ASSET-PIPELINE.md)
- [Materials, textures, lighting, shaders and post-processing](03-MATERIALS-GRAPHICS.md)
- [Reusable gameplay, prefabs, components and scene lifecycle](04-GAMEPLAY-AUTHORING.md)
- [Debugging, profiling, recovery and editor quality of life](05-DEBUGGING-RELIABILITY.md)
- [Game export, input, save games, security and production readiness](06-SHIPPING-DEVELOPER-READINESS.md)

## Implementation start — AA0 foundation

The owner authorized Plan02 after Plan01's software work. The implementation contract and exact first-slice results are in [PLAN02-EXECUTION](../PLAN02-EXECUTION.md), with runnable APIs and limitations in [ANIMATION-AUDIO-FOUNDATION](../ANIMATION-AUDIO-FOUNDATION.md). The first slice supplies independently tested pose clocks/mixers, real buffered PCM audio, null command traces and a character/audio lab. It does not certify AA1–AA6 or erase outstanding physical acceptance from Plan01.
