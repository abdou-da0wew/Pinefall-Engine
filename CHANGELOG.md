# Changelog

## Unreleased

- Unified native PIF1–8 opening with streamed legacy extraction, pre-conversion integrity checks, editable metadata migration, rollback and cancellation checks.
- Explicit disk registration of TS/GLSL/shader-metadata/material sources and trusted staged selection of registered shaders. Watcher-owned validation avoids competing semantic-check jobs.
- New Electron end-to-end coverage and legacy version/failure/cancellation fixtures; 162 tests / 986 assertions. Graphics completion/release remains pending.

- Browser GLSL/uniform JSON import/export with bounded UTF-8 ingestion, explicit trust and staged Apply; failed compilation retains the previous authored/runtime shader. No embedded source editor.
- Browser import/failure/export/reopen coverage and native workflow regression pass; current suite 157 tests / 936 assertions.

- Refresh maintained documentation and distinguish historical evidence from current status.
- Install a source-owned Bun commit-msg hook for the DiveeAgent co-author trailer.
- Home working-folder cards with validated session handoff and cancellation-aware acceptance; native restart/no-execution coverage.
- Verification: 155 unit tests, 918 assertions; typecheck/lint, desktop build and native external workflow pass. Remaining Plan03 and folder UX work is not complete.

## 0.6.3-dev.2 — Folder workflow and rendering checkpoint (Plan03 incomplete)

- Native folder-first editing, conflict-safe disk saves, shell-free external tools, semantic TypeScript diagnostics, and offline IDE typing-kit generation. Embedded TS/GLSL editors removed.
- Streamed raw PIF8 archives preserve invalid/unregistered drafts. Manual, interval, per-action and customized-shortcut repacking; folder recents/settings survive restart. Native PIF8 opening is separate from legacy PIF import; hidden files/node_modules are excluded.
- Explicit Apply retains prior runtime on errors. Script execution still requires trust.
- Leased procedural PMREM environments, independent shadow modes/fitted directional bounds, and half-resolution opaque-depth-aware Beer–Lambert scattering, with preview/authored controls.
- Software checks cover the folder lifecycle, actual lighting/scattering pixels, cleanup and post/context regressions. Physical CEDAR/Windows acceptance remains owner-deferred and unverified.
- Still incomplete: texture/UV/channel-packing/per-slot authoring and remaining graphics gates; external HDR input; several folder UX/race follow-ups. See `docs/DISK-PROJECTS-IMPLEMENTATION.md` for precise limits.

## 0.6.2 — Commands and disk-backed assets (local release candidate)

- Searchable commands, focus-safe keyboard routing and project-local scene/UI clipboards.
- Verified disk-backed encoded assets, reference workers/checkpoints and lazy library models.
- Actual authored-project Player preview/return, canceled import intent cleanup and correct writer version.
- 132 unit tests; browser and packaged Linux regressions pass. Windows execution and physical acceptance remain unverified.
- See [release notes](docs/RELEASE-0.6.2.md). GitHub publication awaits authentication.

## 0.6.0 — Plan02 full software release

- Promotes the locally validated animation/audio implementation and bounded streaming/persistent profile to the full release.
- The owner explicitly deferred native Windows/CEDAR and physical audio/timing acceptance to their own testing. These checks are unverified, not passed.
- Rebuilt Linux AppImage, Windows ZIP, source and original workshop PIF; published SHA-256 checksums.

## 0.6.0-rc.1 — Plan02 software release candidate

- Authored clips/graphs/markers, independent pose playback, collision-correct supported root motion and preview tooling.
- PIF6 buffered and bounded streaming WAV audio; explicit persistent ownership, scoped seek, spatial/pause/device policies and Audio studio.
- Original combined workshop, headless/export/packaged Linux tests; 125 tests / 644 assertions. Linux AppImage and Windows ZIP built.
- **Prerelease only:** Windows/CEDAR/physical timing/listening and independent acceptance remain open. See docs/PLAN02-ACCEPTANCE.md.

## 0.5.3 — Worker asset pipeline, first implementation

- GLB parsing/image decode in cancellable workers; shared prototype cache and independent skinned clones.
- Bounded geometry/image/FBX admission, stable-ID reimport, import reports and original-source retention.
- Experimental ASCII/binary FBX + PNG/JPEG conversion. Fidelity across DCC exporters is not certified.
- PIF v3 stores provenance and original sources separately; keeps v1/v2 readers and writes v2 when no provenance is present. Older editors cannot open v3: keep backups.
- Undo snapshot blob interning, GLB CLI import/reimport, and pinned matching Three r185 runtime/types.
- 59 tests / 225 assertions, TypeScript/Oxlint, browser asset/runtime/PIF/export tests and production Linux Electron checks. Windows and physical CEDAR execution remain untested.
- Persistent artifact database, reference-only documents, complete dependency invalidation and other Plan 01 gates remain open.

