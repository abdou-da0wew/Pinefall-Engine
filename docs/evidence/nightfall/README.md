# Nightfall Keep verification — 2026-11-03

Source version **0.8.0-dev.0**. This is a **separately packaged game/update**, not a new stable engine release. The latest published base remains v0.7.1. [Game instructions and implementation limits](../../NIGHTFALL-KEEP.md).

## Passed

- Repository-wide Prettier formatting/check, TypeScript, Oxlint and Biome: clean.
- `bun test tests`: **177 passed, 0 failed, 1,089 assertions, 40 files**.
- Eight Nightfall-specific unit/integration tests: input validation, ammo/cadence/reload/death rules, shared navigation, actual trusted headless game movement/waves/death/restart, narrowly scoped desktop permission policy, one-tick mouse press retention, real Rapier projectile damage against an animated enemy, PIF/folder resource and atmosphere roundtrips. Restart position is checked, not only the health label.
- Real Chromium/SwiftShader browser game: explicit trust, image/model rendering, a quick mouse shot, R reload without recovery teleport, weapon switching, movement, live enemy wave, nonzero Web Audio output, accelerated death, Enter restart, Escape pause/resume and High profile. Zero script/page errors at the assertion point.
- Production Vite/desktop build and SDK generation. Vite reports its existing large-chunk advisory; this is not a runtime error or a claim of small engine bundle size.
- Built Linux Electron: Home game entry, bundled portable PIF load, explicit script/audio start, actual pointer capture permission, shot and pause. Production sandbox/context isolation remain enabled; only the root-run test harness uses `--no-sandbox`.
- Standalone production export: six reachable JS/worker/WASM build assets, local PIF load, High profile, trust, firing, HUD/draw stats, pause and screenshot. Zero page errors or missing resource responses. This test uses the production build, not the Vite source module loader.

## Screenshots

- [Title](title.png)
- [First watch / Low](first-watch.png)
- [Animated Wretch approaching](approach.png) — the test places an already spawned live actor ahead of the player for repeatable framing.
- [Death](death.png) — simulation accelerated by the test, not a real-time endurance run.
- [High profile](high-profile.png)
- [Built Linux Electron pause](native-pause.png)
- [Production standalone pause](production.png)

Text logs: `check.txt`, `unit.txt`, `browser.txt`, `native.txt`, `export.txt`, `build.txt`.

## Issues caught and corrected

1. Mouse down/up could fall entirely between fixed ticks. A bounded one-tick press latch now preserves quick clicks and keyboard edges; pause/focus/UI changes clear it.
2. Negative offsets were incorrectly used for right/bottom/center HUD anchors. Coordinates now match the engine UI anchor contract.
3. An authored post stack took precedence over Low's legacy toggle. The game now supplies an explicit preview-post override for each quality.
4. Pause menus could receive locked-pointer clicks at the wrong screen location. Pausing releases capture, and the menu follows both pause and resume.
5. The optional cosmetic spotlight cone was visible from inside the camera-mounted flashlight. The game hides that cosmetic cone while retaining the actual spotlight and fog.
6. Kinematic teleport could retain its old next-step target. Script teleport now sets both current and next kinematic translation; the restart assertion checks the spawn location.
7. Regeneration/export could retain stale generated assets and ZIP entries. Generated output directories and prior ZIPs are replaced before packing.
8. The first production screenshot attempt timed out while the pointer was captured. The final production test explicitly pauses/releases capture before its screenshot and passes.

## Not certified

Physical Radeon CEDAR, physical Windows execution, hardware GPU timings, long-duration endurance, subjective sound quality and owner/independent acceptance are unverified. SwiftShader's low frame rates and catch-up discard warnings in this small CPU-only test environment are not hardware-performance measurements. Functional audio signal detection is not a listening test. The game is a stylized first playable delivery, with one shared enemy rig and resident map, not final photorealistic art, navmesh streaming or a campaign.

## Separate game packaging

Linux AppImage and Windows ZIP built with the game-only Electron bootstrap, not the editor executable. The packaged Linux game passed direct launch, portable PIF load, trust/audio start, pointer capture, fire and pause. It has no editor preload/IPC bridge. Windows execution remains unverified. Publication uses the independent `nightfall-v0.1.0` game tag; engine export improvements are a separate follow-up.
