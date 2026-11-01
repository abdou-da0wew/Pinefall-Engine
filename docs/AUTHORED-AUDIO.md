# Authored buffered audio and combined workshop

Date: 2026-11-01. Released as 0.6.0; hardware/listening acceptance deferred to owner, not certified. Current gate ledger: [PLAN02-ACCEPTANCE.md](PLAN02-ACCEPTANCE.md).

## Implemented contract

Scene3 `audio` contains AudioDefinition1: assets, cues and effects/music/dialogue/ui bus gains. An entity's `audioCues` maps animation marker names to retained cue IDs. PIF6 stores separate `audio/<index>.wav` members under the existing integrity inventory. Older projects remain readable; attempts to downgrade audio-bearing projects reject. Integrity is tamper detection against a trusted digest, not author authentication.

Portable definitions use embedded `data:audio/wav;base64,` resources. Working documents use SHA-256 session-blob references instead: undo, scene edits and checkpoints do not repeatedly clone base64 strings. The blob inventory includes audio for worker transport and recovery; portable JSON and PIF materialize the bytes. Missing blobs reject rather than silently losing audio. Importing identical bytes selects the existing audio asset rather than decoding a duplicate.

Limits: 16 assets, 128 cues, 32 marker bindings per entity, 100-character IDs with prototype-sensitive names rejected. Only PCM16 WAV, mono/stereo, 8–96 kHz, 0.02–30 seconds for effects or up to 240 seconds for explicit streams, and 4,000,000 bytes per source. Aggregate source admission is 8,000,000 bytes; aggregate float32 PCM estimate is 32 MiB. Base64 admission yields cooperatively. Conversion/decode is serialized and generation-cancelled; replacement/disposal retains source buffers until pending work settles. These are tracked admission budgets, **not hard process RSS/GPU caps**.

Each cue chooses an asset, bus, gain (-80 to +6 dB), priority (0–1000), looping, spatial mode, inverse-distance parameters and late-event policy. The common VoiceSystem admits 24 active voices plus 4 fade tails. Handles carry generations; scoped ownership is distinct from spatial emitter identity. Script disposal and callback faults release scope-owned audio; explicitly persistent music is transferred to the application audio service. Explicit stop cannot take another script's handle.

## Scheduling and lifecycle

- Device unlock requires an explicit user action. Locked effects return blocked and are not replayed later. A later decoder/device failure reports a fault; source validation failure during world staging retains the previous live world.
- Game events use a simulation/device epoch with 15 ms lookahead, 30 ms late-drop threshold and 100 ms maximum scheduled delay. Discontinuities reset the epoch. These scheduling numbers are **not measured acoustic latency**.
- UI cues use immediate device time, not frozen simulation time. Paused game cue requests reject before touching the epoch.
- Buffered game voices pause with their logical cursor and restart sources on resume; UI remains responsive. Successful world adoption clears scene voices/previews but preserves explicit persistent streams. Stop/application disposal clears all voices, including persistent music.
- Spatial emitters use equal-power inverse-distance panners; owner position updates are capped at 30 Hz. The graphical runtime supplies the camera listener. Headless emits explicitly `not-rendered` commands, not fictitious sound-output success.
- Preview handles are separate from gameplay handles. Closing the studio stops previews and restores authored bus gains. Live mixer adjustments are audition-only unless authored gains are applied.

## Editor and SDK

Open **Audio studio** for import, source metadata, explicit unlock/preview, mixer, cue JSON and per-entity/per-clip marker bindings. Invalid drafts retain accepted definitions. Removal explicitly confirms deletion of the asset, referencing cues and marker bindings; undo can restore the project. Device actions are blocked while a replacement scene is loading. This is an on-demand dialog; broader shared-component/layout refactoring remains after Plan02.

Trusted scripts use `ctx.audio.play(cueId)`, scoped stop/fade/stream seek and bus controls; ordinary gameplay does not create Web Audio nodes. Spatial script playback obtains the owning entity position. Animation marker bindings require no script. See `packages/scripting/src/sdk.ts` for current exact signatures, rather than the older plan's proposed interfaces.

## Original integrated tutorial

Open `examples/projects/animation-audio-workshop.pif` in the editor or standalone player. Trust its included original controller script and explicitly unlock audio. W walks, F attacks, E turns 90 degrees. A second independently animated actor walks automatically; a low wall demonstrates collision-correct root motion without obscuring the actors. The HUD counts attack hits and has a UI sound button that remains usable while paused.

