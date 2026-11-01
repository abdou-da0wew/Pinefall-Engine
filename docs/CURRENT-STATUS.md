# Current implementation and release status

Reviewed 2026-11-01. This is the current-status entry point; dated release notes, evidence and original design plans describe their own checkpoints, not the latest implementation.

## Published release

**[v0.6.3-dev.2 development pre-release](https://github.com/abdou-da0wew/Pinefall-Engine/releases/tag/v0.6.3-dev.2)** is public. All five assets were size/hash verified: Linux x64 AppImage, Windows x64 ZIP, source ZIP, release notes and SHA256SUMS. Packaged Linux passed the external-workflow/restart test. Windows is packaged, unsigned and execution-untested. The stable historical release remains v0.6.2.

## Implemented

- Native working folders, externally editable TS/GLSL/metadata/assets, shell-free external editor launching, automatic syntax/semantic validation and explicit hash-checked Apply. Failed shader compilation retains the previous runtime. Opening files never grants code execution permission.
- Portable offline SDK declarations and `tsconfig.pinefall.json`, installed/refreshed explicitly. Project-provided TypeScript plugins are not run by the engine's checker. This is not a full LSP server.
- Streaming native PIF8 raw-folder backup/extraction, preserving invalid/unregistered drafts; manual, interval, settled-change and customized-shortcut repacking; persistent folder recents/settings. Hidden files and node_modules are excluded; archives must be outside their working directory.
- Scalar PBR/unlit surfaces, reusable materials, isolated runtime overrides, custom-unlit trusted GLSL, independent lights and shadow budgets/update policies, fitted directional bounds.
- Renderer-local leased procedural PMREM hemisphere environments with context invalidation and explicit float-target capability limits.
- Ordered post chain: scene/opaque depth → half-resolution height scattering → bloom → grade → output conversion/tone mapping → FXAA. Scattering has bounded 8/16/32-step Beer–Lambert integration and depth-aware upsampling. Fake cone beams remain separate and explicitly labeled.
- Existing animation/audio, imported-model, game UI, headless and Player workflows remain supported. Model+companion import admission is 200 MB; decoded/GPU budgets are separate.

## Unreleased additions after v0.6.3-dev.2

- Native Home working-folder cards reopen persistent folder grants with source diagnostics, hash verification and session handoff. Trust is not granted by opening. Folder acceptance now observes session cancellation.
- Maintained guides refreshed; historical records labeled; local Markdown link audit found no missing file targets. Source-owned commit-msg hook installs locally and adds the requested DiveeAgent trailer.
- Validation: typecheck/lint clean; 155 unit tests / 918 assertions; desktop build and native external-workflow/restart test passed, including Home folder opening without script execution. These additions are not in the published release.

### Browser shader file exchange checkpoint

Browser Custom shader now imports/exports GLSL fragments and uniform JSON without embedded editing. Import is inert; explicit Rendering trust and Compile and apply are required. Strict staged loading retains the prior world on compilation failure. Closing the dialog cancels its pending operation. Successful imports participate in authored project recovery/export; unapplied browser candidates are dialog-local, not disk-watched or automatically saved.

Verification: 157 unit tests / 936 assertions; typecheck/lint (237 files); desktop build; browser file-exchange UI test (trust, Apply, failure, bounds, export, cold reopen); existing shader GPU test (20 replacement cycles, cancellation/revocation/context restoration); native external-workflow/restart regression. SwiftShader only, not hardware timing. [Evidence](evidence/browser-shader-files/README.md).

## Remaining work — not complete

Texture-map authoring, UV inspection/transforms, channel-packing tools, per-slot material authoring and displacement coverage; external HDR images; broader graphics fixture/failure/timing coverage. Scattering currently does not terminate at transparent surfaces, sample light shadow maps, or retain temporal history; thin geometry has half-resolution limitations.

Folder follow-ups: further transition-race and large/adversarial fixture coverage. Native unified PIF opening and authored-source registration were implemented after the browser shader checkpoint; see below. See [completion execution plan](COMPLETION-EXECUTION.md).

## Evidence and acceptance

The published checkpoint passed 153 unit tests / 852 assertions, native workflow/editor tests, actual PMREM/scattering pixel tests, resource cleanup, 100 post toggle/resize cycles and 50 scattering cycles. Evidence is under [disk-workflow evidence](evidence/disk-workflow/). Additional working-tree tests must be identified separately from that published checkpoint.

Physical AMD CEDAR/Windows, listening, timing and independent acceptance remain owner-deferred and unverified. SwiftShader results are not hardware-performance certification. No production sandbox weakening is authorized.

## Reading the documentation

- [Folder workflow](DISK-PROJECTS-IMPLEMENTATION.md), [PIF compatibility](PIF.md), [scripting](SCRIPTING.md), [graphics SDK](GRAPHICS-SDK.md), [shortcuts](SHORTCUTS.md).
- [Contribution setup and co-author hook](CONTRIBUTING.md).
- Original plans and historical release notes retain their original scope/results and are labeled accordingly; they must not be used as current feature inventories.

## Unified opening and authored-source registration — unreleased

Native Home Open project, editor Open project / Mod+O, and Project files → Open project PIF now use the same bounded opener. It detects raw PIF8 or streams legacy PIF1–7 files into an explicitly empty destination. Legacy v2–7 per-file/root hashes are checked before metadata conversion; v1 remains unsigned/unverified. Inline materials and shader metadata become editable files while binary resources stay on disk. Unregistered/invalid raw PIF8 drafts are preserved. Original input archives are not modified. Historical legacy integrity proof is labeled under `migration/`.

Project files can register existing `.ts` modules, `.glsl` fragments, shader metadata JSON and material JSON. Registration preserves source paths/bytes and writes the scene catalog last with compare-and-swap checks. Generated wrappers are cleaned up on failure unless externally edited. Registration does not execute or attach code; the watcher owns validation and Apply remains explicit. Uniform JSON belongs to a shader metadata reference, not a standalone asset. Binary models/audio still use their existing import pipelines; this is not an arbitrary-file-to-runtime importer. Registered shaders can be selected in the Inspector with trusted staged compilation.

Validation: 162 unit tests / 986 assertions, 243 linted files, desktop build, actual Electron Home legacy opening → TS/GLSL registration → shader selection → editor PIF8 reopening, and full native external-workflow/restart regression. Unit coverage includes versions 1–7, hash failures, unknown resources, minimum-reader rejection and mid-upload cancellation. No new release is published; broader graphics completion is still required. [Evidence](evidence/unified-sources/README.md).
