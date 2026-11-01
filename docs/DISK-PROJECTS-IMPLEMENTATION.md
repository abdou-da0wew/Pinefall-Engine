# Folder-first projects and external code workflow

Status: implementation in progress; this is not a claim that disk projects or Plan 03 are complete.

## Accepted user decisions

- A real project folder is the editable source of truth. Files must be editable by VS Code, VSCodium, Visual Studio, a text editor or manual filesystem tools.
- PIF is the portable saved archive. Opening it unpacks into an explicit working project directory; no silent writes into an arbitrary existing directory.
- Repacking supports a settings-controlled interval, per-action saving and a customizable command shortcut.
- Remove embedded script and shader source editors after equivalent external workflows are usable. Retain asset selection, explicit trust, diagnostics and Apply controls, not editable source textareas.
- Watch changes and validate automatically. Applying valid code is explicit; never silently execute newly edited scripts or GLSL. Invalid files retain the last working runtime state.
- Keep the current theme and existing Rendering/device controls. Do not disable Electron isolation or sandboxing.

## Execution order and acceptance

1. Disk filesystem service: root confinement, deny symlinks and traversal, bounded streaming reads, atomic compare-and-swap writes, conflict detection, cancellable serialized saves, bounded/debounced watch events and deterministic shutdown. Unit tests cover malicious paths, external concurrent edits, atomic editor rename events and cleanup.
2. Desktop bridge: native directory selection grants the root; renderer receives opaque session IDs, not unrestricted filesystem access. Validate sender and every argument. Launch configured editor executables with argument arrays and no shell; explicitly configure executable/path instead of guessing or running project-provided commands.
3. Folder representation: project metadata, scene JSON, per-material/shader metadata, .ts source, .glsl applied/draft source, original/imported model and image/audio assets. Use relative references and stable IDs. Missing, renamed or invalid files yield actionable diagnostics without rewriting artistic intent. Integrity hashes apply to portable archives; manual disk edits must not be rejected merely because an old archive digest differs.
4. Working-project adoption: import PIF into a fresh staged directory, validate, then adopt. Preserve source assets and companion metadata. Browser mode must identify its capability limits, not pretend IndexedDB is an externally editable folder. Do not copy a 200MB model through one IPC payload or retain the entire project in renderer RAM.
5. Watch/validate/apply: debounce writes, handle delete/rename and unstable files, tag every validation result with content hash/generation, cancel stale work, show file/line/column/severity and Open externally actions. TypeScript semantic checking uses a project tsconfig and the typed SDK. GLSL checks are driver compilation after consent, not a security sandbox or a complete GLSL LSP. Applying must recheck the validated hash.
6. Save/repack: one queue, no overlapping autosaves; dirty revision and per-file hash conflict checks; atomic archive replacement; preserve previous archive on cancellation/failure. Settings for interval/per-action/manual mode and a registered customizable shortcut. Surface busy, last-success and failure state. Never overwrite external edits silently.
7. Replace embedded editors with file list, Open externally/Open folder, diagnostics, trust and explicit Apply/restart. Validate desktop reopen, external editor changes, error recovery and PIF roundtrip, with screenshots.
8. Continue remaining Plan 03 gates on top of disk-backed resources: texture/UV/channel packing/per-slot materials; leased PMREM environments; independent shadow update policies/fitted frusta; broader post fixtures/failure atomicity; real bounded depth-aware scattering. Maintain separate authored, device and transient runtime settings.

## Resource and trust boundaries

Disk source files remain on disk. Read IPC is chunked and bounded; transformed GPU resources remain subject to shared budgets. Watchers do not read all assets into memory. Project-provided executable paths or commands must never be launched automatically. External code edits invalidate validation, not grant execution permission. Shader deadlines cannot reliably interrupt synchronous GPU/driver work. A file watcher is not a full language server: document the actual diagnostics implemented and do not imply language-server features that are absent.

## Publication

Require automated tests plus built Linux Electron evidence for the disk workflow and each remaining graphics gate before declaring completion. CEDAR/Windows physical and independent acceptance remain owner-deferred, not passed. Version, commit, push and downloadable checkpoints must clearly state any unfinished acceptance gates.

## Checkpoint 0.6.3-dev.2 — 2026-11-01

### Implemented and exercised