All geometry, seven-joint skin, four source animations and enveloped synthetic WAVs are generated locally by `examples/animation-audio-lab.ts`; no downloaded character/audio artwork is redistributed. The generator reuses the repository's owned GLB/WAV fixture encoders.

Regenerate and validate:

```sh
bun run generate:animation-audio
bun run check
bun test tests
bun run desktop:build
bun run dev # separate terminal for development-browser tests
bun run test:authored-audio
TEST_NATIVE=1 xvfb-run -a bun run test:authored-audio
bun run game export-web examples/projects/animation-audio-workshop.pif build/animation-audio-export
bun run test:animation-audio-export
TEST_NATIVE=1 xvfb-run -a bun run test:animation-audio-export
```

Export refuses an existing destination. Use a fresh directory or intentionally remove only the generated export before regenerating. The export test expects the documented directory. Native workshop tests load the compressed PIF through the packaged standalone player; browser tests exercise the exported directory. Electron tests use temporary isolated profiles. Test-only no-sandbox/SwiftShader flags are sandbox-environment accommodations, **not shipping hardware configuration advice**.

## Executed evidence

- Check: TypeScript/Oxlint pass, 160 files, zero warnings/errors.
- Full suite: **125 tests / 644 assertions / 23 files**.
- Authored-audio tests: **9 tests / 61 assertions** covering PIF6/downgrade, blob/portable roundtrips, marker/UI epochs, scope isolation/faults, failed staging, pending decode replacement/disposal and combined workshop.
- Browser runtime: real analyser output after gesture, game pause/UI/resume, panner position, failed-stage retention, 100 Play/Stop cycles with stable tracked reservations, zero voices and one 12,800-byte PCM buffer at rest.
- Browser and Linux Electron editor: import/deduplication, explicit unlock/preview, invalid-draft isolation, removal and focus return.
- Exported browser and Linux Electron PIF player: wall stop, one attack hit, turn/recovery, actual paused UI output, no page errors. Workshop screenshots inspected; wall visibility and native HUD overflow corrected. HUD overflow is now asserted.
- Production desktop build passes. Existing large-chunk warning remains. Software rendering here does not certify CEDAR performance.

## Streaming and persistent music

Set an audio asset's `mode` to `"stream"` and use a nonspatial music-bus cue. The editor automatically streams WAVs longer than 30 seconds; the import checkbox also permits short streaming tracks. Sources remain within PIF integrity coverage; external URLs and unsupported codecs reject. The media-element backend does not convert an entire track into an AudioBuffer. Two simultaneous media elements are admitted; up to 18 backing source slots allow the current 16-asset catalog plus two retained persistent sources. Source reservations cover bounded blob backing; native decoder memory is not a hard guaranteed cap.

Set a streaming music cue's `persistent` to true to retain it across successful world adoption and scope disposal. Game pause leaves persistent music running; hide suspends all device output and media cursors. Returning requires explicit unlock; the game remains paused. Stop/dispose terminates persistent music. Replaying an identical persistent cue/source returns the existing voice and transfers scoped handle ownership rather than creating duplicate background tracks. Changed cues can crossfade within the two-stream ceiling; this is not sample-accurate synchronization. New scene bus gains apply to retained music as well.

`ctx.audio.seek(handle, seconds)` checks ownership and the source duration. Buffered effects do not support this seek API. An asynchronous media-play rejection ends the voice and records `Audio stream failure`; it is not silently counted as continued output. Browser backend statistics expose stream counts/error and available base/output latency seconds.

The combined tutorial now includes original 31-second streamed ambience. Trust-and-play in the standalone player performs gesture-bound unlock before starting script callbacks.

Additional tests: `bun test tests/streaming-audio.test.ts` (2 tests, 16 assertions); `bun run test:streaming-audio`; `TEST_NATIVE=1 xvfb-run -a bun run test:streaming-audio`. They cover portable long-track persistence, codec/profile rejection, idempotent persistent playback, two-stream overflow, ownership, 100 seeks, real output, suspension, world replacement, explicit Stop, injected media rejection and 100 cycles with stable tracked reservations. The native workflow also runs against the packaged Linux executable using `TEST_DESKTOP_EXECUTABLE`.

## Owner-deferred acceptance

Physical Linux/Windows listening, measured audiovisual alignment and device recovery, CEDAR execution, native Windows execution and independent acceptance. The owner will perform these tests and explicitly authorized publication without them. See the gate ledger; no hardware pass is claimed. Broader UI modularization has not started.
