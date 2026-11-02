# Nightfall Keep

An original first-person survival-horror wave game built with **Pinefall Engine**. This is an executable game, not a scene mockup or a separate Three.js application. Pinefall owns rendering, imported models, physics, animation graphs, audio, script execution and HUD rendering. The game's trusted TypeScript modules direct those engine systems.

## Play

### Standalone PC game (no editor or Bun required)

Windows: extract **Nightfall-Keep-0.1.0-windows-x64.zip** completely and run **Nightfall Keep.exe**. Linux: make **Nightfall-Keep-0.1.0-linux-x64.AppImage** executable and launch it. If FUSE is unavailable, use `--appimage-extract` and run `squashfs-root/AppRun`. These are unsigned game packages, not the editor renamed: they start directly at the game and exclude the editor, project bridge and editor menus. Windows is packaged but execution remains unverified. Optional `--legacy-gl` / `--software-rendering` flags select the existing explicit graphics paths; never use `--no-sandbox` as a normal launch instruction.

### Downloaded web game

Extract **Nightfall-Keep-web.zip** completely. From that folder, run `bun serve.ts` and visit `http://localhost:4175`. Alternatively serve the folder with an ordinary static HTTP server. Do not open `index.html` directly with `file://` in a browser: workers/fetch need HTTP. Assets are local; no CDN, account or external art requests are required. Start with **Enter the Keep**, which explicitly trusts the bundled original scripts and unlocks audio.

### Engine source / Linux or Windows Electron

Install Bun and repository dependencies (`bun install --frozen-lockfile`). Run `bun run dev:nightfall` for the game-focused development server. `bun run desktop:build`, then `bunx electron .`, opens the desktop engine; choose **Play Nightfall Keep** on Home or in the application menu. The built desktop includes the portable game. The production renderer remains sandboxed. Windows runtime and physical legacy-GPU performance are owner-deferred, not verified by the Linux tests.

### Editable project

Extract **Nightfall-Keep-project.zip** and open its `project.json` / folder using Pinefall's project workflow. The portable **Nightfall-Keep.pif** can also be opened/unpacked by the current engine source. Scene JSON, materials, image/model/sound resources and TypeScript modules are separate files. Review scripts, validate external edits, explicitly Apply and trust before Play. The new ambient/sun-color fields need this working-tree engine implementation to reproduce night lighting; older public builds may discard those optional fields.

## Controls

| Action                            | Binding                     |
| --------------------------------- | --------------------------- |
| Move / sprint                     | WASD / Shift                |
| Aim / fire                        | Mouse / left mouse button   |
| Reload                            | R                           |
| Warden pistol / Reliquary shotgun | 1 / 2                       |
| Open nearby supplies              | E                           |
| Toggle flashlight                 | F                           |
| Pause, release mouse / resume     | Escape or menu              |
| Restart after death               | Enter, or Rise again button |

Click the viewport for pointer capture; drag-to-look remains available if the browser denies capture. Rendering quality and sound are in the pause/title menu. Fullscreen needs a user click and platform permission.

## The watch

A roughly **160 × 160 metre** bounded Blackwood forest surrounds the castle gate, courtyard and roofed keep; a cemetery and woodland supply sites reward leaving the central lane. There are four supply caches. Each wave adds enemies, with a maximum of twelve active enemy slots. From wave three, faster/tougher variants can appear, sharing the Wretch rig. Attacks have a wind-up and obstruction check. After a wave, caches reset, a small ammunition grant is awarded and a twelve-second intermission begins.

The pistol has a 15-round magazine; the shotgun has six shells and fires six independently swept pellets. Shots have finite travel speed and segment raycasts against the actual Rapier scene, including walls and trees. Head-height collider hits receive bonus damage/score. Reload takes time and weapon switching cancels it without creating ammunition. Sprint consumes regenerating stamina. Supplies restore limited health/ammunition. Death shows wave/score and restart resets the bounded actors and combat state. Best wave uses local storage when permitted, with a nonpersistent fallback.

## Art and implementation

- Original generated stone/forest-floor albedos, resized to 1024px JPEG runtime textures; originals retained in source.
- Seeded original forest geometry: 182 collidable trees, sector-merged foliage, grass and rocks; textured collision-built castle and cemetery.
- Original procedural pistol/shotgun meshes with hands, sway, recoil and reload transforms.
- Original rigid-weighted seven-joint Wretch with horns, talons, ribs, face coloring and imported Idle/Walk/Attack/Death animation clips. This is stylized low-poly art, not a photorealistic character or a motion-capture asset.
- Original synthesized WAV wind/drone, weapon, step, reload, growl, impact and bell cues. Spatial enemy/impact playback, pooled audio voices and explicit audio unlock. No recorded voice acting or licensed music is claimed.
- Authored blue night fog, moonlight and warm lanterns. High enables shadow maps/post FX; Low disables those passes and caps the framebuffer to 960×540 without replacing the map or art. The flashlight is a real engine spotlight.
- 365 authored entities, 259 physics bodies, four imported GLBs, twelve enemy slots, 32 projectile slots and sixteen impact slots. A shared 80×80 navigation distance field updates at most twice per second. No per-enemy A*, navmesh or world streaming is claimed.

## Rebuild and verify

From the engine repository (generation replaces `build/nightfall/project`; keep your edited projects elsewhere):

```sh
bun run generate:nightfall
bun run check
bun test tests
bun run desktop:build
bun scripts/export-nightfall.ts
```

Browser suite: start Vite on port 5174, then `bun tests/nightfall-browser.ts` (or set `TEST_BASE_URL`). Linux native suite: `xvfb-run -a bun tests/nightfall-native.ts`. Automated test harnesses may accelerate simulation to exercise death; this is not a real-time endurance/performance measurement.

## Current delivery boundary

Nightfall Keep **0.1.0** is a separate game release: portable PIF, editable folder, web distribution, standalone game executables and source. It is pre-shipped in the engine's sample content, not implemented in the engine core. The matching runtime prerequisites are in Pinefall Engine **0.8.0-dev.0** source; the latest published engine release remains v0.7.1. A deeper, general-purpose engine export update follows separately. See `docs/CREATING-PIF-GAMES.md` for the creation guide.

Browser and Linux Electron tests cover real rendering, mouse fire, reload, weapon switching, movement, trust/audio start, nonzero Web Audio output, pause and restart. Headless tests exercise actual script/physics combat, death, bounded actors and ammo/navigation rules. Exact results and screenshots are in `docs/evidence/nightfall` in the repository.

This first playable delivery is not a claim of finished AAA art, a campaign, broad hardware certification or subjective audio approval. Physical CEDAR/Windows, long-duration hardware timing and owner listening/independent acceptance remain unverified. The map is resident, not streamed; enemies share one skeletal model; weather, save-game progression, multiplayer and additional weapon/enemy art are not implemented.
