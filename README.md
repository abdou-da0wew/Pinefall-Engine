# Pinefall Engine 0.6.3-dev.0

<img src="public/pinefall-app-icon.svg" alt="Pinefall diamond logo" width="88" />

**Create 3D games visually, extend them with TypeScript, and build/test them headlessly.**

**Current development work:** desktop graphics settings without changing the UI appearance, plus larger-model admission. See [implemented behavior and remaining validation](docs/GRAPHICS-AND-LARGE-MODELS-STATUS.md). This is not a published 0.6.3 release.

**0.6.2 published:** searchable commands (F1), focus-safe shortcuts, scene/UI clipboards, disk-backed encoded assets, lazy model-library placement and actual-project Player preview (Ctrl+F5). [Release notes](docs/RELEASE-0.6.2.md) · [Shortcuts](docs/SHORTCUTS.md) · [Storage and limits](docs/DISK-ASSETS.md). [Published downloads](https://github.com/abdou-da0wew/Pinefall-Engine/releases/tag/v0.6.2).

**0.6.1 is published:** Home, verified recent snapshots, five starters, shared controls/dialogs and preferences. Marketplace remains TODO. [Release notes](docs/RELEASE-0.6.1.md).

**Plan02 implemented and released:** [0.6.0 downloads](https://github.com/abdou-da0wew/Pinefall-Engine/releases/tag/v0.6.0) include authored animation/root motion, PIF6 audio, bounded streaming/persistent music and the original combined workshop. The owner has deferred hardware/listening acceptance to their own testing; these checks are **not claimed as passed**. See [the gate ledger](docs/PLAN02-ACCEPTANCE.md).

**Plan01 candidate history:** versioned normalization, node/mesh/skeleton remapping, shared editor/CLI FBX conversion, transactional dependency scheduling, independent Blender/Maya pose tests, and PIF v4. See [pipeline usage](docs/ASSET-PIPELINE-USAGE.md) and [acceptance status](docs/PLAN01-ACCEPTANCE.md). Physical acceptance is not implied by passing software tests.

**0.5.3:** worker-based model parsing, cached instances, cancellable import/reimport, experimental FBX + PNG/JPEG conversion, and PIF v3 source provenance. This is a tested first asset-pipeline slice, not full Plan 01 completion. See [release notes](docs/RELEASE-0.5.3.md).

**Inherited from 0.5.2:** versioned project/editor metadata and SHA-256 integrity verification, plus real XZ-compressed `.pif` projects, separate asset/script files, cancellable worker open/save, desktop binary saves and project keyboard shortcuts. Includes the complete **0.5.0 UI toolkit**. See [PIF projects](docs/PIF.md) and [Game UI toolkit](docs/UI-TOOLKIT.md). Release preparation does not imply GitHub publication; verify the release page for availability.

Pinefall Engine is a separate TypeScript engine and editor built with Bun, Three.js, Rapier and React, with Linux/Windows Electron applications. This is an **experimental engine foundation**, not Unity feature parity or a production-certified engine. The original Pinefall game is unchanged.

## PIF v2 in 0.5.2

Current source writes portable project/editor metadata and a verified SHA-256 resource inventory. Strict verification and an optional trusted external digest are supported. These are integrity checks, not signatures. Published 0.5.1 reads only PIF v1; see [format compatibility and verification](docs/PIF.md).

## Historical first milestone (0.5.1)

The [implementation plan](docs/PLAN-0.6.md) was written before coding. The first milestone adds real XZ `.pif` project containers with separate resources, cancellable worker open/save, and project keyboard shortcuts. See [PIF format and current limitations](docs/PIF.md). At that milestone FBX, custom shaders and the expanded graphics pipeline were pending; see newer release notes above for subsequent FBX work. The 0.5.1 packages include this milestone; 0.5.0 packages contain the UI toolkit but not PIF support.

## Downloads

Release assets include platform packages, source, the original workshop and SHA-256 checksums.

[**0.6.1 release and checksums**](https://github.com/abdou-da0wew/Pinefall-Engine/releases/tag/v0.6.1)

- [Linux x86-64 AppImage](https://github.com/abdou-da0wew/Pinefall-Engine/releases/download/v0.6.1/Pinefall-Engine-0.6.1-linux-x86_64.AppImage)
- [Windows x64 ZIP](https://github.com/abdou-da0wew/Pinefall-Engine/releases/download/v0.6.1/Pinefall-Engine-0.6.1-win-x64.zip)
- [Source ZIP](https://github.com/abdou-da0wew/Pinefall-Engine/releases/download/v0.6.1/Pinefall-Engine-0.6.1-source.zip)
- [Animation/audio workshop PIF6](https://github.com/abdou-da0wew/Pinefall-Engine/releases/download/v0.6.1/Animation-Audio-Workshop-0.6.1.pif)
- [SHA256 checksums](https://github.com/abdou-da0wew/Pinefall-Engine/releases/download/v0.6.1/SHA256SUMS-0.6.1.txt)

Binaries are unsigned. On Linux, make the AppImage executable with `chmod +x Pinefall-Engine-0.6.1-linux-x86_64.AppImage`, then run it. AppImage normally needs FUSE; `--appimage-extract-and-run` is an alternative when available. On Windows, extract the **entire ZIP** and run `Pinefall Engine.exe`; do not move only the executable. Verify downloads against the checksums. Do not bypass OS security warnings unless you trust the source and have verified the package.

## Documentation

| Guide                                        | Contents                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| [Creating games](docs/CREATING-GAMES.md)     | New Game, GLB import, scene files, headless CLI/API, web export                     |
| [Scripting and SDK](docs/SCRIPTING.md)       | TypeScript editor, attachments, properties, hooks, helpers, events, script security |
| [Workspace and hierarchy](docs/WORKSPACE.md) | Phosphor icons, docking/resizing, collections, parenting, shortcuts                 |
| [Release notes](docs/RELEASE-0.5.1.md)       | Features, download contents, validation and known limitations                       |
| [Changelog](CHANGELOG.md)                    | Changes since 0.1.1                                                                 |
| [Third-party assets](THIRD_PARTY.md)         | Phosphor icon attribution/license                                                   |

## What's included

### Visual creation

- **New Game**: name your game and start from a blank playable world or one of four starters: The Last Signal, Lantern Gallery, Valley Courier, Gravity Garden.
- Hierarchy, transform gizmos, component inspector, bounded undo/redo, scene JSON import/export, local autosave and prefab subtrees.
- Self-contained GLB models with embedded materials/textures, multi-import, viewport drag/drop and reusable instances. Swap a player's visual model without removing its behavior/physics.
- Nested organizational collections, multi-selection, collapsible/searchable branches, world-preserving transform parenting and subtree duplication/deletion.
- Resizable panels, bottom/right shelf drag-docking, viewport focus, saved layout preferences, keyboard navigation, reduced-motion support, and locally bundled **Phosphor SVG icons**.
- Pinefall's diamond brand mark in warm sand (`#D8D1A7`) and sage (`#C4CFA4`), on forest green (`#14211B`) for application icons.

### Game UI toolkit

- Author panels, text, buttons, progress bars, toggles, sliders, text inputs and selects directly over the 3D viewport.
- Drag/resize with 8px snapping, editable anchors and reference resolution, nested panels, row/column layouts, typography, colors, background alpha, padding, borders and visibility.
- Typed `ctx.ui` APIs, lifecycle-scoped events and named actions. Updates work from `update`, `fixedUpdate`, physics `trigger`, event handlers and scripts.
- One-click sample HUD/controller, a runnable `examples/projects/ui-lab.scene.json`, Play/Stop isolation and headless `engine.ui.dispatch` testing.
- [Full UI authoring and SDK guide](docs/UI-TOOLKIT.md).

### Programmable gameplay

- Create/import/edit TypeScript in the Scripts panel; attach multiple scripts alongside a built-in behavior, with separate properties and state per attachment.
- Class or factory scripts with `start`, `fixedUpdate`, `update`, `trigger`, and `dispose` hooks.
- Typed SDK: input, timing, scene/entity queries, Three math/transforms, Rapier physics, spawn/destroy, events and logs. Share helper modules between scene scripts.
- Syntax checking in the editor and real TypeScript semantic checking through the CLI. Synchronous exceptions are isolated to the failing instance.
- Scripts travel with exported scenes and run in the editor, standalone player, or headless simulation **only after explicit code permission**.

### Runtime

- Real Rapier fixed-60-Hz physics, CCD, primitive colliders, sensors, kinematic character controls, gravity/jumping, arcade driving, checkpoints and collectibles.
- Configurable orbit, first-person, follow and vehicle camera rigs.
- Low preset: up to 960×540, 30 FPS target, shadows/post/beam effects off by default. High preset: up to 1600×900, 60 FPS play target, sun shadows and optional effects. These are targets/caps, not guaranteed performance.
- Standard lit materials, hemisphere/sun/point/spot lights, frustum/distance culling, fog, optional five-tap glow/exposure and **approximate translucent cone beams**, not physical ray-marched volumetrics or HDR bloom.
- Play/Stop isolation restores the authored scene and removes runtime-spawned objects.
- Stats, a bounded event console with JSONL export, and rotating native diagnostic logs.

## Quick start from source

Use Bun 1.4.4 (the lockfile/package-manager version used for this release).

```sh
bun install --frozen-lockfile
bun run dev              # editor, http://localhost:5173
bun run check            # TypeScript and Oxlint
bun test tests           # unit / physics / headless / scripting / hierarchy
bun run build            # browser editor and standalone player
bun run desktop          # build and run Electron editor
bun run desktop:linux    # build Linux AppImage
bun run desktop:windows  # build Windows ZIP
```

Use the appropriate OS runner for reproducible desktop packaging. Electron requires native Linux desktop libraries and a working display server. Release packages do not require Bun; source/headless tools do.

### Create and test without a GUI

```sh
bun run game new my-game.scene.json "My Game"
bun run game import my-game.scene.json path/to/model.glb
# Place the asset using the ID printed by import:
bun run game place my-game.scene.json ASSET_ID "My prop"
bun run game inspect my-game.scene.json
bun run game simulate my-game.scene.json 120 KeyW
```

Headless simulation uses the same scene schema, Rapier physics and shared behaviors, without DOM, Electron, a display server or GPU. It validates gameplay, not visual rendering. See the creation guide for edits, reports, custom inputs and the TypeScript API.

### Write scripts

```ts
import { Script } from "@pinefall/sdk";
export const defaults = { speed: 1.5 };
export default class Spinner extends Script {
  update(dt: number) {
    this.ctx.object.rotation.y += this.ctx.number("speed", 1.5) * dt;
  }
}
```

Attach this to a non-physics object. Physics bodies/controllers own their transforms; use the physics API when scripting them. The SDK reference explains how to add abilities without replacing the player controller.

```sh
bun run game script-add my-game.scene.json examples/scripts/Boost.ts
bun run game script-attach my-game.scene.json PLAYER_ID SCRIPT_ID '{"dashSpeed":12}'
bun run game script-typecheck my-game.scene.json
bun run game simulate my-game.scene.json 180 KeyW,KeyE --trust-scripts
```

**Security:** scene JSON can contain executable TypeScript source. It is not executed during import, schema validation, syntax checking or semantic type checking. Approved scripts are **trusted code, not sandboxed**: browser code can access DOM/network/storage, and headless code can access Bun/process/filesystem capabilities. Never approve unknown scripts. Infinite loops, hostile code and resource exhaustion are not contained.

### Examples and standalone export

Open `examples/projects/beacon-run.scene.json` to collect three imported-model crystals and return to the beacon. Open `examples/projects/script-lab.scene.json`, review its scripts, then approve execution to try E-to-dash, a bounce pad and a physics-crate spawner.

```sh
bun run build
bun run game export-web examples/projects/beacon-run.scene.json build/beacon-run-web
bun run game export-web examples/projects/script-lab.scene.json build/script-lab-web
```

Output directories must not already exist. Serve the exported directory with an **HTTP static server**, then open `index.html`; do not launch it directly as `file://`. Release assets also include ready-to-serve copies of both examples.

The editor's Player link opens a stock template, not unsaved edits. Load your exported scene in the standalone player's file picker, or use `export-web` for automatic loading. In Electron use the application menu to open the player; popups are blocked intentionally.

## Saving and hardware notes

Projects are single-scene JSON files. New Game replaces local autosave; export your old scene first. Browser storage quotas can be smaller than scene asset budgets. Exported files are the portable backups; undo history and layout preferences are not a replacement.

Requires WebGL 2 through Chromium/ANGLE. There is **no fake 2D fallback**. On Linux, `--legacy-gl` requests X11 + ANGLE OpenGL and disables Vulkan. It is not a Mesa/Chromium patch or a compatibility guarantee, and does not disable the GPU sandbox. Quality/effect controls are in the Rendering inspector; driver flags require relaunch.

Linux packaged smoke tests use Xvfb/SwiftShader. **CEDAR/Wayland hardware and Windows execution are unverified.** Software-rendering tests do not prove hardware FPS or stability. See release notes for the precise validation scope.

## Tests and current limits

28 unit/physics/headless/scripting/hierarchy tests (82 assertions), strict TypeScript and Oxlint pass. Browser suites cover the four starters, GLB/game creation, movement, script execution/trust, standalone exports, hierarchy and workspace interactions. Packaged Linux tests cover script import, trust gating, spawned physics bodies and Stop restoration. No long-duration memory/performance certification is claimed.

For browser tests, start the dev server, install Chromium with `bun x playwright install --with-deps chromium`, build/export the two examples above, then run `test:browser`, `test:runtime-browser`, `test:scripting-browser`, `test:workspace`, and `bun tests/creation-browser.ts`. They explicitly use SwiftShader for repeatability.

Limits: 500 entities, 100 collections, eight lights, 16 GLB assets (2 MB/import, 8 MB combined embedded strings), 32 script assets (64,000 source characters each, 512,000 combined), 16 attachments/entity and 8,000 JSON property characters/attachment. Imported GLB resources must be embedded and decoder-free. Physics bodies remain transform roots; use collections for organization.

Not yet implemented: skeletal-animation authoring, audio import/system, navmesh, terrain sculpting, networking, visual scripting, multi-scene projects, full asset dependency database, automatic mesh-collider cooking, per-game desktop export, unrestricted floating/multi-monitor panels, IDE autocomplete/debugger or script hot reload. Authoring edits reload the scene rather than incrementally patching all resources. Camera/editor controls currently share runtime code; the runtime does not depend on React or editor modules.

### Asset pipeline in 0.5.3

The working tree includes worker model parsing, shared instance resources, cancellable
import/reimport and PIF v3 source provenance. FBX conversion is experimental.
See [implementation evidence and remaining gates](docs/ASSET-PIPELINE-IMPLEMENTATION.md)
and [the authoring workflow](docs/CREATING-GAMES.md#worker-asset-workflow-053).
The previous v0.5.2 release remains unchanged. Plan 01 is not fully complete; see the open gates in the implementation log.

### Release/testing workflow

After each completed update or major edit, validate, version, push and publish a downloadable release, then pause for the project owner to test before continuing. See [release policy](docs/RELEASE-WORKFLOW.md). Never store authentication tokens in repository files.
