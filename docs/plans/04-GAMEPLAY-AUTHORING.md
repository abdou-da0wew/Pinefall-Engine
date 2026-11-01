# Reusable gameplay, prefabs, components and scene lifecycle

> Historical release, design or acceptance record: retain the results and limits of its stated checkpoint. For current implementation and downloads, see [current status](../CURRENT-STATUS.md).

**Pinefall implementation plan • research date: 2026-10-31 • baseline: 0.5.2 / b8b38af**

> Planning only. This document does not claim these features are implemented. Budgets and API sketches are proposed acceptance criteria, not measured performance or final public contracts.

## Revision record

- **R0 — code audit and initial engine survey:** identified the current baseline and questions below.
- **R1 — detailed design pass:** added researched architecture, proposed contracts, workflows, work packages and acceptance tests.
- **R2 — failure-mode and source-verification pass:** Verified Rapier mask/query semantics; fixed tick ordering, three-way prefab merge, generation-safe pooling and transaction failure behavior.
- **R3 — cross-plan consistency review:** reconciled subsystem ownership, shared identifiers, lifecycle boundaries and the first implementable vertical slice.

Read R1 as the main design, R2 as its research-driven refinements, and R3 as the final integration check. All revisions are planning work performed on 2026-10-31; no engine feature implementation is implied.

## Existing implementation and constraints

Scripts, physics, collections and copied prefab subtrees exist. Linked prefab-instance overrides, a component registry, transactional scene transitions and reusable pooling contracts do not. Physics bodies remain transform roots.

Inspected integration points: `packages/runtime/src/behaviors.ts; packages/scripting/src/runtime.ts; packages/editor/src/hierarchy-model.ts; packages/editor/src/main.tsx`. Preserve TypeScript, Bun, Oxlint, Linux/Windows Electron, the WebGL 2 runtime, DOM-free headless simulation and optional UI. Do not disable Electron sandboxing to obtain graphics compatibility. Physical CEDAR and Windows execution require dedicated validation; Xvfb/SwiftShader are not substitutes.

## Scope to design

Stable prefab IDs, patch resolution, variants, nesting, component data, lifecycle order, scene transitions, persistent entities, pooling, collision masks, queries and input integration.

## How to use this plan

R1 explains the concepts and selected architecture; R2 records substantive follow-up research, corrections and additional failure cases. Proposed interfaces are design sketches, not existing APIs. Source links support the adjacent technical claims; numerical budgets are Pinefall hypotheses to validate, not upstream engine benchmarks. Resolve the remaining implementation questions through the listed spikes and fixtures before freezing public contracts.

## Shared release rule

No feature is complete because its checkbox exists. Require real behavior, project round trips, script/headless compatibility where applicable, a standalone export check, resource cleanup tests, documentation and an explicit unsupported-feature report. Release numbers are provisional; ship by acceptance gates, not dates.

## R1 — Research-led implementation design

### 1. Product goal and architectural boundary

A developer should author an enemy once, place variations in several scenes, update its base behavior, and retain intentional per-instance changes. Copying a subtree is useful but does not provide that relationship. Unity's prefab instance model distinguishes linked source data from property/component overrides and explicit Apply/Revert operations. Pinefall should adopt those semantics with a smaller, validated data model. [2](https://docs.unity3d.com/6000.4/Documentation/Manual/PrefabInstanceOverrides.html)

Keep a scene/entity composition model rather than replacing the engine with an archetype ECS now. Typed components, deterministic iteration, explicit ownership and change transactions address the current need without a disruptive storage rewrite. Reconsider ECS only after a measured entity-scale workload justifies it.

### 2. Identity and prefab representation

Distinguish project asset IDs, scene IDs, prefab-local node/component IDs, and runtime instance handles. Never use display names or array positions as authoritative references. Proposed runtime handles include a generation to detect stale pooled objects.

```ts
// Proposed authored data; validated before instantiation.
interface PrefabInstance {
  id: string;
  sourceAssetId: string;
  sourceRevision: string;
  overrides: OverrideOperation[];
}
type OverrideOperation =
  | { op: 'set'; nodeId: string; componentId: string; field: string; value: unknown }
  | { op: 'addComponent'; nodeId: string; component: ComponentData }
  | { op: 'removeComponent'; nodeId: string; componentId: string };
interface ComponentData { id: string; type: string; version: number; data: unknown }
```

`field` is a schema-declared property path, not arbitrary object traversal. Reject prototype-related keys, out-of-range arrays and references to noneditable/internal state. Validate `unknown` against the component's schema. Missing target fields create an unresolved override diagnostic; they never redirect to a similarly named field.

