# TypeScript scripting — current external-file workflow

Write actual game logic, not a fixed list of behavior choices. Script assets travel inside scene/prefab JSON and run in the editor, standalone exports and the headless simulator.

## Editor: external source → validate → Apply → trust → Play

1. Open **Project → Project files & external tools** and select an empty working folder, or validate an existing folder.
2. Create/import a TypeScript asset in Scripts. Use **Open source externally** or the file manager to launch the configured editor. Embedded source and attachment-JSON textareas have been removed.
3. Use **Install / refresh IDE typings** for offline SDK declarations and `@game` import aliases. Existing custom tsconfig files are preserved; extend `./tsconfig.pinefall.json` when instructed. Refresh after changing registered module names.
4. Attach a script in the Inspector. Edit attachment property overrides in the external `scene.json`; enable/disable and detach controls remain in the app.
5. Saved external edits trigger syntax and semantic diagnostics. Resolve errors, then explicitly **Apply validated changes**. This does not execute scripts. Apply verifies disk hashes and retains the prior runtime on failures.
6. Review the source, approve trusted scripts, then Play. Stop restores authored state. Source changes/cold reopening revoke UI trust. Logs/errors remain in Console.

Browser mode can import/update `.ts` files but has no native folder watcher or external-process launcher. GLSL fragment and uniform JSON file exchange is also available from a selected mesh’s Custom shader dialog; see [graphics SDK](GRAPHICS-SDK.md#browser-glsl-file-exchange). Native Save project backs up raw PIF8 files, including unregistered and invalid drafts; legacy/browser exports remain PIF1–7. Unregistering a script detaches it but does not delete its disk file. Export .ts exports the currently adopted asset source; the working-folder file may contain newer unapplied edits. There is no silent code hot reload.

## A simple script

```ts
import { Script } from "@pinefall/sdk";

export const defaults = { speed: 1.5 };

export default class Spinner extends Script {
  start() {
    this.ctx.log(`Hello from ${this.ctx.entity.name}`);
  }

  update(dt: number) {
    this.ctx.object.rotation.y += this.ctx.number("speed", 1.5) * dt;
  }
}
```

Attach Spinner to a non-physics object. Physics owns transforms on rigid bodies and synchronizes them each simulation tick; use the body API to rotate/move physics objects instead of only modifying the visual Group. Built-in controllers may also own body rotation/position.

You can instead export a factory. The closure belongs to one attachment:

```ts
import type { ScriptContext } from "@pinefall/sdk";

export default function timer(ctx: ScriptContext) {
  let elapsed = 0;
  return {
    fixedUpdate(dt: number) {
      elapsed += dt;
      if (elapsed >= 2) {
        ctx.emit("timer", { object: ctx.entity.id });
        elapsed = 0;
      }
    },
  };
}
```

A class must extend the SDK `Script`. The class can use ordinary fields, methods, inheritance, enums, interfaces and TypeScript types. Factories and lifecycle hooks are synchronous; asynchronous lifecycle functions are unsupported. User-managed promises/timers need explicit cancellation and error handling. Script errors are isolated; infinite loops and memory exhaustion are not.

## Lifecycle

| Hook                      | Runs when                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `start()`                 | A new attachment is instantiated for Play or runtime spawn                              |
| `fixedUpdate(dt)`         | Every physics tick, normally 1/60 second, before world stepping                         |
| `update(dt)`              | After physics synchronization each rendered frame; once per fixed tick in headless mode |
| `trigger(other, started)` | Rapier collider entry/exit; `started` distinguishes entry from exit                     |
| `dispose()`               | Stop, scene unload, entity destruction or engine disposal                               |

Built-in behavior executes before custom attachments on the same object; custom attachments execute in array order. Each attachment receives fresh class/closure state for Play. Named helper modules share their module state within that Play session. Registered code-first behaviors still work alongside scene scripts.

`trigger` receives collision events; configure the object's **Sensor / trigger** checkbox for a non-blocking trigger. Without a collider there are no physics callbacks. No click-interaction hook is synthesized automatically; implement interaction using input, entity queries and/or Three raycasting as appropriate.

## SDK reference

Import from `@pinefall/sdk`. Available classes/data/helpers:

- `Script`, `ScriptContext`, `Behavior`, `SimulationHost`
- `Entity`, `SceneDocument`, `Vec3`, `ScriptValue`
- `Vector2`, `Vector3`, `Quaternion`, `Euler`, `Color`, `MathUtils`
- `RAPIER` (physics types/classes), `entity(...)`, `cloneScene(...)`, `parseScene(...)`

`import * as THREE from 'three'` is also available. Renderer-specific Three features require a graphical environment; math/transforms work headlessly.

### `this.ctx` / factory `ctx`

| Member                                  | Purpose                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity`                                | Entity definition and ID; authored mesh/physics metadata, tag, behavior and attachments                                                               |
| `object`                                | Live Three Group: position, rotation, quaternion, scale, visibility and hierarchy                                                                     |
| `engine`                                | Shared simulation API: scene document, object map, Rapier system, input, events, goals, collection state, speed, checkpoint and behavior registration |
| `props`                                 | Copy of exported `defaults`, shallow-merged with this attachment's JSON overrides                                                                     |
| `state`                                 | Per-instance mutable dictionary for runtime-only state                                                                                                |
| `number/string/boolean(name, fallback)` | Typed property access with a fallback                                                                                                                 |
| `vector(name, fallback)`                | A fresh Vector3 from a three-number property array                                                                                                    |
| `input`                                 | Held-key Set: e.g. `ctx.input.has('KeyE')`; scripts can choose any key                                                                                |
| `time`                                  | `elapsed` fixed-step seconds, current `delta`, `fixedDelta`, and update `frame` count                                                                 |
| `find(idOrName)`                        | Find an entity definition                                                                                                                             |
| `findByTag(tag)`                        | Find matching entity definitions                                                                                                                      |
| `objectFor(id)`                         | Get another entity's live Three Group                                                                                                                 |
| `body(id?)`                             | Get a Rapier rigid body; defaults to this entity                                                                                                      |
| `teleport([x,y,z], id?)`                | Set body and visual position; does not zero velocity                                                                                                  |
| `impulse([x,y,z], id?)`                 | Apply an impulse to a dynamic body; not a kinematic movement controller                                                                               |
| `spawn(entity)`                         | Add a validated root entity and activate its behaviors/scripts                                                                                        |
| `destroy(id?)`                          | Remove an entity and descendants, bodies and behaviors; defaults to self                                                                              |
| `log(message)`                          | Write a structured script event                                                                                                                       |
| `emit(name, data?)`                     | Publish `custom:name` with scalar metadata                                                                                                            |
| `onEvent(name, listener)`               | Subscribe; returns unsubscribe, and is automatically cleaned up on disposal                                                                           |

`ctx.engine.physics.move(id, delta)` performs collision-aware kinematic movement. For low-level physics use `ctx.body()` and `ctx.engine.physics.world` (Rapier). Take ownership carefully: multiple systems writing the same body can conflict. Setting arbitrary fields on an entity definition is not an automatic component rebuild; use live objects, physics methods, spawn/destroy and explicit APIs.

Runtime spawning supports primitives and primitive colliders. To spawn a rendered imported model, instantiate that model in the authored scene first; graphical spawning clones that visual hierarchy. Headless mode uses only transform nodes and primitive proxies. Spawned entities must be roots. Spawn does not automatically adjust the game's collectible goal count; custom game logic can own `ctx.engine.goalCount`. The 500-entity scene limit still applies.

## Reusable helper modules

Add another script asset named `Helpers.ts`:

```ts
export function scoreForCombo(combo: number): number {
  return Math.max(1, combo) * 100;
}
```

Use it in an attached script:

```ts
import { scoreForCombo } from "./Helpers";
// Or import from '@game/Helpers'.
```

Helper modules do not need a default export unless attached to an entity. Names must resolve uniquely. Modules are a flat scene namespace; no directory/package resolver. Circular dependencies, arbitrary npm packages, Node built-ins and external static imports are not supported by this resolver. Native engine source projects can still use normal Bun/npm modules and register behaviors through the code-first API.

## Headless authoring and testing

```sh
bun run game script-add my-game.scene.json examples/scripts/Boost.ts
# Use IDs printed by script-add and inspect:
bun run game script-attach my-game.scene.json PLAYER_ID SCRIPT_ID '{"dashSpeed":12}'
bun run game script-check my-game.scene.json
bun run game script-typecheck my-game.scene.json
bun run game simulate my-game.scene.json 180 KeyW,KeyE --trust-scripts
```

`script-check` only parses/transforms TypeScript; it does not execute source. `script-typecheck` invokes the real TypeScript compiler on temporary copies, with SDK types and helper imports configured. It also never evaluates scripts. Type checking requires unique simple `.ts` filenames. All commands return JSON or nonzero exit status on failure.

For API use:

```ts
const simulation = await HeadlessEngine.create(scene);
simulation.allowSceneScripts = true; // explicit decision: all scene code is trusted
try {
  simulation.input.add("KeyE");
  simulation.step(120);
  console.log(simulation.report());
} finally {
  simulation.dispose();
}
```

The graphical `Engine` has the same `allowSceneScripts` flag. Setting it in code trusts scripts in subsequently played scenes until changed; manage that permission yourself when loading untrusted documents. The editor and standalone UI separately gate execution. Headless mode provides no DOM, GPU, audio context or renderer. Use shared SDK math/input/physics/gameplay APIs for portable scripts.

## Included Script Lab

Open `examples/projects/script-lab.scene.json` and review/approve its scripts:

- **Boost.ts**: hold E to dash, extending the existing character controller's scheduled movement.
- **BouncePad.ts**: a trigger teleports the player upward and emits a custom event.
- **Spawner.ts**: periodically creates real dynamic crates and removes older ones.

The `.ts` examples are also individually importable from `examples/scripts/`. Export Script Lab with the normal `export-web` command; its source and attachments travel with the scene. The standalone player asks for approval before executing embedded scripts.

## Security and limits

**This is trusted-code execution, not a sandbox.** A script has the same JavaScript privileges as its host. In the browser it can access DOM/network/storage; in headless Bun it can access process capabilities, filesystem and environment. The limited import resolver is an API convenience, not a security boundary. Never approve unknown scripts. Isolate untrusted projects in a separate restricted OS/container environment instead.

Importing scenes, parsing scripts, syntax checking and type checking do not execute script code. Module initialization happens only during approved Play/step. Scene JSON stores TypeScript source, not pre-approved executable permissions.

Limits: 32 script assets, 64,000 source characters per script, 512,000 combined characters; 16 attachments per entity; 8,000 JSON property characters per attachment, nesting depth 10. Source editing is external. Native diagnostics include real semantic checks; editor autocomplete/debugging is provided by your external IDE, not an embedded editor or full engine-hosted LSP. There is no silent hot reload. Scripts are synchronous and can still hang a host; use source control and backups.

## Game UI SDK (0.5.0)

Scripts now expose `ctx.ui` for typed widget queries, creation/removal, text/value/style changes, visibility, interaction events and named actions. It works in `start`, `fixedUpdate`, `update`, `trigger`, and event callbacks, both graphically and headlessly. UI subscriptions clean up with their attachment; Play-time UI changes reset on Stop. See [Game UI toolkit](UI-TOOLKIT.md) for the full API, editor workflow, runnable UI Lab and limitations.

## Registering files created outside Pinefall

In desktop Project files, select a file and expand **Register existing authored source**. Supply a unique module/new-shader name, then **Register selected source**. `.ts` modules and `.glsl` fragments keep their existing paths. GLSL registration creates separate uniform and metadata JSON files with the default `uTint` declaration; edit those externally for other uniforms. Existing shader metadata JSON (`id`, `name`, `version`, `source`, `uniforms`) and material asset JSON can also be registered. Existing metadata supplies its own ID/name. Declaration files and SDK files are not runtime modules. A uniform JSON file alone is not a separately registered asset.

Registration modifies only the disk catalog; automatic validation follows and explicit Apply is still required. It never runs top-level TypeScript or attaches a shader. Registered shaders are selectable in the mesh Inspector after explicit Rendering trust, and selection stages compilation before replacing the working runtime. Invalid source remains on disk for correction and raw PIF8 backup. Models/audio continue through their existing import paths, not this source-registration control.
