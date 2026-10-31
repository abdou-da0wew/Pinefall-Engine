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
