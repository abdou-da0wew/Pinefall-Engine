# Pinefall Engine 0.6.0 — Plan02 animation/audio release

> Historical release, design or acceptance record: retain the results and limits of its stated checkpoint. For current implementation and downloads, see [current status](CURRENT-STATUS.md).

**Full software release, published after the owner explicitly deferred hardware/listening acceptance to their own testing.** Plan02’s documented software profiles and local regression coverage are implemented. Windows/CEDAR/physical audio/timing/independent checks are **unverified, not passed**; the owner elected not to block this release on them. See `docs/PLAN02-ACCEPTANCE.md`.

## Included

- Per-instance authored skeletal clips, trims, parameter/state graphs, 1D blending, deterministic interruptions and interval markers.
- Collision-correct horizontal/yaw root motion for the documented upright kinematic-capsule profile; on-demand skeleton/path inspection.
- Audio studio, WAV assets/cues/buses, marker bindings, spatial emitters/listener, game/UI pause semantics, generation-safe scoped handles and bounded epochs.
- Two concurrent media-element WAV streams; tracks over 30 seconds default to streaming. Explicit persistent music survives world adoption and owner disposal, but stops on explicit Stop/application disposal. Identical persistent cue playback is idempotent with ownership handoff. Scoped stream seek is bounded.
- Device suspension while hidden and explicit unlock on return; asynchronous media rejection releases ownership and reports a bounded diagnostic. Available Web Audio base/output latency is exposed separately from scheduling.
- PIF6 with separate integrity-covered WAV members and content-addressed working audio. Existing project readers remain supported; old editors reject unsupported new features. Keep backups.
- Original seven-joint/two-actor workshop with walking, turning, attack, collision wall, footstep/impact/UI sounds and streamed synthetic ambience. W walks, E turns, F attacks. Trust only scripts you know; unlock sound explicitly.

## Downloads

Linux x86-64 AppImage, Windows x64 ZIP, source ZIP, workshop PIF and SHA256SUMS are attached. Extract the entire Windows ZIP; run `Pinefall Engine.exe`. On Linux, mark the AppImage executable; FUSE may be required. `--appimage-extract` provides an alternative for inspecting/running the payload where appropriate.

Packages are unsigned. Windows executable resource editing/signing was disabled for this cross-build; native Windows execution is unverified. Verify the checksums and trust the source before executing. Do not bypass OS protections merely to dismiss a warning.

## Executed validation

125 unit/headless tests, 644 assertions; TypeScript/Oxlint; production build; animation/animator/root-motion/runtime/audio/streaming/PIF/assets browser regressions. Real analyser output and 100 streaming lifecycle cycles pass in Chromium and Linux Electron, with stable tracked reservations. The packaged Linux editor and standalone workshop pass import/preview/draft/focus, wall/attack/turn and paused UI output checks. Linux AppImage and Windows ZIP packaging succeeded.

Test rendering here used SwiftShader. These results are not CEDAR measurements, physical listening QA, native Windows execution, independent acceptance, or proof of a hard process/GPU memory cap. Streaming is PCM16 WAV only (4 MB per source, 8 MB catalog, up to 240 seconds); effects remain limited to 30 seconds/32 MiB aggregate decoded PCM. No compressed-codec or sample-accurate streaming claim is made.

This full release supersedes the earlier stable downloads. Hardware/listening findings should be reported for follow-up patches. The broader shared UI component/layout refactor remains the next work item.
