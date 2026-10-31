# Pinefall Engine 0.1.1 — experimental foundation

A separate TypeScript 3D runtime and visual workshop, built with Bun, Three.js, Rapier and React. The original Pinefall game is unchanged. This is a small usable engine foundation, **not Unity feature parity or a production-certified engine**.

## Run

```sh
bun install
bun run dev           # editor, localhost:5173
bun run check         # strict TypeScript + Oxlint
bun test              # schema/history/events/real physics tests
bun run build         # editor and standalone player
bun run desktop       # Electron editor
bun run desktop:linux # AppImage
bun run desktop:windows # Windows zip
```

Browser tests: `bun x playwright install --with-deps chromium`, start the dev server, then `bun run test:browser`. The tests deliberately request SwiftShader for reproducible headless rendering. Do not use that flag as a hardware-performance recommendation.

## Included

- Independent runtime API (no React/editor imports), optional authoring controls; React editor consumes that API. Orbit/transform controls currently live inside the runtime rather than in a separate adapter.
- Hierarchy selection/search, translate/rotate/scale gizmos, component inspector, duplication/deletion, bounded undo/redo, local autosave, scene JSON import/export.
- Primitive assets, self-contained embedded GLB import (2 MB/import), prefab subtree JSON export/import. Imported geometry uses manually assigned primitive collision proxies; no automatic mesh collision cooking or animation editor.
- Rapier fixed-60-Hz physics, dynamic bodies, CCD, sensors, kinematic character movement, gravity, jumping, checkpoints, collectibles, goal triggers and arcade vehicle logic. Driving is not a realistic suspension/tire simulation.
- Four selectable starters: **The Last Signal** (third person), **Lantern Gallery** (first person), **Valley Courier** (driving), **Gravity Garden** (physics sandbox).
- Play/stop isolation restores the authored scene, including removal of runtime-spawned crates. Scene edits are disabled while playing.
- Low preset: 960×540 maximum render buffer, 30 FPS target, no shadows/post/beam effects by default. High preset: 1600×900 maximum, 60 FPS play target, sun shadows and optional effects. These are caps/targets, not performance guarantees.
- Standard lit materials, hemisphere/sun/point/spot lights, distance/frustum culling, fog, optional five-tap threshold glow and exposure. **Volumetric-style beams are translucent shader cones, not physical ray-marched volumetrics.** No HDR bloom pipeline.
- On-screen stats and bounded 200-entry event console with JSONL export. Desktop adds rotating local startup/renderer/crash logs (512 KB rotation). This is local diagnostic logging, not a distributed tracing/SLO platform.
- Secure-context-isolated Electron shell, native save dialogs, Linux AppImage and Windows zip build recipes. Renderer has no Node access.

## Workflow

Choose a starter in the bottom bar. Click an object or hierarchy entry; double-click to frame. Add primitives from the asset shelf. Numeric edits commit on blur/Enter. Press Play; stop before authoring. Export your scene to keep a portable backup. Browser autosave may fail when storage quota is full; exported files are authoritative backups.

WASD move/drive; Space jump/brake; Shift sprint; R recover; Escape pause; drag to look. First-person double-click requests pointer lock where supported. Sandbox uses orbit controls and spawn/impulse buttons.

`game.html` runs without React or the editor. Its Load scene button opens exported scenes. The editor's Player link opens the **selected stock template**, not unsaved modifications; load your exported JSON in the player to run a customized scene. Desktop: use the application menu to open the player/editor (popups are intentionally blocked).

## Code-first

```ts
import { Engine } from "./packages/runtime/src";
import { createTemplate } from "./examples/templates";
const engine = await Engine.create(canvas);
engine.registerBehavior("custom", ({ engine, entity }) => ({
  update(dt) {
    const object = engine.objects.get(entity.id);
    if (object) object.rotation.y += dt;
  },
}));
await engine.load(createTemplate("adventure"));
engine.play();
// await engine.stop(); engine.dispose();
```

Behavior factories support start, fixedUpdate, update, trigger, and dispose hooks; see `packages/runtime/src/behaviors.ts`. Register trusted code before loading/playing a scene. Scene JSON contains behavior names, never executable code. Camera rigs default to the template mode. Override independently with `engine.setCameraRig("orbit" | "first-person" | "follow" | "vehicle" | "auto")`; overrides are runtime settings, not serialized scene components.

## Desktop / older GPUs

Requires working WebGL 2 through Chromium/ANGLE. **No fake 2D fallback.** If unavailable, the editor explains the failure while preserving scene export. On Linux, try launching with `--legacy-gl` to request X11 + ANGLE OpenGL and disable Vulkan. This does not patch Chromium/Mesa, bypass every driver restriction, or prove CEDAR support. No GPU sandbox disabling is built in. Quality/effect settings are in the Rendering inspector. Driver startup flags currently require relaunch via command line.

Binaries are unsigned. Windows packaging is not Windows runtime validation. CEDAR/Wayland hardware is untested. Native display-server/runtime prerequisites are still required on Linux.

## Validation and limits

Validated locally: strict TypeScript; Oxlint; 6 unit/physics tests (17 assertions); Chromium/SwiftShader browser smoke covering four-template play/stop, crate spawn, high effects and standalone player, with zero page errors. Screenshots in `docs/` are actual captures. Linux/Windows package generation succeeded; physical-GPU and Windows execution remain unverified. No long-duration memory/performance certification.

This version is deliberately limited: primitive procedural art; no skeletal animation workflow, audio system, navmesh, terrain sculpting, multiplayer, visual scripting, full asset dependency database, packaged per-project exporter, or full scene/component extensibility. Imported assets are loaded again on authored edits rather than incrementally patched. Maximum 500 entities, 8 lights, 16 embedded assets and 8 MB embedded asset strings. Synchronous custom-behavior exceptions disable that instance and emit a structured error; other instances continue and cleanup still runs. This does not protect against infinite loops, asynchronous rejections, malicious plugins, or throwing event subscribers. Small desktop viewports hide the inspector; use a desktop-size window for authoring.

Generated dependencies, build outputs and packages are rebuildable. No engine GitHub repository/release has been published.

## 0.1.1 additions and publication

- Camera rigs can be selected independently of starter type; switching to orbit no longer forces a follow camera on scenes containing a player.
- Behavior factory/start/fixed-update/update/trigger/dispose exception isolation with entity, behavior and hook diagnostics.
- Eight unit/physics tests (23 assertions) pass. Additional real-browser runtime integration verifies spawn/stop restoration, camera override, character movement and script exception isolation (`bun run test:runtime-browser`). Rendering tests use SwiftShader, not physical hardware.
- Tag-triggered GitHub Actions builds Linux and Windows packages on their respective OS runners, attaches source plus SHA256 sums, and publishes a prerelease only after both packaging jobs succeed. Native gameplay testing is not performed by that workflow.

**Publication remains pending authentication.** From this source folder on your authenticated development machine:

```sh
gh auth login
gh repo create abdou-da0wew/Pinefall-Engine --public --source=. --remote=origin --push
git push origin v0.1.1
```

If the repository already exists, configure its remote instead of recreating it. GitHub must allow Actions for the release workflow. Do not paste access tokens in chat or store them in source. The 0.1.0 local desktop binaries predate these improvements; CI will build 0.1.1 from its tag.
