# Plan02 execution contract

The owner authorized moving to Plan02. Plan01 remains implemented/tested to its recorded software scope, with Windows/CEDAR and independent acceptance still open; moving on does not certify those gates.

## First vertical slice (AA0 foundation)

1. Add a DOM-free, bounded clip clock with forward/reverse sampling, loop/once, side-effect-free seek, activation tokens, entry/zero-loop markers, stable event ordering and transactional overflow handling. No frame-equality marker checks.
2. Add a pinned Three pose adapter with one mixer per model instance, shared immutable clips, explicit clip IDs, no autoplay, and owned binding cleanup. Test it with real imported skinned instances, not only generic objects.
3. Add a DOM-free voice admission/ownership policy and explicit null backend; add an actual browser buffered-PCM backend with user-gesture unlock, fresh source nodes, bounded PCM storage and cleanup. Begin with validated mono/stereo PCM16 WAV, not unbounded native decoding or a promise of every codec.
4. Supply executable synthetic fixtures and tests for independent poses, marker boundaries, seek, overflow, voice limits and backend lifecycle. Browser tests must exercise the actual Web Audio graph; null backend traces must say not-rendered and cannot substitute for audible QA.

This first slice is reusable subsystem code and integration evidence. It does not yet claim authored graph/cue schema, editor panels, root-motion/controller integration, full script APIs, streaming, or AA6 export parity. Do not hide those behind a version bump.

## Remaining sequence

- AA1: stable Plan01 clip binding, trim recipes, side-effect-free character preview, skeleton/root-path display.
- AA2: validated declarative state machine, deterministic transition priority, interruption semantics, per-instance parameter inspector and 1D blend.
- AA3: integrate the Plan04 R2 fixed-tick order; physics events precede gameplay markers, structural callback changes enter the next boundary. Only then expose gameplay/root-motion SDK. Collision-correct horizontal/yaw proposals; reject dynamic bodies/nonuniform scale.
- AA4/AA5: versioned PIF-integrity-covered audio/animation definitions, bus/cue editor, user-unlock UI, bounded scheduling epochs, pause classes, spatial listener, persistent ownership and scoped scripting APIs. No ad hoc unversioned scene fields.
- AA6: headless/shared mathematical parity, authored tutorial, standalone export and desktop regression. Run 100-cycle ownership tests. Real-device audio latency, loop/click QA and physical renderer acceptance remain explicit external gates.

## Validation policy

TypeScript/Bun/Oxlint only for authored code. Keep pure simulation policy free of DOM and WebGL. Physical +/-30 ms and audible quality are measurements to obtain, not claims derived from software tests. Do not publish a partial Plan02 release as completion. Record executed results and remaining gates below as work progresses.

## First slice result

Implemented and executed: bounded marker clock (including loop/seek/direction-change deduplication and compensated fixed-tick accumulation); per-instance Three mixer ownership; buffered PCM browser backend; explicit null backend; bus/priority admission and generation-safe voice cleanup. The dedicated lab demonstrates synthetic rigs and the pinned external Blender character (38 joints), real Web Audio meter output, device suspension, cancellation/dispose during PCM conversion, and 100 lifecycle cycles.

Validation: **94 tests / 458 assertions**, typecheck/Oxlint and production editor/player build pass. Animation/audio browser and external-character suites pass; assets/runtime and persistent-recovery browser regressions also pass. The large production chunk warning remains. No new desktop release is claimed: these subsystem modules and development lab are not yet authored scene/editor integration.

Next implementation boundary: AA1 stable clip-subasset binding and trim/preview contracts; AA2 state graph and fades. AA3–AA6 remain as listed above. Crossfades, controller root motion, spatial/streaming audio, pause classes, versioned authored graph/cue storage and full engine/headless/SDK integration are not implemented by this foundation. See `ANIMATION-AUDIO-FOUNDATION.md` for runnable APIs, precise limitations and test commands.

## Full-plan completion work order

The owner now requests all of Plan02, not another isolated lab milestone. Implement authored clip recipes and bounded graph definitions first, using Plan01 subasset IDs and non-destructive trim sampling. Introduce PIF v5 rather than silently allowing old readers to discard animator definitions. Integrate the same graph evaluator with staged graphical worlds and headless simulation. Define interruption as a frozen evaluated source pose blending into the new target; only the selected action owns gameplay markers. Add a dedicated editor panel, scoped script controls, and roundtrip/runtime tests before moving to audio schema and scheduling.

Then implement root-motion proposals and fixed-boundary mutation ordering, followed by audio assets/cues/buses, device epochs and pause/spatial/persistent ownership; finish shared export/tutorial/native tests. No section is complete merely because an API or checkbox exists. Unsupported features and external audible/device acceptance must stay explicit. Every implementation change must preserve failed-load rollback and existing project behavior.

## Integrated animator + fixed-boundary checkpoint (2026-10-31)

Implemented strict scene3/PIF5 animator definitions, stable clip recipes, per-instance graph evaluation, headless mathematical rig evaluation, scoped SDK and dedicated editor authoring/preview. Added a shared fixed dispatcher and queued structural lifecycle, including pending-destroy callback suppression and rollback tests. See [PLAN02-INTEGRATION.md](PLAN02-INTEGRATION.md) for exact semantics, evidence and remaining scope.

Verified 105 unit tests / 524 assertions; integrated skinned browser parity and 100 Play/Stop cycles; editor, asset, runtime browser suites; check and build. **This is not full Plan02 acceptance.** Root-motion controller proposals/path preview, authored production audio and AA6 tutorial/export/native integration remain incomplete. No new native binary or public release has been certified.

## Root-motion implementation work order (2026-10-31)

Before the broader UI refactor, implement the remaining motion authority: strict opt-in root-node binding; original-track SE(2) sampling (horizontal translation plus yaw), loop/reverse/trim/seek-safe deltas, pose compensation, and bounded fixed-tick controller proposals. Preserve controller-owned vertical movement, reject unsupported animated ancestors/nonuniform parent scales, and use a kinematic upright capsule profile. Add mathematical and real imported-rig wall tests, serialization and browser parity. Root-path inspection belongs in an on-demand preview rather than extra permanent asset-library controls. Production audio and AA6 remain subsequent unfinished work; no full-plan acceptance is implied by this work order.

## Root-motion implementation evidence

The work order above now has an implemented, validated kinematic-capsule profile: loop/trim/reverse/seek-safe horizontal/yaw sampling, cubic fidelity, pose compensation, controller proposal resolution and on-demand modal path inspection. Fixed the freshly admitted collider query gap without adding a second Rapier step. Full suite 114 tests / 567 assertions; root browser/headless wall parity and 100 cycles; Linux Electron and standalone export smoke; check/build pass. See ROOT-MOTION.md. Audio AA4/AA5 and the combined AA6 tutorial/export/device gates remain unfinished. UI modularization remains scheduled after Plan02, as requested.
