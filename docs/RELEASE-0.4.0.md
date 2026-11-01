# Pinefall Engine 0.4.0 release

> Historical release, design or acceptance record: retain the results and limits of its stated checkpoint. For current implementation and downloads, see [current status](CURRENT-STATUS.md).

A complete distribution of the current **experimental** engine foundation, not a claim of production maturity or Unity feature parity.

## Assets

- `Pinefall-Engine-0.4.0-linux-x86_64.AppImage`: Linux desktop editor/player with the new diamond icon.
- `Pinefall-Engine-0.4.0-win-x64.zip`: complete unsigned Windows desktop application; extract all files.
- `Pinefall-Engine-0.4.0-source.zip`: source, lockfile, examples, tests, docs and branding assets.
- `Beacon-Run-0.4.0-web.zip`: standalone collect-and-return example with an imported original GLB model.
- `Script-Lab-0.4.0-web.zip`: standalone scripted dash, trigger and dynamic-crate example; script approval required.
- `SHA256SUMS-0.4.0.txt`: checksums for the other five assets.

The web exports need a static HTTP server. Neither web ZIP needs the visual editor at runtime. Source/CLI work requires Bun; packaged desktop applications do not.

## Highlights

Visual game creation and asset imports; reusable TypeScript attachments and SDK; a headless authoring/simulation CLI; real Rapier physics; Phosphor editor icons; Pinefall diamond branding; resizable and dockable workspace; nested collections and object parenting; saved layout/collapse state; improved navigation and micro-interactions.

## Validation scope

- Strict TypeScript and Oxlint.
- 28 unit/physics/headless/scripting/hierarchy tests, 82 assertions.
- Browser starter, runtime, creation, scripting and workspace suites, using Chromium/SwiftShader.
- Script Lab's three modules pass actual TypeScript semantic checks.
- Packaged Linux script import, trust gate, physics spawning and Stop restoration under Xvfb/SwiftShader.
- Linux AppImage and Windows ZIP generation, plus SHA256 verification of release uploads.

Windows execution, physical CEDAR/Wayland compatibility, long-duration memory testing and hardware FPS guarantees are **not** part of this validation. Packages are unsigned. Native Linux desktop libraries/display support remain necessary.

## Script security

Scene files can contain executable TypeScript. Import and syntax/type checks do not execute it. Running approved scripts gives them host JavaScript privileges; the import resolver is not a sandbox. Headless scripts can access filesystem/process capabilities. Do not approve untrusted code.

## Known limits

Single-scene projects; self-contained decoder-free GLB imports; primitive collision proxies; physics bodies remain transform roots; no unrestricted floating-window editor, skeletal-animation authoring, audio system, networking, navmesh, visual scripting, IDE autocomplete/debugger, hot reload or automatic per-game desktop exporter. The full supported limits are in the README and linked guides.

## Upgrade

Export existing scenes before opening a new game or changing binaries. Existing version-1 scenes remain readable; optional collections/scripts extend the schema. Always keep exported JSON backups—local autosave can exceed browser storage quota. The earlier 0.1.1 release is retained for rollback, but does not implement newer features.