Resolution order is base prefab → variant chain → nested-instance overrides at their authored scope → scene-instance overrides. Record provenance for each effective value so the inspector can explain where it came from. Reject cyclic prefab dependencies and cap nesting depth before instantiation. Linked nested prefabs should retain their source identity; Unity explicitly distinguishes that from making one flattened copy. [1](https://docs.unity3d.com/2023.2/Documentation/Manual/NestedPrefabs.html)

### 3. Applying changes and reconciling reimport

Begin with property overrides, then add/remove components, then structural additions/removals. Avoid shipping unrestricted hierarchy edits before their remapping semantics are defined. A reimport can rename or remove a source node; a source ID match is authoritative, a suggested fuzzy/name match requires user confirmation.

Apply/Revert must show scope: this instance, a variant, or the base asset. Applying an inner nested override can affect many unrelated instances, so display a dependency preview and require a deliberate target. Unity's multilevel override documentation demonstrates why a generic “Apply everything” button is ambiguous. [3](https://docs.unity3d.com/2022.3/Documentation/Manual/PrefabOverridesMultiLevel.html)

Perform apply/revert/rebase as an atomic document transaction with a reverse patch and retained source revision. If an update fails validation, keep the original prefab and all instances. Never resolve a conflict by silently discarding overrides. Provide “unpack instance” as an explicit loss of linkage, with a preview of which nested links are retained or removed.

### 4. Component registry and lifecycle

A component descriptor supplies type/version, validated fields, defaults, inspector hints, runtime factory, migration and serialization rules. Dependencies are explicit: a character controller requires an appropriate collider/body; a skinned visual requires a skeleton asset. Disallow unsupported duplicate component types or define multiplicity deliberately.

Preserve existing `mesh`, `physics`, `light`, `behavior` and `scripts` fields through adapters first. Migrate to a component array only in a new scene schema, after round-trip and legacy-script tests. A transition period must not instantiate the same behavior once from the old field and once from the new component.

Proposed lifecycle: deserialize/validate → allocate all entities → resolve references → attach components → enable → start once → tick → disable → dispose. `disable` is reversible and stops eligible work; `dispose` is terminal and idempotent. Existing scripts keep their current start/fixedUpdate/update/trigger/dispose contract through an adapter; add new hooks only with documented compatibility behavior.

Queue spawn, destroy, component-add/remove and scene transition commands at defined synchronization points. Do not mutate the collection being traversed by a physics callback. A fixed tick takes an immutable input snapshot; executes stable component/script order; proposes movement; steps physics; gathers/sorts events; dispatches events; queues structural changes for the next tick boundary as finalized in R2. Newly spawned objects start at the next documented boundary, not an accidental position in a Map iteration.

### 5. Scene transitions and persistence

Add a scene registry and explicit startup scene to the project model. A transition is a transaction: request destination → validate dependencies → prepare destination → freeze outgoing mutation admission → resolve persistent objects → commit active scene → dispose outgoing scene → emit ready.

If preparation fails or is cancelled, the outgoing scene stays usable. Resource leases allow incoming/outgoing content to overlap within a budget. If both worlds cannot fit, switch to an explicit loading mode with a rollback/reload strategy rather than pretending the transition is seamless.

Persistent objects belong to a persistent world/service scope, not to both scenes simultaneously. Define collision-world transfer, camera/listener ownership and UI ownership. A persistent player can keep logical inventory while recreating its scene-local body at an entry point. Duplicate singleton service IDs are errors. Editor Stop returns to the authored entry scene and tears down persistent runtime state.

Cross-scene references use stable IDs or service interfaces and may be unresolved while a scene is unloaded. Do not serialize live object pointers. Save restoration in Plan 06 reconstructs these references in two passes after instantiation.

### 6. Physics layers, queries and reusable gameplay services

Introduce named project layers mapped to the physics engine's supported membership/filter masks. Rapier distinguishes collision groups (whether contacts/intersections are computed) from solver groups (whether forces are solved); the inspector and API must not conflate them. Its documented filtering is bilateral, so both membership/filter directions must allow interaction. [2](https://rapier.rs/docs/user_guides/javascript/collider_collision_groups/)

Expose raycast/shape-cast helpers with include/exclude groups, sensor policy, maximum distance, ignored entity and stable hit data. Queries commonly need to exclude their owner and may exclude sensors/dynamic bodies; build these options rather than hard-coding one global raycast policy. [3](https://rapier.rs/docs/user_guides/javascript/scene_queries/)

Keep physics bodies as transform roots until a separate world-transform/parenting design is tested. A collection or prefab hierarchy may organize bodies without applying unsupported nested physical transforms. Retain cycle/shear checks on transform parenting.

First gameplay library: interaction target, trigger action, spawn point, checkpoint, simple projectile, damage/health and camera target. These are small examples built on public SDK APIs, not hidden engine-only behavior. Navigation/pathfinding is a separately scoped follow-up; do not bundle a partial navmesh system into a prefab milestone.

### 7. Object pooling without stale state

Pooling is a lifetime contract, not just setting `visible=false`. On release: disable physics participation, stop scene-scoped audio/animation, remove timers/listeners, clear transient script state and invalidate handles. On acquire: apply reset data, restore component state and increment generation. Do not rerun terminal `dispose` and then reuse an object with dead resources.

Use explicit `onAcquire/onRelease` only for pool-aware components; unsupported components fall back to destroy/recreate. Cap pool size, show memory retained by pools and permit trimming. Store no inactive object as a live save-game entity unless the game schema explicitly represents it.

### 8. Work packages and proof

| Package | Scope | Acceptance gate |
|---|---|---|
| GA0 | Entity/component identities and reference validation | No name/index-based reference breakage |
| GA1 | Property overrides and provenance inspector | Base changes propagate except where overridden |
| GA2 | Variants/nesting and conflict-aware rebase | Cycle/delete/rename fixtures pass |
| GA3 | Component adapters and lifecycle command queue | Stable callback trace in graphical/headless hosts |
| GA4 | Scene transitions and persistence scopes | Cancel/fail leaves old world intact |
| GA5 | Layers/queries, pooling and examples | Stale handle and repeated spawn/release tests pass |

Tests include duplicate nested names, deleted override targets, variant cycles, apply to inner versus outer source, undo/redo across reimport, disable during callback, self-destruction in trigger, pooled projectile hit from an old handle, persistent player scene swap and failed scene load. Use scripted traces for ordering, not only screenshots.

### 9. Completion criteria and boundaries

A developer must build two levels with a linked enemy prefab, a faster variant and one local override; change base health; demonstrate correct propagation; move between levels with persistent inventory; and save/load without losing identities. Run the same logical tests headlessly. Benchmark spawn/release and transition peaks before claiming scalability beyond the current bounded scene sizes.

Plan 01 owns stable asset/subasset identity, Plan 02 animation/audio lifecycle, Plan 03 material overrides, Plan 05 transactions/debugging and Plan 06 input/save contracts. This plan owns authoritative simulation ordering. Multiplayer replication, rollback networking and a visual scripting language are intentionally outside this release.

## R2 — Exact filtering, deterministic boundaries and transactional rebasing

### Physics API correction and layer migration

Rapier's JavaScript group representation is exactly two 16-bit masks packed into one 32-bit value, not 32 independent layer memberships. Both directions must match. [1](https://rapier.rs/docs/user_guides/javascript/collider_collision_groups/) Proposed packing is `((membership << 16) | filter) >>> 0`, after checking each mask is an integer in 0…65535. Keep named-layer-to-bit assignments stable and persist them in project settings; renaming a layer changes its label, not its bit.

The query filter uses the same bilateral group compatibility plus optional type flags, ignored collider/body and predicate. [3](https://rapier.rs/docs/user_guides/javascript/scene_queries_filters/) Use normalized ray direction so the SDK can expose world-distance results; validate zero direction and finite/max distance. When multiple equal-distance hits occur, sort with a stable entity/collider tie-breaker for APIs promising deterministic ordering. Do not confuse a “query includes layer X” UI with a one-sided filter mask unless the wrapper deliberately constructs the corresponding membership/filter pair.

Collisions also depend on body-type rules, active-event configuration and sensor status. A matching mask alone is not a promise of an emitted event. Add a diagnostic view showing all reasons a pair/query can be excluded. Test bit 15 explicitly because JavaScript bitwise operators use signed intermediates.

### Freeze the shared fixed-tick contract

Adopt this proposal across Plans 02/04/06 before implementation:

1. At tick start, apply previously queued structural commands and start newly admitted components.
2. Consume one input action snapshot; run fixed scripts in stable entity/component order.
3. Evaluate gameplay animation transitions/markers into a pending event list; compute root-motion proposals.
4. Resolve kinematic controller proposals and step Rapier once with fixed `dt`.
5. Synchronize authoritative transforms; gather/sort trigger/contact events; dispatch physics events, then animation gameplay markers.
6. Queue callback mutations for the next tick boundary. Render interpolation and cosmetic updates cannot change authoritative physics immediately.

A destroy request can mark an entity pending-destroy immediately so later callbacks skip it, but actual collections/resources are removed at the next boundary. Define this state explicitly and test that a queued hit cannot damage an entity after terminal destruction. Limit catch-up ticks after a stall and report discarded wall time; do not execute hundreds of ticks and audio events in one frame to hide a pause.

Rapier documents cross-platform determinism under matching versions, initial conditions, order and timesteps; it warns that external computations can affect initialization. That does not certify the whole engine, JS scripts, input timing or rendering as deterministic. [Rapier determinism](https://rapier.rs/docs/user_guides/javascript/determinism/) Record exact versions, seed, tick-indexed input and ordered commands for reproducibility tests. Use a seeded game RNG service; system time/network results need recorded inputs or an explicit nondeterministic label.

### Prefab rebase must be a three-way merge

R1's sourceRevision becomes a retained base snapshot/hash, not a decorative string. Rebase compares old source B, new source N and instance override O. If N changed a field untouched by O, adopt N. If O intentionally overrides a still-compatible field, preserve O and show divergence. If N removes or changes the type of O's target, record a conflict. Component removal cannot leave required dependencies dangling.

A conflict record stores target ID, old/new schema paths, old/new values where bounded, override value and resolution status. It is editor data until resolved; exports fail for unresolved gameplay-critical references. “Keep local” may create a new explicit local component rather than pretending the deleted base component still exists. An undo restores the complete graph of source revisions and overrides, not just the visible inspector field.

For nested instances, qualify IDs by instance path plus stable prefab-local ID to avoid collisions between two copies of the same child. External references identify a particular scene instance, not every node with a matching local ID. Bound expansion (proposed depth 16 and per-operation entity count 10,000 until measured) and reject overflow before allocating the whole tree.

### Transaction and lifecycle failure matrix

| Failure | Required behavior |
|---|---|
| Component factory throws during staging | Dispose already staged siblings; authored document and active world unchanged |
| Scene destination exceeds memory reservation | Offer loading/retry/cancel; no partial outgoing teardown |
| Persistent player/body transfer fails | Roll back ownership transfer before disposing old world |
| Pool acquire callback throws | Quarantine/destroy instance; do not return it as active |
| Old asynchronous completion targets recycled handle | Generation check rejects completion and releases its resources |
| Prefab apply conflicts with concurrent reimport | Retry/rebase against current generation with explicit conflict report |

Disposal errors are aggregated while remaining cleanup proceeds. A single faulty script must not prevent every other resource in the world from being released. Scoped task completion from Plan 06 enters a command queue, not arbitrary mid-tick mutation.

### Integration, budgets and unresolved choices

Introduce registry/lifecycle/reference services around `packages/runtime/src/schema.ts`, `engine.ts`, `behaviors.ts`, `events.ts` and `physics.ts`; adapt `packages/scripting/src/sdk.ts` before removing old fields. `packages/editor/src/hierarchy-model.ts` remains responsible for authored hierarchy invariants; runtime prefab expansion must not bypass them. Integrate headless fixtures through `packages/headless/src/index.ts`.

Provisional responsiveness target: small inspector commands validate/commit under 8 ms p95 in the reference scene; large prefab expansion stages in chunks and commits at a tick boundary. Benchmark 100/1,000 entities and 10/100 pooled projectiles before choosing defaults. Track transition peak memory against Plan 01 reservations rather than setting an unrelated second limit.

Remaining decisions: structural override UX, which component types are pool-safe, persistent physics transfer versus recreation, and whether fixed-update animation pose evaluation cost is acceptable at target scale. These require prototypes, but identity, three-way conflicts and explicit lifetime semantics are mandatory regardless of implementation choice.


## R3 — Final integration check

This document owns authoritative fixed-tick ordering; other systems adapt to it rather than adding competing loops. Prefab revisions use Plan 01 identities/leases and Plan 05 history transactions. Persistent service state is not automatically serialized: Plan 06 requires an explicit game serializer. Begin with property-only prefabs and lifecycle traces before implementing structural variants or seamless multi-world transitions.

### Companion plans

- [Asset pipeline, asynchronous import and reimport](01-ASSET-PIPELINE.md)
- [Animation, character presentation and audio](02-ANIMATION-AUDIO.md)
- [Materials, textures, lighting, shaders and post-processing](03-MATERIALS-GRAPHICS.md)
- [Debugging, profiling, recovery and editor quality of life](05-DEBUGGING-RELIABILITY.md)
- [Game export, input, save games, security and production readiness](06-SHIPPING-DEVELOPER-READINESS.md)
