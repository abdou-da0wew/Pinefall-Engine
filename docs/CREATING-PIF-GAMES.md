# Create and ship a Pinefall PIF game

Nightfall Keep 0.1.0 is a separate game, not engine-core gameplay. Its release supplies a portable `.pif`, an editable folder ZIP, web ZIP, standalone Windows/Linux game packages and matching source. The engine may pre-ship the PIF as sample content. The game packages launch the game directly, without editor UI, project IPC or a development server.

## 1. Start an editable project

Install Bun and the matching source dependencies with `bun install --frozen-lockfile`. Open the desktop editor, create a game from one of the four starters, and bind a project folder. Keep edited projects outside generated `build/` directories. The authoritative workflow is folder → external TypeScript/assets → validate → explicit Apply → trust → Play. Never rely on embedded source editors or implicit execution of downloaded scripts.

For this sample, extract `Nightfall-Keep-project.zip`; open its project folder using the matching engine source. Public engine v0.7.1 predates the new FPS input contract. Use the release's matching source when editing this game.

## 2. Separate game data, rules and adapters

- `examples/nightfall/generate.ts` authors entities, materials, lights, HUD, sound cues, model references and script attachments.
- `scenery.ts`, `wretch.ts` and `glb.ts` construct original GLBs. Imported resources use the existing engine asset/import pipeline.
- `scripts/Rules.ts` contains DOM-independent combat, ammunition and navigation rules. These are ordinary game modules, not engine features.
- `scripts/Director.ts` adapts those rules to `@pinefall/sdk`: Rapier motion/raycasts, animation graphs, owned audio, UI updates and pooled objects.
- `player.ts` is the game-specific launch/pause presentation around the existing `Engine`. It is not another renderer or physics engine.

Give assets stable, meaningful names. Register referenced helper modules in the project's script inventory. Keep scripts under the engine's source budgets. Stop/disable cleanup must release subscriptions and owned sound; restore modified device/input settings. Imported code is trusted code, not a secure sandbox.

## 3. Use the engine's systems

Authored scene entities carry transform, mesh, physics, light and animation definitions. Move a kinematic actor using the engine physics controller, rather than overwriting only its visual transform. Use swept segment raycasts for fast bullets to avoid tunneling. Runtime pooled actors need both `entity.enabled` and physics-body state updated; visual visibility alone is insufficient.

First-person games can configure `recoverKey: null` to use R for reload and `pointerLockOnClick: true` for capture. Mouse/key pulses are latched into fixed-tick input. Preserve and restore input settings on disposal. Use built-in pointer capture with drag fallback; do not install an unrestricted OS keyboard hook.

Use imported animation clips and animator states for skeletons. Use procedural viewmodel transforms for recoil/bob/reload when appropriate. Feed the engine UI store rather than rebuilding a separate HUD framework. Unlock audio from a deliberate user gesture; supply spatial positions for positional cues. Bound voices, projectiles, effects, actor counts and navigation work.

## 4. Create original content and make a readable level

Nightfall's generated albedos are in `examples/nightfall/art`; runtime textures are 1024px JPEGs. Its forest sectors merge static foliage/rocks while preserving cullable mesh bounds; collision trunks remain separate. The castle has actual walkable collision spaces. Synthesized WAVs are original effects, not claimed recordings.

You can replace GLBs/WAVs/textures with your own licensed assets through the same import/catalog paths. Retain source attribution and licenses. Verify imported scale, UVs, skeleton names and clip ranges. Do not silently increase engine resource budgets to accommodate an unoptimized map.

## 5. Build the portable game and test roundtrips

From this release's source:

```sh
bun run generate:nightfall
```

This replaces generated `build/nightfall/project`, writes `public/Nightfall-Keep.pif`, and copies the portable game to `build/nightfall/Nightfall-Keep.pif`. Folder files are separately editable; PIF uses the engine's compressed, integrity-checked portable format. Assets and scripts are included, not external CDN links. Integrity hashes detect changes/corruption; they do not prove the publisher is trustworthy.

The sample generator is not a general editor export wizard. For another game, author its own scene/generator or use the existing project save/export workflow. A deeper general-purpose export utility is a separate engine update, not falsely claimed complete here.

## 6. Build web and standalone desktop distributions

```sh
bun run check
bun test tests
bun run desktop:build
bun scripts/export-nightfall.ts
bun scripts/package-nightfall.ts
```

The web exporter copies only reachable production build dependencies and the PIF, plus a small Bun static server. Extract the web ZIP and run `bun serve.ts`, or host the files using an ordinary HTTP server. Browser `file://` is not supported for the worker/fetch workflow.

The game-specific packager builds `examples/nightfall/desktop.ts`, a minimal Electron shell, around that same production web player. The shell uses sandboxing, context isolation, no Node integration/preload, no editor bridge, and narrowly scoped pointer/fullscreen permission. It emits a Linux AppImage and Windows ZIP under `build/nightfall/releases`. Users do not need Bun or an installed editor to run those game packages. Do not rename the editor executable and call that a standalone game.

The current sample packaging recipe needs Bun, Node, zip, the pinned dependencies and electron-builder's platform tooling. Windows ZIP cross-packaging on Linux is supported by this recipe; it is not Windows execution testing or signing. Native artifacts are unsigned.

## 7. Validate before publishing

```sh
bun test tests/nightfall.test.ts
# With the source Vite server on port 5174:
bun tests/nightfall-browser.ts
# With exported web game served on port 4175:
bun tests/nightfall-export.ts
# Linux packaged game (root-only test harness uses no-sandbox):
TEST_GAME_STANDALONE=1 TEST_DESKTOP_EXECUTABLE="$PWD/build/nightfall/releases/linux-unpacked/nightfall-keep" xvfb-run -a bun tests/nightfall-native.ts
```

Check actual ray hits and wall obstruction, ammo accounting, reload cancellation, animation, audio signal, supplies, pause, death/restart, clean page/engine logs, bounded resources, PIF/folder roundtrips and production-worker dependencies. Test screenshot capture after releasing the mouse. Then perform real-device timing/listening and platform execution checks. SwiftShader results are not physical AMD CEDAR measurements.

## 8. Publish independently of the engine

Use a game-specific tag such as `nightfall-v0.1.0`; do not overwrite an engine release or imply the game is engine-core functionality. Include the PIF, editable folder, web build, actual game executables, matching source, this guide and SHA-256 checksums. Review script trust and unsigned executable warnings. Upload to a draft, verify every asset size and digest, then publish. Credentials belong only in a transient process environment, never source, Git URLs or repository configuration.

The release publication helper for this sample is `scripts/publish-nightfall.ts`. The next engine export update should generalize the packaging recipe with explicit game manifests, safe output directories, dependency closure checks, platform settings, reproducibility and an editor workflow—without hardcoding Nightfall into the engine.

## Play Nightfall Keep

WASD move; Shift sprint; mouse aim/fire; R reload; 1/2 select weapons; E supplies; F flashlight; Escape pause; Enter retry after death. Windows: extract everything and run `Nightfall Keep.exe`. Linux: chmod +x the AppImage and launch normally. It is a stylized wave-survival first release with one shared enemy rig, two weapons and a resident 160m forest/castle map. Physical Windows/CEDAR, subjective listening and long-duration hardware validation remain unverified. See the source's game guide and evidence directory for precise implemented scope.
