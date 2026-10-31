# Changelog

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
