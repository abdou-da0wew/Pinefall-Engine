# Pinefall Engine 0.5.1 — PIF project files

> Historical release, design or acceptance record: retain the results and limits of its stated checkpoint. For current implementation and downloads, see [current status](CURRENT-STATUS.md).

Includes the complete 0.5.0 UI toolkit, plus the first milestone of the documented graphics/asset roadmap.

## Highlights

- Real XZ-compressed USTAR `.pif` projects with `project.json`, a reference-only `scene.json`, binary GLB resources and separate TypeScript source files.
- Worker-based editor open/save with cancellation and timeouts; Ctrl/Cmd+S and Ctrl/Cmd+O.
- Binary Electron saves, standalone PIF loading, CLI pack/unpack and PIF input support.
- Strict path/resource validation; fixed expansion and dictionary limits; corrupt, concatenated and oversized archive rejection.
- Opening a project revokes script trust. Failed/stale imports preserve the current scene. Autosave no longer overwrites operation result messages.

## Assets

Linux x86-64 AppImage, Windows x64 ZIP, source ZIP, UI Lab `.pif` example and SHA-256 checksums. Desktop packages are unsigned. Windows requires extracting the full ZIP. The example's scripts require explicit approval before execution.

## Validation and limitations

44 unit/integration tests, 164 assertions, TypeScript/Oxlint, browser worker open/save/cancellation/trust workflows, Linux Electron production worker and binary-save round trip, independent system XZ/TAR compatibility checks. See accompanying release verification records for final packaged-build checks.

**Not the complete graphics overhaul:** FBX/nonblocking model parsing, custom shader authoring, loose texture/normal/height-map workflows, UV tools, new reflections, expanded lighting/shadows, true volumetrics and broader QoL changes remain pending. PIF worker processing does not make the current GLB parser or GPU upload path stall-free.

The on-disk project separates resources; the in-memory compatibility adapter and local recovery cache still use legacy scene data. Current asset schema remains GLB-only. Scripts are trusted host-privileged code. Windows execution and physical Radeon performance remain untested.

Final package checks: the Linux unpacked artifact produced alongside the AppImage passes both the PIF binary-save suite and the full UI authoring/Play suite. Windows ZIP builds successfully but was not executed. Native addon rebuilds are disabled because the application bundles only the WASM codec, not the dependency's native addon. License notices accompany the desktop package.