## 0.5.2 — PIF v2 metadata and integrity

- Portable versioned project/editor metadata, stable project UUID, creation/modification timestamps, game version, author/description and last saved tool/docking side.
- Mandatory SHA-256 payload inventory and canonical root hash for v2; validate before scene adoption.
- Verify/inspect API and CLI with strict legacy rejection and optional trusted full-archive SHA-256. Embedded hashes are not signatures or authentication.
- Legacy PIF v1 remains readable; published 0.5.1 cannot open v2. Packaged as 0.5.2.
- 50 tests / 190 assertions, browser worker and Linux Electron checks pass.

## 0.5.1 — PIF project-format milestone

- Plan saved before implementation in docs/PLAN-0.6.md.
- Genuine XZ-compressed TAR .pif projects with scene definition, binary GLB resources and separate TypeScript files; strict bounded decoder and archive validation.
- Cancellable worker open/save, editor project commands and Ctrl/Cmd+S/O, standalone PIF loading, binary desktop save IPC and CLI pack/unpack.
- Reopening projects revokes script trust; failed or stale imports preserve the current scene; autosave preserves meaningful operation status.
- FBX/nonblocking model parsing, shaders/materials/UV/reflections, lighting/volumetrics and broader QoL phases remain pending. Packaged as 0.5.1; this is not completion of the full 0.6 roadmap.

## 0.5.0 — UI toolkit

- Visual UI designer: eight widgets, viewport selection/drag/resize, 8px snapping, undo/redo, anchors, reference-canvas sizing, parent panels and row/column layouts.
- Style controls including custom color picker, background alpha, font size, text alignment, borders, radius, padding, visibility and enabled state.
- DOM-free validated UI schema/store, shared by graphical and headless engines; additive optional scene.ui keeps old scenes compatible.
- Typed SDK UI queries, creation, removal, patches, text/value/style updates, show/hide, events and named actions. Script listeners clean up on disposal; callback failures are isolated.
- Keyed, dirty-updated DOM renderer, safe text content, keyboard-focus preservation, gameplay input suppression while controls are focused, and actionable pause menus.
- Sample HUD/controller and UI Lab with a real physics-trigger hazard; headless reports include live UI state.
- No-op authoring edits no longer consume undo history. Desktop Linux/Windows distributions retained.
- Validation: 38 unit/integration tests (144 assertions), strict TypeScript/Oxlint, browser UI suite, packaged Linux UI suite and standalone UI export pass. Windows package built but not executed.
- Includes all 0.4.1 changes. Not yet published to GitHub.

## 0.4.1 (local patch)

- Replace native material/light color inputs with a custom portal-mounted picker, clamped to the viewport and repositioned on resize/scroll.
- Add hue/saturation/brightness editing, HEX/RGB validation, Pinefall palette swatches, original/preview colors, keyboard controls and focus management.
- Apply is one undoable edit; Cancel, Escape and outside-click discard the draft. No alpha control is exposed because the current materials/lights store opaque RGB colors.
- 31 unit/integration tests (106 assertions), strict checks and the dedicated browser color-picker test pass.

## 0.4.0

This release includes the previously unpublished 0.2 and 0.3 work as well as 0.4 workspace improvements.

### Added

- Game creation workflow, embedded GLB import/instances, custom-scene web export.
- DOM-free simulation and JSON CLI for authoring, validation and gameplay tests.
- Attachable TypeScript scripts, typed SDK, lifecycle hooks, editable per-instance properties, helper modules, runtime entity spawning/destruction, explicit trust gates and semantic CLI type checking.
- Beacon Run and Script Lab examples, including original GLB art and three reusable scripts.
- Phosphor UI icons and a custom sand/sage Pinefall diamond logo, favicon, Linux icon and Windows ICO.
- Resizable panels, drag-dockable bottom/right shelf, focus mode and saved layout preferences.
- Nested collections, multi-selection, collapsed-state persistence, ancestor-aware search, keyboard navigation and subtree duplication/deletion.
- World-preserving object reparenting with cycle, shear and physics-root validation.
- Full creation, scripting, SDK, workspace and release documentation.

### Improved

- Authoring edits preserve the orbit camera.
- Collection framing fits multiple objects; script errors include useful context in the console.
- Scene/prefab serialization preserves collections and scripts; imports remap collection IDs.
- Reduced-motion preferences, focus rings, drag targets and hover feedback.

### Compatibility and safety

- Existing version-1 scene files remain readable. Collections, scripts and attachments are optional extensions.
- Old binaries do not support the new workflows; back up scenes before switching versions.
- Source/script metadata does not grant execution permission. Imported script code requires review and explicit approval.
- Scripts are not a security sandbox. Windows runtime and physical CEDAR validation remain outstanding.

## 0.1.1

Initial published engine foundation: four starter scenes, visual editor, standalone player, real physics, camera rig overrides, behavior exception isolation and desktop packaging.
