# Plan02 acceptance ledger — 0.6.0

Date: 2026-11-01. **Plan02 software implementation released as 0.6.0.** The owner explicitly instructed: “ignore them bro, i will test them myself.” Accordingly, the hardware/listening/timing/independent gates below are **deferred to the owner and no longer block publication**, not marked passed. Supported software profiles and local regressions are complete as documented. This is not a claim of universal device certification or full physical acceptance.

The earlier 0.6.0-rc.1 was deliberately held as a prerelease pending this decision. The owner’s deferral authorizes the full release without falsifying any test result.

## Software matrix

| Package | Implemented profile                                                                                                       | Executed evidence                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AA0     | Shared clocks, pose evaluation, voice policy, null command traces, bounded ownership                                      | animation-audio unit/browser fixtures; imported Blender character; complete disposal                                                                                     |
| AA1     | Stable imported clip IDs, trims, original interpolants, skeleton and root path previews                                   | animator/root-motion unit/browser and editor tests; seeking suppresses gameplay events                                                                                   |
| AA2     | Per-instance parameters, state machine, deterministic priorities, frozen-pose interruptions, normalized 1D blends         | independent rigs, graph parity and transition/invalid-draft tests                                                                                                        |
| AA3     | Interval markers; fixed boundary ordering; horizontal/yaw kinematic-capsule root motion                                   | headless/browser wall parity z=2.3750224113464355; attack once; rollback and 100 cycles                                                                                  |
| AA4     | WAV import/metadata, explicit unlock/preview, cue JSON, marker bindings and buses                                         | browser and packaged Linux editor import/deduplication/removal/focus/draft isolation                                                                                     |
| AA5     | Buffered pause/UI split, spatial sources/listener, scoped handles/seek, bounded streams and persistent music              | gesture/output, listener movement, pause/resume, faults, source/decode cancellation; two-stream limit, 100 seeks and 100 lifecycle cycles in Chromium and Linux Electron |
| AA6     | Original skinned workshop with footsteps/attack/turn/wall/UI and streamed ambience; portable export/native/headless paths | full unit suite; exported browser; packaged Linux PIF player; independent phases and HUD overflow assertion                                                              |

The supported root profile excludes dynamic bodies and nonuniform/unsupported root hierarchies. Streams support integrity-covered PCM16 WAV only, up to 240 seconds subject to the same 4 MB per-file/8 MB source catalog limits. These are deliberate, validated contracts, not claims of arbitrary codec or rig support. Effects remain limited to 30 seconds. Streaming uses browser-owned media decoding rather than a full AudioBuffer cache; no hard browser-native memory cap or sample-accurate stream timing is claimed.

## Current results

- TypeScript/Oxlint: PASS, 160 authored files, no warnings/errors.
- Unit/headless: **125 tests, 644 assertions, 23 files**.
- Animation/audio foundation, animator, root-motion, runtime, authored-audio, streaming, PIF worker and asset browser regressions: PASS.
- Streaming: real analyser output, persistent adoption, repeated seek, device suspension/unlock, explicit Stop, injected asynchronous media rejection and 100 stable tracked-memory cycles: PASS in Chromium and Linux Electron.
- Original workshop with streamed ambience: headless, fresh exported browser and packaged Linux standalone PIF player: PASS.
- Linux AppImage and Windows x64 ZIP: BUILT. Packaged Linux executable: tested. Windows executable: **not executed**.
- Binaries unsigned. Windows executable resource editing was disabled for this cross-build. Checksums verify transport integrity, not publisher identity.
- Sandbox tests use SwiftShader and test-only no-sandbox flags. Neither proves physical GPU compatibility; neither is shipping advice to disable the sandbox.

## External gates — deferred to owner; unverified

| Gate                           | Required evidence                                                                                                                                                   | Current result             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Reference CEDAR/TeraScale2 GPU | Actual renderer/backend, Mesa/driver version, scenes, frame-time/memory captures, visual glitch/stutter checks                                                      | Not run here               |
| Native Windows execution       | Extract full ZIP; editor/PIF/save/export/play/pause/device recovery; logs and OS/GPU/audio device versions                                                          | ZIP packaged only          |
| Real Linux/Windows audio       | Click/fade/loop seams, channel orientation, dialogue intelligibility, device change/unplug/recovery                                                                 | No listening certification |
| Audio/visual alignment         | Repeated supported-clip marker/visual measurements against the proposed ±30 ms integration target; method/uncertainty and device/output latency reported separately | No physical measurement    |
| Independent acceptance         | Reviewer executes the checklist and records findings; unresolved Plan01 physical gates remain separate                                                              | Not supplied               |

## Reproducible acceptance procedure

1. Verify published SHA256SUMS; record OS, GPU/driver, chosen renderer profile and sound device/sample rate. Do not use software-rendering test results as hardware evidence.
2. Open the bundled workshop PIF, explicitly trust its owned controller and unlock sound. Walk against the wall, turn, attack repeatedly and confirm one hit per attack. Compare the two independently animated actors.
3. Pause/resume: game effects pause while UI sound and explicitly persistent ambience remain available. Hide the window: the entire device is suspended. Return and explicitly unlock; game pause remains until resumed. Stop must terminate persistent music as well.
4. Repeat Play/Stop 100 times; record live voice/stream/buffer counts, tracked reservations and separately actual process/GPU memory. Accounted stability is not a hard RSS claim.
5. Check fades/loop seams and left/right emitter placement by listening. Exercise device interruption and explicit recovery; retain fault logs. Unsupported codecs must reject without replacing the valid world.
6. Capture repeated footstep/attack visual-event alignment with a documented timing method and uncertainty. Preserve raw observations, not just an average. Report device/output latency separately; do not present scheduler lookahead as measured acoustic delay.
7. Record pass/fail and attach evidence for each external gate. Report failures for follow-up patches. Update only the affected gate when actual evidence is available; publication itself does not pass these checks.

No unchecked gate is treated as passed merely because source, a checkbox, a package or a GitHub release exists. The broader shared-button/switch/panel layout refactor has not begun and may proceed after this software release.
