# Pinefall graphics, asset pipeline and PIF implementation plan

Status: plan written before implementation; phase 1 source integration now verified. Phases 2–4 and most of phase 5 are pending. Completion of one phase does not imply completion of later phases.

## Goals and constraints

Keep TypeScript/Bun/Oxlint, the reusable runtime/editor/headless separation, Linux/Windows Electron, and low-end Radeon compatibility. Existing scenes must remain importable. No claim of ray tracing, global illumination, true volumetrics, or stall-free GPU upload without a corresponding implementation and validation.

## 1. PIF project format (first implementation milestone)

- Define `.pif` version 1 as XZ-compressed TAR: `project.json` manifest, `scene.json` definition, `assets/` binary resources, and `scripts/` TypeScript sources.
- Scene JSON references archive resources; it is not the project container and does not carry base64 assets or inline script sources inside PIF.
- Use real XZ compression/decompression, with bounded expansion and strict archive validation: duplicate paths, traversal, links, missing references, incompatible versions and oversized files must fail before loading.
- Round-trip compatibility with existing embedded-asset scene JSON through an explicit adapter. Preserve asset/script IDs and trust gates. Importing a project must never execute its scripts.
- Run browser compression/decompression in a cancellable worker. Keep codec reusable by Bun/headless tools and desktop builds without relying on a system-installed xz executable.
- Editor Open/Save Project defaults to PIF; keep JSON as explicit legacy scene interchange. Add CLI pack/unpack and versioned format documentation.
- Tests: XZ magic/interoperability, archive layout, round trip, malformed paths/references, bounded decompression, script preservation and import trust revocation.

## 2. Non-blocking asset pipeline

- Replace monolithic imports with queued jobs, progress, cancellation, byte/texture/geometry budgets and clear errors. Keep the currently loaded world usable until an import has succeeded.
- Worker-side parsing/conversion where supported. Transfer buffers rather than repeatedly cloning/base64-encoding large resources. Main-thread GPU allocation must be staged; GPU driver upload can still stall and cannot honestly be guaranteed stall-free.
- Cache immutable parsed assets and avoid reparsing all models on every unrelated inspector edit. Dispose superseded resources deterministically.
- Support GLB and FBX via Three's loaders, including embedded textures and explicit companion texture selection. Resolve only supplied resources; do not silently fetch arbitrary external paths.
- Normalize imports to reusable internal assets; preserve source metadata, normals, tangents, UV sets and material slots. Warn about unsupported FBX materials/animations rather than silently dropping them.
- Tests: actual FBX and textured GLB fixtures, companion files, cancellation, corrupt input, resource cleanup, and UI heartbeat/responsiveness during conversion.

## 3. Materials, texturing, UVs and custom shaders

- Extend versioned material definitions: lit PBR/unlit, base color, emissive, roughness, metalness, alpha, double-sided rendering and normal strength.
- Texture slots: albedo (sRGB), normal, roughness, metalness, AO, emissive, displacement/height and depth data (linear). Explicitly distinguish depth data from displacement, parallax and actual added geometry.
- UV controls: channel, repeat, offset, rotation, wrap/filter modes and flip conventions. Add inspection/UV checker before promising a full mesh-unwrapping editor.
- Reflection support via environment maps/PMREM and material parameters; document limits of environment reflections versus screen-space/planar reflections. No ray-tracing claims.
- Custom shader assets with vertex/fragment source, typed uniform descriptions, explicit compile/apply, error display and fallback to the previous valid material. Document normal/tangent/world/view-space conventions and available texture/reflection uniforms.
- Script SDK APIs for material parameters/uniform updates without scene reload; scene/project serialization preserves shader assets.
- Tests: shader compile failure recovery, normal-map conventions, texture color spaces, UV transforms and save/load.

## 4. Lighting, shadows, cones and post-processing

- Expand in-app GFX settings with low/balanced/high presets and independent quality controls. Persist device settings separately from authored scene lighting.
- Directional/point/spot lighting: color, intensity, position/direction, range, decay, cone angle, penumbra and per-light shadow enablement.
- Shadow controls: resolution budgets, bias/normal bias, camera range/frustum, filtering and update frequency. Default conservative settings for old GPUs.
- Separate real-time direct/PBR lighting from unlit/emissive/fake fill lighting. Light maps are authored data, not automatic baked GI.
- Label current mesh cone beams as approximate. Add depth-aware volumetric scattering only behind a separately tested quality option with sample count, density, anisotropy, range and resolution scale; do not relabel cone meshes as real volumetrics.
- Post stack controls for exposure/tone mapping, bloom/glow threshold/intensity/radius, color adjustments, vignette and optional antialiasing. Passes allocate only when enabled and dispose on changes.
- Tests: preset switching/resource cleanup, visible effect checks, shadow limits, no shader errors, low-end fallback and headless-safe scene schema.

## 5. Shortcuts and quality of life

- Central shortcut registry and searchable reference; scope commands to the active editor, avoid intercepting text fields or game controls.
- Ctrl/Cmd+S saves project, Ctrl/Cmd+O opens project, undo/redo, duplicate, frame selection, viewport focus, play/stop and command palette.
- Import job list, progress/cancel, dirty project indicator, unsaved-change warnings and actionable validation messages.
- Preserve focus, panel sizing and undo atomicity; do not create history entries for no-op edits.

## Release/acceptance sequence

Implement and validate phase 1 first, then phases 2–5 in order with narrow commits. Record actual completion and any deviations below. Run TypeScript/Oxlint, unit/headless tests, browser regressions, packaged Linux tests and build Windows packages only for a coherent tested milestone. Windows execution and physical CEDAR performance remain unverified unless tested on those systems. Do not publish to GitHub implicitly.

## Execution log

- Plan created before implementation. Repository baseline: local 0.5.0 commit 6919ac2.

### Milestone 1 execution (completed source integration)

- Implemented real XZ/TAR PIF pack/unpack and strict, bounded decoding; separate GLB/script archive entries and reference-only scene definitions.
- Added cancellable browser workers, editor Save/Open Project, Ctrl/Cmd+S/O, binary desktop IPC saves, standalone PIF loading, CLI pack/unpack and PIF input support.
- Opening revokes script trust; cancelled/invalid/stale imports do not replace the scene. Autosave no longer overwrites operation status messages. Gameplay ignores modifier-key editor shortcuts.
- Found mismatched inline WASM in the pinned codec dependency; use its matching binary/glue instead, with license notices and replacement instructions.
- Validation: archive unit tests, browser worker workflow, production Linux Electron binary-save round trip, system XZ/TAR interoperability, TypeScript/Oxlint and full unit suite pass.
- Current limitation: in-memory compatibility adapter and recovery autosave still use the old embedded-data scene shape. Disk `.pif` uses proper separate resources. Current asset schema remains GLB-only.
- **Still pending:** phases 2, 3 and 4, and the broader command palette/dirty-state/QoL work in phase 5. No FBX, custom shaders, new reflection/UV/material controls, depth-aware volumetrics or expanded lighting controls have been implemented in this milestone. Do not describe the full 0.6 request as complete.
