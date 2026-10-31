# Game export, input, save games, security and production readiness

**Pinefall implementation plan • research date: 2026-10-31 • baseline: 0.5.2 / b8b38af**

> Planning only. This document does not claim these features are implemented. Budgets and API sketches are proposed acceptance criteria, not measured performance or final public contracts.

## Revision record

- **R0 — code audit and initial engine survey:** identified the current baseline and questions below.
- **R1 — detailed design pass:** added researched architecture, proposed contracts, workflows, work packages and acceptance tests.
- **R2 — failure-mode and source-verification pass:** Researched transaction acknowledgment and Electron preload security; tightened save generations, IPC threat boundaries, input edges and release evidence.
- **R3 — cross-plan consistency review:** reconciled subsystem ownership, shared identifiers, lifecycle boundaries and the first implementable vertical slice.

Read R1 as the main design, R2 as its research-driven refinements, and R3 as the final integration check. All revisions are planning work performed on 2026-10-31; no engine feature implementation is implied.

## Existing implementation and constraints

Web export and editor desktop releases exist. They are not a complete customizable game-build/export workflow. PIF v2 integrity is not publisher authentication, and project archives are not player-save files.

Inspected integration points: `scripts/game.ts; examples/standalone.ts; desktop/main.ts; packages/project/src/pif.ts; scripts/publish-releases.ts`. Preserve TypeScript, Bun, Oxlint, Linux/Windows Electron, the WebGL 2 runtime, DOM-free headless simulation and optional UI. Do not disable Electron sandboxing to obtain graphics compatibility. Physical CEDAR and Windows execution require dedicated validation; Xvfb/SwiftShader are not substitutes.

## Scope to design

Build profiles, portable player exports, runtime capability checks, input rebinding/gamepad, save-game schema, signing, license inventory, reproducibility, accessibility and external developer validation.

## How to use this plan

R1 explains the concepts and selected architecture; R2 records substantive follow-up research, corrections and additional failure cases. Proposed interfaces are design sketches, not existing APIs. Source links support the adjacent technical claims; numerical budgets are Pinefall hypotheses to validate, not upstream engine benchmarks. Resolve the remaining implementation questions through the listed spikes and fixtures before freezing public contracts.

## Shared release rule

No feature is complete because its checkbox exists. Require real behavior, project round trips, script/headless compatibility where applicable, a standalone export check, resource cleanup tests, documentation and an explicit unsupported-feature report. Release numbers are provisional; ship by acceptance gates, not dates.

## R1 — Research-led implementation design

### 1. Export is a product workflow, not just a ZIP

