# Pinefall Engine 0.6.3-dev.2 — Development pre-release

This is a usable development checkpoint, **not completion of Plan03 or a stable-release claim**.

## Included
- Native working folders and external TS/GLSL editing, real TypeScript semantic diagnostics, portable offline IDE typings, and explicit Apply with last-working runtime retention.
- Streamed raw PIF8 backups, manual/interval/per-action/custom-shortcut repacking, and persistent folder recents/settings.
- Leased procedural PMREM reflection lighting, independent shadow update policies and fitted directional bounds.
- Half-resolution depth-aware height scattering with 8/16/32 Beer–Lambert integration steps, before bloom.

## Downloads
- Linux x64 AppImage: make executable with `chmod +x`, then launch normally. Do not disable the production sandbox.
- Windows x64 ZIP: extract completely, then launch Pinefall Engine.exe. The Windows package is built but has not been execution-tested on Windows.
- Desktop binaries are unsigned; no signing certificate was configured.
- Source ZIP: install Bun, run `bun install`, then `bun run desktop` (or `bun run dev` for the browser subset).
- SHA256SUMS: checksums for the four downloadable artifacts.

## Project workflow and compatibility
Use Project → Project files & external tools to choose a working directory, configure an external editor, install IDE typings, validate edits and explicitly Apply them. Scripts still require trust before Play; opening or watching files does not execute them.

Folder-backed Save project creates **PIF8**. Open it using **Open raw folder PIF** inside Project files, choosing an empty extraction directory. Legacy PIF1–7 files use the existing Open project path. Browser/export/snapshot paths remain PIF7. Older releases cannot read PIF8.

PIF8 preserves invalid and unregistered drafts. Hidden files and node_modules are excluded. Save archives outside the working folder. Limits are 512 MiB compressed/expanded and 10,000 files. Hashes/checksums detect corruption, not authenticity.

## Verification
- Typecheck and lint pass; 153 unit tests, 852 assertions.
- The packaged Linux build passed the full external-workflow/restart test. Native Linux/SwiftShader tests cover IDE installation, diagnostics, external editor launch, explicit Apply/no execution, shader error retention, PIF8 preservation, both automatic repack modes, customized shortcut execution, and recents/settings after restart.
- Native editor tests cover PMREM/scattering authoring and cold reopen.
- Rendering tests verify PMREM pixels/cache cleanup, independent shadow behavior, context recovery, 100 post toggle/resize cycles and 50 scattering cycles with depth-edge/pixel checks.

## Remaining work and limits
- Texture-map authoring, UV/channel-packing tools, per-slot materials and displacement coverage are unfinished.
- External HDR environment input and broader graphics fixture/failure/timing gates remain open.
- Scattering is terminated by opaque depth; transparent surfaces do not terminate it. There is no shadow-map lighting or temporal history, and thin geometry can show half-resolution limitations.
- Unified legacy/PIF8 opening, Home-level folder cards, comprehensive new-source registration, browser GLSL import parity and further transition-race coverage remain open.
- Physical AMD CEDAR/Windows performance and independent acceptance remain owner-deferred and **unverified**, not passed.

See docs/DISK-PROJECTS-IMPLEMENTATION.md and docs/evidence/disk-workflow for implementation details and screenshots.
