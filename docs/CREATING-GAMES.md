# Creating games — Pinefall Engine 0.2

## Visual workflow

1. Click **New game**, enter a name, and choose a blank world or a starter. A blank world includes ground and a playable character, not a premade quest.
2. Import one or several **GLB 2.0** models, or drop them into the viewport. Models appear in the scene and reusable asset library. Identical model contents are deduplicated.
3. Move/rotate/scale the object using the gizmo or inspector. Add a rigid body and choose a primitive collision proxy if it should collide. Models do not automatically generate mesh colliders.
4. To make an imported model your player, select the existing Player and select its **Library model**. This replaces visuals while keeping the character behavior and collider. Adjust scale to match the collider; rigged animations do not play automatically.
5. Press Play. Stop restores the authored scene. Export scene JSON to save a portable, self-contained game scene; Open scene loads it again.

**Storage:** these are single-scene projects, not a multi-scene project database. Creating a new game replaces browser autosave. Export the old scene first; session Undo can also restore it. Large scenes may exceed browser storage quota, so exported files are essential backups.

**Supported assets:** self-contained, uncompressed `.glb` models with embedded materials/textures. Maximum 2 MB per imported model, 16 assets, 8 MB total embedded asset strings, 500 entities, eight lights. External texture/buffer URLs and decoder-dependent Draco/Meshopt/KTX2 assets are rejected. Export Blender assets as GLB with textures embedded and compression disabled. FBX/OBJ/Blender files, separate image/audio import, skeletal animation authoring and automatic collision-mesh cooking are not supported yet.

## Headless CLI

Run from the engine source directory with Bun. No browser, display server, Electron or GPU is needed for these commands:

```sh
bun run game new my-game.scene.json "My Game"
bun run game inspect my-game.scene.json
bun run game import my-game.scene.json path/to/model.glb
# Use the asset ID returned by import:
bun run game place my-game.scene.json ASSET_ID "My prop"
# Use the entity ID returned by place or inspect:
bun run game edit my-game.scene.json ENTITY_ID '{"transform":{"position":[2,1,-3],"scale":[2,2,2]}}'
bun run game validate my-game.scene.json
bun run game simulate my-game.scene.json 600 KeyW,Shift > simulation-report.json
```

Commands return JSON on stdout and errors on stderr with nonzero exit status. Rapier currently emits a dependency initialization warning on stderr. Do not treat stderr being nonempty as failure; use the exit status. Scene writes use a temporary file and rename. `new` refuses to overwrite an existing file; `import`, `place` and `edit` deliberately modify the specified scene. Export takes a new directory and refuses overwrite.

`simulate` accepts 0–36000 ticks (60 ticks = one simulated second). Key names match the runtime input codes. Input is held throughout the CLI run. For timed input sequences, custom behaviors or jumps, use the API below. The report contains ticks, physics body count, collected IDs, win state, bounded events, and entity transforms. The snapshot is a pose/visibility report, **not** a full resumable save of rigid-body velocities and script state.

## Headless TypeScript API

```ts
import { HeadlessEngine } from "./packages/headless/src";
import { createGame } from "./packages/project/src";

const simulation = await HeadlessEngine.create(createGame("Automated test"));
try {
  simulation.input.add("KeyW");
  simulation.step(120);
  simulation.input.clear();
  simulation.jump = true;
  simulation.step(60);
  console.log(simulation.report());
} finally {
  simulation.dispose();
}
```

Import the **headless entrypoint**, not the graphical Engine. Both use the same schema, Rapier physics, built-in character/vehicle/trigger behaviors, and synchronous script-error isolation. `registerBehavior(name, factory)` supports custom trusted TypeScript modules before play/step. `BehaviorContext.engine` is now the shared `SimulationHost` interface; renderer-specific custom scripts should capture the graphical Engine separately rather than expecting a renderer in headless mode.

Headless mode uses Three scene nodes for transforms, but creates no renderer or WebGL context and does not decode/render models. Collisions use authored primitive proxies. It cannot validate visual appearance, GPU shaders, pointer lock or performance. Run browser tests for those. Fixed stepping is reproducible for the same inputs/build; no cross-platform bitwise-determinism guarantee is made. There is no networking/server authority layer or plugin security sandbox.

## Export a standalone web game

```sh
bun run build
bun run game export-web my-game.scene.json build/my-game-web
```

Serve that output directory with any static **HTTP** server; open `index.html`. Do not double-click it as `file://`: browser module/fetch policies prevent that. The output automatically loads your custom `scene.json` and runs the player without the editor. Scene script assets now travel in JSON and run after explicit approval; see [Scripting](SCRIPTING.md). Code-first behaviors that are not scene scripts must still be registered in the built player. This exporter packages a single scene, not a multi-level application. Desktop editor packaging remains available via `desktop:linux` and `desktop:windows`; per-game desktop export is not yet automated.

## Included example: Beacon Run

Open `examples/projects/beacon-run.scene.json` in the editor or player. Collect the three golden crystals, then return to the green beacon. An original `signal-crystal.glb` is included; it was imported using the same project API as your models.

```sh
bun run game simulate examples/projects/beacon-run.scene.json 120 KeyW
bun run game export-web examples/projects/beacon-run.scene.json build/beacon-run-web
```

The example can be regenerated with `bun scripts/create-demo.ts`. Its scene includes static obstacles, a character, imported model instances, real collection sensors and a finish trigger.

## Tests

- `bun test tests`: DOM-free unit, physics, import and headless tests.
- `bun run check`: TypeScript + Oxlint.
- With dev server running, `bun tests/creation-browser.ts`: new game → GLB import → Play/Stop → exported custom player. Build/export Beacon Run first, as above.
- Existing `test:browser` and `test:runtime-browser` still cover starters, effects, movement, camera overrides and behavior isolation.

Browser tests use SwiftShader. They are not proof of CEDAR hardware compatibility.
