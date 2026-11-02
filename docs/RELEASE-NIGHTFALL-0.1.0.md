# Nightfall Keep 0.1.0 — separate Pinefall game

A playable, original survival-horror wave FPS in a dark forest with an explorable castle. **This is a game release, not a new stable engine release.** It is also pre-shipped as a sample PIF in the matching engine development source.

## Download and run

- **Windows x64 ZIP:** extract the entire archive and run `Nightfall Keep.exe`. No Bun or editor installation required.
- **Linux x64 AppImage:** make executable and run normally. Without FUSE, use `--appimage-extract`, then `squashfs-root/AppRun`.
- **Nightfall-Keep.pif:** portable game with scripts/assets.
- **Editable project ZIP:** separated scene/material/script/model/image/audio files.
- **Web ZIP:** static web distribution; run the included `bun serve.ts` or use an HTTP host.
- **Matching source ZIP:** game generators, scripts, packaging recipes, tests and engine runtime prerequisites.
- **Creation guide:** how to author, test, package and release more PIF games.
- **SHA256SUMS:** verify all seven other assets.

The standalone executables open the game directly, with no editor menus, project-management bridge or embedded IDE. Production sandbox/context isolation are retained. Executables are unsigned. Windows was built, not execution-tested.

## Implemented

160×160m resident forest/castle/cemetery; 182 collidable trees; two weapons, swept ballistic projectiles/pellets, ammo/reload, recoil and viewmodel animation; shared navigation and twelve pooled animated enemies; increasing waves, supply caches, stamina, health, score, death/restart; spatial effects and synthesized ambience; authored HUD, fog, moon/lantern/flashlight lighting and selectable quality.

Controls: WASD / Shift; mouse aim and fire; R reload; 1/2 weapons; E supplies; F flashlight; Escape pause; Enter retry. Enter the Keep explicitly approves the included original scripts and unlocks audio.

## Validation and limits

177 unit tests / 1,089 assertions; repository-wide Prettier, TypeScript, Biome and Oxlint; real browser gameplay; production web dependency/load/fire checks; built Linux Electron and separately packaged Linux game launch/capture/fire/pause checks. Windows packaging succeeds. Visual evidence and full scope are in `docs/evidence/nightfall` and `docs/NIGHTFALL-KEEP.md` in source.

Stylized first playable release, not a photorealistic campaign. Enemy variants share one rig. Physical CEDAR/Windows execution, subjective listening and hardware endurance remain unverified. The latest published engine base remains v0.7.1; use the included matching 0.8.0-dev.0 source for this PIF's FPS input/night-atmosphere requirements. A deeper general engine export workflow follows separately.