The editor and runtime are reusable independently. A game developer needs a player with their own name/icon/startup scene and no editor dependency, while the engine developer needs reproducible packaging, license evidence and a clear support matrix. Godot separates export presets and dependency selection from archive-only exports; a resource archive is not itself a runnable executable. [1](https://docs.godotengine.org/en/stable/tutorials/export/exporting_projects.html)

Prioritize Linux and Windows Electron players. Keep browser export as an additional target, not a replacement for desktop. All authored tooling and runtime code remains TypeScript with Bun/Oxlint. Generated bundles and third-party WASM/binaries do not imply an authored JavaScript project.

### 2. Export profile and build graph

Proposed `ExportProfile` contains version, profile ID, target/platform/architecture, development or release mode, application ID/name/version, entry scene, explicit include groups, graphics defaults, window defaults, asset quality recipe, source-map policy and signing configuration reference. Never put signing secrets in `.pif` or committed profiles.

Pipeline: validate project and script types → resolve transitive asset/scene dependencies → reject missing/unsupported content → cook target artifacts → compile player/scripts → assemble runtime manifest → package → security/license checks → smoke tests → hash output → sign where configured → verify final signed output → produce report. Signing changes bytes; distribute hashes for the final distributable, not a pre-sign staging file.

Build in a fresh staging directory. Cancellation/failure leaves the previous export untouched. Commit a new build directory only after validation. UI and CLI call the same typed build service so a wizard-only setting cannot diverge from automation.

Dependency closure follows scene/prefab/material/script-declared asset references. Dynamic string asset loads cannot be inferred safely; require explicit include collections or an allowlisted asset manifest. A “strip unused” report shows what was excluded and why. Do not remove legal notices or dynamically loaded content because a static scanner did not find a literal reference.

### 3. Player format and PIF boundary

`.pif` remains the compressed XZ project/archive format containing separate JSON definitions, assets and scripts with version/metadata/integrity. It is not replaced by a naked JSON export. A cooked player may use a manifest and separate hashed artifacts for loading, without demanding random access inside one monolithic XZ stream. Document this as a runtime distribution format, not a new definition of `.pif`.

Development players include diagnostics, safe inspection and optional source maps. Release players omit editor UI and unnecessary sources, compile trusted authored scripts ahead of time where feasible, disable debug endpoints and use a restrictive CSP. Bundling/minification does not make scripts secret or trustworthy. Validate both modes because debug-only asset paths can mask missing release dependencies.

### 4. Capability and graphics readiness

At startup collect WebGL availability/version, supported extensions/formats, limits, selected profile and effective settings. Renderer strings may be unavailable or privacy-limited; treat them as evidence, not a hardware attestation. A live GPU context is not proof of physical GPU acceleration: Chromium may select a software renderer.

Expose graphics controls inside the app: render scale/resolution cap, shadows, post effects, antialiasing, volumetrics, FPS cap, window mode and reset-to-safe-profile. Settings with a restart requirement say so. A capability failure displays a diagnostic with a supported recovery path, not an empty canvas.

Validate physical CEDAR separately from Linux Xvfb/SwiftShader and Windows separately from cross-compilation. Do not turn off Electron's sandbox to solve a rendering issue. Any experimental renderer/driver flag must be opt-in, reversible, captured in reports and validated against a known issue; no universal AMD patch is assumed.

### 5. Input action system

Replace game logic's dependency on raw keys with named actions: `move` as a 2D vector, `look` as vector/delta, `jump` as button, `interact`, `pause` and UI navigation. Retain a compatibility adapter for existing `Set`-based input until scripts migrate. Unity's action system illustrates the separation between device bindings and gameplay intent, including composite bindings and runtime overrides. [1](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.14/manual/ActionBindings.html)

Proposed action data: stable action/binding IDs, value type, contexts, binding path, processors (deadzone/scale/invert), interactions (press/hold/tap) and priority. Contexts such as gameplay/menu/text-entry control routing; typing in the editor must not drive a character or trigger Delete. Evaluate device events into one immutable action snapshot per simulation tick; define pressed/released edges independently from rendered frame count.

For gamepads, poll current `navigator.getGamepads()` state each frame, handle null/sparse entries and connect/disconnect/focus changes, and support generic mappings without pretending every controller has Xbox labels. MDN notes that controllers may only become exposed after user interaction and that the current object should be polled rather than treating an old event object as live state. [1](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API)

Use a radial stick deadzone with normalized remapping outside the threshold. Apply it once; stacking device and action deadzones changes control feel. Separate trigger calibration from sticks. Mouse delta accumulates until consumed; losing focus clears held states so a missed key-up does not cause permanent movement.

Rebinding workflow: choose action → listen with timeout/cancel → ignore initial held controls → detect conflicts → choose replace/share/cancel → validate at least one usable menu/back binding → persist overrides by binding ID. Provide reset-to-default and an emergency recovery shortcut. Store rebinding in player preferences, not by mutating portable project assets.

### 6. Player settings and save games

Three storage domains must remain distinct:

1. Project `.pif`: authored content, scripts, metadata and integrity.
2. Player preferences: volume, graphics, language, accessibility and input overrides.
3. Game saves: game-defined progression and entity state.

Godot's saving guide deliberately identifies persistent objects and serializable fields, rather than serializing every live engine object. It also separates configuration from save-game data. Use the principle, not its minimal tutorial as a complete transactional storage implementation. [1](https://docs.godotengine.org/en/stable/tutorials/io/saving_games.html)

```ts
// Proposed game-save envelope; payload validated by the game's schema.
interface SaveEnvelope {
  format: 'pinefall-save';
  envelopeVersion: 1;
  gameId: string;
  gameVersion: string;
  schemaVersion: number;
  slotId: string;
  generation: number;
  createdAt: string;
  modifiedAt: string;
  sceneId: string;
  payload: unknown;
  payloadSha256: string;
}
```

Propose `ctx.saves.write(slot, data)`, `read`, `list`, `delete`, and `ctx.settings.get/set`. These asynchronous services are invoked outside synchronous lifecycle hooks or through a documented task service; they do not turn `fixedUpdate` into an async hook. Capture state at a tick boundary, validate finite values/size/depth, serialize, then write. Include a result/error code for quota, permission, corrupt data, unsupported version and unavailable storage.

Use explicit registered serializers/migrations for game data. Save stable entity/prefab IDs and semantic state; do not save renderer objects, functions, Promise instances, physics pointers or raw object graphs. Restore into a staging world in two passes (objects, then references), validate, and swap only on success. Keep a previous valid generation. A checksum detects accidental corruption, not cheating or publisher authentication.

Native backend uses an app-specific user-data directory and main-process capability API. Browser backend uses IndexedDB with a clear backup/export option. Browser storage is origin-scoped, normally best effort and can be lost through eviction/user clearing/private mode; requesting persistence is not a guarantee against user deletion. [1](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) Changing web origin or application ID must have a documented migration path rather than silently abandoning saves.

### 7. Desktop security and trust

Retain `nodeIntegration: false`, context isolation and sandboxing. Electron recommends restrictive CSP, navigation/window limits, validated IPC senders, safe external URL handling and current maintained framework releases. [1](https://www.electronjs.org/docs/latest/tutorial/security)

Replace broad file-prefix navigation checks with exact permitted application routes/origins; reject unexpected protocols and subframes. Preload exports narrow methods, not raw `ipcRenderer`, generic filesystem access or arbitrary shell execution. Main-process handlers validate sender frame, payload type/size, operation authorization and canonical destination. File dialogs grant a bounded operation, not an enduring capability to read arbitrary paths.

PIF embedded hashes verify consistency, not authorship. Untrusted project scripts require explicit review/approval; SHA-256 proof alone must never unlock execution. Shader and model parsing also need resource limits. Development trust policy and release trusted-bundled-code policy are separate. A compromised dependency or signed malicious game remains dangerous; signing establishes publisher/integrity properties, not benevolence.

### 8. Signing, licenses and reproducibility

Use a maintained pinned Electron and lockfile; record toolchain, engine commit, dependency versions, profile hash, artifact hashes and license inventory. Apply Electron fuses/configuration before signing, then verify signatures on the target OS. Do not claim a Windows ZIP is signed merely because a checksum exists.

Preserve third-party licenses including the existing XZ/WASM obligations and required source/rebuild information. Importer/compression dependencies and bundled example assets each need provenance/license review. Do not include unknown-license art as a reusable starter by default.

Aim first for reproducible logical content/manifests. Byte-identical signed installers may vary with timestamps/signatures; report that honestly. A second clean build should produce the same cooked asset and compiled-source hashes given the same declared inputs, with any nondeterminism explained.

### 9. Accessibility, sample game and release gates

Require remappable controls, keyboard-only menus, visible focus, scalable/readable text, subtitles where speech conveys gameplay, separate master/music/effects controls and options to reduce camera shake/flashes/motion blur. Colour alone should not convey critical state. A game-specific accessibility review is still necessary; engine options do not certify every game.

Ship four maintained starters with the same public runtime/editor contracts, plus a polished 15–30 minute sample proving import, animation, materials, audio, input, prefab reuse, two-scene transitions, saves and standalone export. Have at least two external developers build a small game from documentation without private fixes. Record blockers and reproduce them before calling the engine 1.0-ready.

| Gate | Required evidence |
|---|---|
| SR0 | Profile schema, dependency closure and deterministic manifest tests |
| SR1 | Action/rebinding tests on keyboard and real controllers |
| SR2 | Save migration/corruption/quota/power-loss recovery matrix |
| SR3 | Clean Linux and Windows packaged player launches, settings/save persistence |
| SR4 | Security/IPC/navigation/license audit and final artifact verification |
| SR5 | Four starter exports, sample completion and external developer feedback |

Proposed sequencing: 0.6 assets/materials/lights; 0.7 animation/audio/input; 0.8 prefab/persistence/gameplay; 0.9 debugging/recovery/export; 1.0 candidate only after the evidence above. Shared identity, lifecycle, diagnostics and validation foundations must begin earlier than the visible feature releases. No calendar commitment or publication authorization is implied.

## R2 — Storage transactions, privileged boundaries and release evidence

### Saves: transaction completion is the acknowledgment boundary

MDN's IndexedDB documentation distinguishes successful individual requests from completed transactions and explains that durability can be relaxed. [1](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction) [2](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability) Refine the browser backend: compute/validate the envelope and digest outside the transaction; atomically write the new generation and slot index in one short transaction; acknowledge only completion; retain one previous valid generation and bound total slots/bytes. Request strict durability for explicit saves where available, with truthful capability reporting.

Proposed defaults: 4 MiB payload per save, 10 slots, two generations, maximum nesting 32, configurable by the game within host limits. These are safety-policy starting points, not IndexedDB quotas. Ask `navigator.storage.estimate()` for advisory storage information where available and handle `QuotaExceededError` regardless of that estimate. Recovery must not silently delete another game's saves to make room.

Native slot IDs are opaque validated identifiers, never paths. Map them inside the configured game directory; reject separators, traversal, reserved names and oversized strings. Serialize writes per slot and compare generations to prevent a slow earlier save from replacing a newer one. Multiple game instances need an explicit lock/conflict policy; do not assume one writer. Failed migration reads retain the original bytes and offer export/reset with consent.

### Native navigation/IPC threat model tightened

Electron recommends avoiding broad `file://` privileges in favor of a custom protocol, validating IPC senders, restricting navigation and not exposing raw Electron APIs. [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security) It also warns that forwarding IPC callbacks directly can expose the event's sender; wrappers should pass only validated data, not the event object. [Electron preload guidance](https://www.electronjs.org/docs/latest/tutorial/security#20-do-not-expose-electron-apis-to-untrusted-web-content)

**Changed design:** evaluate a read-only `pinefall-app://` packaged-resource protocol with an exact host/route allowlist. Normalize and decode paths once, reject traversal/symlinks outside the package root, set correct MIME/CSP and deny arbitrary network/file fallthrough. Validate top-level `senderFrame` and owning window for every privileged IPC call; a trusted-looking URL string alone is insufficient. Revoke temporary save/open capabilities after use or navigation.

The current same-renderer trusted script model is an important boundary: approved game scripts may call anything intentionally exposed to that renderer. Sender checking cannot distinguish a good editor button from malicious code in the same frame. Keep untrusted project scripts disabled; robust untrusted-play isolation requires a separate renderer with no editor filesystem bridge, which is an architectural follow-up rather than a claimed security guarantee. A release player exposes only narrow game-save/settings capabilities, not editor project-file APIs.

Threat tests: subframe IPC, navigation to lookalike hosts, encoded traversal, malicious external URL schemes, enormous IPC payload, forged slot path, repeated permission requests, raw callback event leakage and unsigned/changed package resources. Reject `shell.openExternal` input except validated user-initiated approved schemes/destinations. Deny permissions by default and grant specific capabilities only through explicit product policy.

### Input repeatability and accessibility refinements

Stable action IDs and binding IDs must survive display-name changes and profile migration, reflecting Unity's binding-override model. [1](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.14/manual/ActionBindings.html) Conflict resolution respects context priority: a menu can consume a button without also firing a gun. On focus loss/disconnect, synthesize releases and cancel active hold interactions. Reconnect does not replay old pressed edges. If several render frames occur without a simulation tick, retain press/release transitions so a short tap is not lost; bound the queue and report overflow.

Test keyboard layouts, simultaneous opposite movement keys, analog diagonals, stick drift, nonstandard controller mapping, unplug while held, rebinding Escape/Back, text entry and keyboard-only recovery. Rumble is optional capability-gated feedback, not required for gameplay. Controller glyphs need a generic fallback and must not be inferred confidently from unreliable device strings.

### Release evidence matrix and distribution policy

| Environment | Required evidence | What does not count |
|---|---|---|
| Linux physical CEDAR | Effective renderer, settings, sample play, import responsiveness, save/relaunch | SwiftShader/Xvfb-only run |
| Linux modern GPU | Correct visuals, timers if supported, profile switching/context recovery | FPS number without scene/profile |
| Windows physical system | Packaged launch, paths, audio/controller, save/replace and clean exit | Successful cross-build ZIP |
| Browser target | Origin/CSP/storage fallback, supported controls and loading | Electron-only test |
| Headless | No DOM dependency; lifecycle/events/save schema tests | Merely importing a module successfully |

For every row record OS, driver, Electron/Chromium/Three/Rapier versions, build hash, resolution/profile, fixture hash, p50/p95/p99 CPU/frame times and GPU availability. Store hardware reports as consented artifacts with private paths redacted. An unsupported configuration remains explicitly unsupported instead of being relabelled passed.

Stage signed releases through a candidate channel. Publish final hashes/license inventory only after artifact verification; this plan does not authorize uploads. Automatic updates are deferred until signed update metadata, rollback compatibility, release channels and failure recovery are separately designed. Never overwrite user saves during app rollback; older games may not understand newer save schemas, so retain compatible backups and report incompatibility.

### Integration milestones and remaining decisions

Refactor `scripts/game.ts` into reusable build/export services; keep CLI entrypoints thin. Extend `desktop/main.ts`/`preload.ts` with separately reviewed editor versus player bridges. `examples/standalone.ts` becomes a tested minimal public runtime consumer, not a hidden dependency on editor state. Update `scripts/publish-releases.ts` only in a later authorized release task; packaging validation is separate from publication.

Dependencies that block release: Plan 01 asset closure/cooking/PIF migration, Plan 02 audio unlock and lifetime, Plan 03 effective quality settings, Plan 04 scene identities/lifecycle, and Plan 05 recovery/diagnostics. Input can start early behind the raw-input adapter; save envelopes can be tested before prefab persistence is complete.

Record decisions on application IDs/user-data paths, supported Windows/Linux versions, signing provider/key custody, codec distribution, protocol scheme and game-save migration ownership. Signing certificates and physical hardware remain external resources to obtain; neither is assumed available. The final readiness review must distinguish implemented, tested, unsupported and deferred items, with release gates taking precedence over the proposed version numbers.


## R3 — Final integration check

Keep project PIF version, scene schema version, component version, save envelope version and game-save schema version distinct. Their migration policies have different owners. No release gate may be waived by a successful build alone. Begin export work with the current small fixture and the same shared build service used by CLI and wizard; only then broaden the asset closure and package customization surface.

### Companion plans

- [Asset pipeline, asynchronous import and reimport](01-ASSET-PIPELINE.md)
- [Animation, character presentation and audio](02-ANIMATION-AUDIO.md)
- [Materials, textures, lighting, shaders and post-processing](03-MATERIALS-GRAPHICS.md)
- [Reusable gameplay, prefabs, components and scene lifecycle](04-GAMEPLAY-AUTHORING.md)
- [Debugging, profiling, recovery and editor quality of life](05-DEBUGGING-RELIABILITY.md)
