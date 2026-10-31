# Pinefall Engine 0.5.0 — Game UI toolkit

Release source: commit `6919ac2`. Includes the 0.4.1 custom color-picker fix.

## Highlights

- Visual HUD editor: eight widgets, viewport drag/resize, 8px snapping, undo/redo, anchors, nested panels and row/column layouts.
- Panels, text, buttons, progress bars, toggles, sliders, text inputs and selects; typography, colors, opacity, borders and spacing.
- Typed `ctx.ui` SDK for creation/removal, values, styles, visibility, events and named actions. Lifecycle-scoped listeners and error isolation.
- Game-loop, physics-trigger and event-driven updates; actionable Pause/Resume menus and Stop restoration.
- DOM-free UI model and headless interaction tests; sample HUD/controller and standalone UI Lab.

## Assets

Linux x86-64 AppImage, Windows x64 ZIP, exact source ZIP, standalone UI Lab web ZIP and SHA-256 checksums.

Both desktop packages are unsigned. Extract the entire Windows ZIP before running its executable. Serve the UI Lab ZIP contents over HTTP; review and approve its scripts before Play.

## Validation and boundaries

38 unit/integration tests, 144 assertions; TypeScript/Oxlint; browser UI/regression tests; packaged Linux UI workflow; standalone export. Linux tests use Xvfb/SwiftShader. Windows execution and physical Radeon CEDAR performance were not tested.

This version does not contain PIF support (added in 0.5.1). It does not add FBX, custom shader authoring or the planned graphics overhaul. Scripts are trusted host-privileged code, not sandboxed.