- Native working-directory grants, confined chunked reads/writes, semantic path bindings, case-fold collision rejection, conflict-safe differential saves, and binary-reference reuse on ordinary watched text edits.
- No embedded TS/GLSL editor. Configured shell-free external tool launch; real TypeScript 5.9 semantic/SDK diagnostics with source locations; explicit hash-checked Apply; failed shader compilation retains the live material. The project build explicitly invokes the separate TypeScript 7 compiler. Diagnostics use fixed options and a read-only virtual filesystem, not project plugins or a full LSP transport. The 128 MiB checker reservation is accounting, not a measured physical cap.
- Portable offline IDE declarations and `tsconfig.pinefall.json`, installed/refreshed explicitly from Project files. SDK/Three.js types and `@game` aliases work with the external compiler. Existing user configuration and modified declaration files are not force-overwritten. Refresh after changing registered script names. No package install or project script execution is required.
- Native PIF8 raw-folder backups stream TAR/XZ through a separate worker using bounded 64 KiB codec output. Invalid authored JSON and unregistered source files are preserved. SHA-256 entries, size/count/path checks, cancellation, temp-file replacement and external-change checks protect backup/extraction. Hidden files and `node_modules` are explicitly excluded. Backups must be outside the working directory. Partial extraction removes only unchanged files it created; empty directories may remain. Hashes detect corruption, not authenticity.
- Persisted manual/interval/per-action modes, custom shortcut and archive destination; nonoverlapping background jobs and visible status/cancel controls. Recent folder grants are listed in Project files and survive restart.
- PIF8 uses **Open raw folder PIF** in Project files; older PIF archives keep the existing legacy import path. Folder-backed Save project now creates a raw PIF8 backup. Browser and legacy snapshot/export paths remain PIF7 and retain their older whole-buffer limits.
- Session lifetime cancellation stops late validation/save work after folder disposal. Root transitions and failure paths still warrant broader adversarial race coverage.

### Rendering additions

- Renderer-local leased PMREM hemisphere environments, linear source radiance, intensity edits without texture regeneration, context-generation invalidation, and explicit unsupported-float-target reporting. Authored controls are in Rendering. External HDR image environments are not implemented.
- Independent every-frame/on-change/manual shadow policies, targeted SDK invalidation, and directional scene-bound fitting without moving authored light transforms. Scene bounds are shared across fitted lights per frame. Moving gameplay conservatively invalidates on-change maps; deforming geometry may require explicit padding.
- Half-resolution height-density scattering before bloom: 8/16/32 Beer–Lambert integration steps, opaque-depth termination, depth-aware upsampling, target accounting and cleanup. Preview controls can be committed to authored post settings. Transparent objects do not terminate rays; there is no shadow-map lighting or temporal history, and thin geometry can exhibit half-resolution limitations. Existing fake cone beams remain explicitly separate.

### Verification

- Typecheck/lint clean; 153 unit tests / 852 assertions at the latest unit checkpoint.
- Portable IDE check: offline compiler accepts SDK/Three.js and cross-script imports, diagnoses actual type errors, and preserves edited kit files.
- Native external-workflow test: typing-kit install; syntax/semantic diagnostics; external editor launch; explicit Apply without execution; failed shader retention; raw PIF8 including unregistered drafts; per-action and interval backups; customized shortcut execution; recents/settings after application restart.
- PMREM browser pixels: unlit reflective sphere pixel 0 becomes 135 with environment lighting; lease sharing, generation invalidation and accounting cleanup pass.
- Shadow unit tests: independent manual state and fitted bounds; browser engine regression includes targeted manual invalidation.
- Post regression: 100 bloom/FXAA toggle/resize cycles, LDR fallback, resource cleanup, instance isolation and context restoration pass.
- Scattering pixels: near/far 87/208 match the homogeneous Beer–Lambert reference after output conversion; the occlusion edge remains 87/208; 50 toggle/resize cycles finish with zero retained textures and released reservation.
- Native editor: PMREM and scattering authoring/preview/cold-reopen checks pass. SwiftShader is used for automated GPU tests; physical CEDAR/Windows performance remains owner-deferred, not passed.

### Still open — do not label Plan03 complete

Texture-map resource/authoring support, UV transforms and inspection, channel packing, per-slot materials and displacement coverage; external HDR environment inputs; broader G1/G2/G4 fixture/failure matrices and scattering timing/quality gates. Folder workflow follow-ups include unified legacy/PIF8 opening, Home-level folder cards, comprehensive new-source registration, browser GLSL import parity and more transition-race tests.
