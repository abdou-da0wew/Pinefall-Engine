# Plan02 foundation: executable AA0 slice

This is subsystem groundwork and an integration lab, **not completion of Plan02**. Existing game scenes do not automatically acquire animation graphs or audio cues. Authored schema/PIF integration, editor panels, root motion and script lifecycle wiring follow the execution contract in `PLAN02-EXECUTION.md`.

## Run the lab

```sh
bun run dev:animation-audio
```

The dedicated server uses port 5175. Its entry opens two instances of the pinned external Blender character. Fetch the fixture first on a fresh checkout:

```sh
bun tests/dcc-fidelity.ts --fetch
```

The lab also links to a self-contained synthetic skinned rig. External character files stay in the excluded cache and are hash-verified; their binaries are not redistributed. Use **Run animation** for fixed-tick presentation, **Step animation** for explicit intervals, **Enable audio** to unlock the device without playing anything, and **Play cue** for the synthetic PCM cue. The marker-triggered tone is a demonstration, not an authored/calibrated footstep. The lab is a development fixture, not a replacement for the Electron editor or the eventual character preview panel.

## Animation ownership and clock

`packages/animation/src/index.ts` exports `ClipClock`, marker types and `ThreeClipPlayer`.

- The clock contains no DOM or renderer dependency. Duration is finite, 0.001–86400 seconds; speed is -8..8; a single advance is bounded to 3600 seconds. Normal engine integration should supply fixed ticks, not that maximum.
- Marker arrays are cloned and frozen, at most 128. At most 64 deliveries are adopted per advance. Overflow pauses the action, reports `overflow: true`, and leaves the previous cursor/events unchanged. Seeking clears the diagnostic but does **not** silently unpause the action.
- Forward marker crossings use `(previous,current]`; state-entry markers at zero require `entry: true`. Zero-time loop events require `repeat: true`. Other markers repeat unless `repeat: false`. Equal-time delivery follows authored order.
- Per-marker loop high-water marks prevent replaying an already delivered activation/marker/loop key after a rewind. A new player activation gets a new token. Reverse sampling emits no markers. Compensated accumulation avoids the demonstrated half-second event drifting from tick 30 to tick 31.
- `seek()` emits no events, preserves the current iteration identity, and can display the exact end pose even for a looping clip. There is no save-state/graph revision contract yet.
- `ThreeClipPlayer(root, clipMap)` consumes explicit clip IDs and validated immutable Three clips. Each player owns its mixer and bindings, not geometry, materials, skeleton leases or clips. Call `dispose()` before releasing the model lease. Repeated disposal is safe; operations on a disposed player reject.
- This adapter supports single-clip play/stop/seek/speed/loop sampling. Crossfades, state graphs, masks, 1D blends and root-motion extraction are **not** implemented by this first slice. Stable persisted clip-ID resolution belongs to AA1; supplying a map is not an authored asset-binding implementation.

## Audio ownership and first decoder

`packages/audio/src/index.ts` exports `VoiceSystem`, `BrowserAudioBackend`, `NullAudioBackend`, `inspectWave` and their contracts.

- The first decoder accepts little-endian PCM16 RIFF/WAVE, mono/stereo, 8–96 kHz, 0.02–30 seconds, at most 4 MB encoded input. RIFF/chunk bounds, layout, duplicate data and PCM expansion are checked before allocation. Other encodings reject explicitly; native compressed codecs/streaming are not claimed.
- Browser decoding is cooperative PCM conversion with cancellation checks, one in-flight decode and a 32 MiB decoded cache. PCM allocations participate in Plan01's shared accounting. This is an estimate, not an OS-enforced memory ceiling. Disposal invalidates decoding and waits for in-flight work to release its reservation.
- `unlock()` must be called from a user gesture. Device suspension produces `blocked`, not audible-success status. The browser backend uses actual AudioBuffers, fresh source nodes, per-voice gains, effects/music/dialogue/UI buses, a master gain and an output meter. Short entry/exit gain ramps are implemented; click-free quality still requires audible QA.
- Default policy: 24 active voices and four release tails. There can additionally be one staged candidate source during transactional replacement. Higher bus role wins (UI, dialogue, music, effects), then authored priority, then oldest handle. These role semantics are explicit, not psychoacoustic audibility estimates. A failed replacement start does not evict the old active voice.
- Reset invalidates old generation-tagged handles. Release tails have their own bound and the oldest tail is forcibly disconnected on overflow. Actual source `ended` notifications clean owned nodes. Source buffers cannot be unloaded while a voice uses them.
- Browser results say `scheduled`, not “audible.” Null results and traces say `not-rendered`; the null backend advances logical completion without constructing AudioContext. The null backend is not evidence of sound output.
- Spatial panners, virtual looping cursors, game/UI pause policy, simulation-to-device epochs, device replacement, streaming, limiter and scope-bound script handles remain AA4/AA5 work. Raw `suspend()` affects the device, not only the game bus.

## Executed validation

```sh
bun run check
bun test tests
bun tests/animation-audio-browser.ts
bun tests/animation-audio-dcc.ts
```

The browser tests sample independently posed imported skeletons, actual Web Audio meter output after a user gesture, context suspension, cancelled decoding, disposal during decoding and 100 lifecycle cycles. The external Blender character has 38 joints and 124 total active mixer bindings across the two instances; temporary mixers/voices return to zero and model/audio ownership returns to the pre-instance baseline on disposal. Immutable source/cache blobs retain their own separate ownership.

No physical audio/visual ±30 ms result, real-device latency, Windows execution or audible approval follows from these tests. No Plan02 desktop release has been published.
