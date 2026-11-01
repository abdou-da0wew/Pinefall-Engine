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

## Authored audio integration work order (2026-10-31)

After pushing the validated root-motion checkpoint, add strict authored audio catalogs/cues/bus gains, separate integrity-covered WAV archive members (PIF6), staged bounded source admission, browser/null shared cue ownership, scoped SDK and animation marker bindings. Add buffered pause/resume, positional sources/listener updates and a simulation/device scheduling epoch with explicit blocked/late results. Put audio authoring, import, preview/unlock and mixer controls in an on-demand dialog. Validate roundtrips, malicious/downgraded data, failed-load retention, paused UI audio, disposal, browser/native/export integration. Long music streaming/persistent ownership and combined AA6 acceptance must remain explicit until implemented and tested; PCM-only integration is not the whole remaining plan.

## Authored buffered audio / integrated workshop checkpoint (2026-10-31)

Implemented the preceding work order's buffered slice, plus SHA-256 blob-backed working audio, deduplicating imports and confirmed asset/cue/binding removal. PIF6 keeps separate verified WAVs. Scene staging failures retain the old world; pending decode replacement/disposal and script-fault cleanup now have dedicated tests. Paused UI cues use device time rather than the simulation epoch.

The original procedural workshop combines independent rigs, attack/footstep cues, root-motion collision, turns and a paused UI sound. Exported browser and Linux Electron PIF-player execution pass; visual inspection corrected character occlusion by the wall and native HUD scrollbars. Added regeneration and test commands. Full current suite: **123 tests / 628 assertions / 22 files**, dedicated audio **9 / 61**, check156files and desktop build pass. Browser output/spatial/pause/rollback/100 cycles and editor/native import/dedup/remove/focus checks pass. See AUTHORED-AUDIO.md and evidence/plan02-authored-audio.json.

Not complete: streaming music, persistent-world audio ownership, complete focus/device-loss behavior and remaining AA6 acceptance matrices. External Windows/CEDAR/physical timing/listening/independent gates remain open. No public release or hardware certification is implied. Continue these before the broader shared-control/layout refactor.

## Streaming/persistent continuation work order (2026-10-31)

Implement a bounded, portable PCM16-WAV media-element streaming profile, explicitly distinct from decoded effects. Streaming sources keep the existing 4 MB per-file/8 MB catalog admission limits but permit up to 240 seconds; no whole-track AudioBuffer conversion. Reject compressed/unknown codecs rather than guessing metadata. Limit concurrent media elements to two and expose resource/failure statistics. Add authored asset mode and explicit nonspatial persistent music cues, preserve them across successful world adoption, stop them on explicit Stop/dispose, and detach them from entity disposal. Preserve rollback and generation-safe ownership. Add scoped seek with bounds, headless command parity, PIF roundtrips, real browser output, repeated seeks and teardown tests. Hidden windows suspend the whole audio device; visible windows require explicit resume/unlock, with game pause retained. Test these before updating acceptance or publishing a release. Physical external gates are not replaceable by these tests.

## Streaming/persistent work-order result and release gate

Implemented the bounded media-element PCM16 WAV profile, two-stream admission, explicit persistent music, idempotent ownership handoff, scoped stream seek, hidden-device suspension/explicit unlock, async rejection diagnostics and latency statistics. Source codec/mode/persistence survives PIF6 integrity transport; editor long tracks default to streaming. The original workshop now includes streamed ambience; standalone trust/play unlocks before script start.

Current full suite: **125 tests / 644 assertions / 23 files**; check160files. Chromium and Linux Electron streaming tests pass real output, 100 seeks, persistent replacement, suspension/recovery, injected device rejection and 100 stable tracked-memory cycles. Foundation/animator/root/runtime/PIF/asset regressions pass. Production Linux AppImage and Windows ZIP packaging succeeded; packaged Linux editor and workshop execution pass. Windows was packaged, not executed. Candidate version0.6.0-rc.1 is explicitly a prerelease, not full-plan acceptance.

The remaining blockers are recorded in PLAN02-ACCEPTANCE.md: reference Windows/CEDAR execution, physical listening/timing/device recovery and independent acceptance. Do not turn those into software-test passes or publish the candidate as a 100%-accepted full release. Shared UI refactoring still waits.

## Owner decision and full software release (2026-11-01)

After publication of0.6.0-rc.1 and disclosure of the remaining external gates, the owner explicitly said “ignore them bro, i will test them myself.” Record this as deferral of hardware/listening/timing/independent acceptance, not successful execution. Those gates no longer block release. Promote the implemented and locally validated supported profiles to full version0.6.0, rebuild both platform packages, test the final Linux payload and export, then publish/tag/push with verified checksums. No external result is invented. UI refactoring remains subsequent work.
