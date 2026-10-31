# Pinefall Engine 0.5.2 — PIF v2 metadata and integrity

Includes all 0.5.0 UI toolkit and 0.5.1 project-container features.

## New

- Portable metadata inside the `.pif` archive: container/minimum-reader versions; project UUID, title, author, description, game version, creation/modification times; editor version, scene schema, last saved tool and shelf docking side.
- Mandatory SHA-256 inventory for every payload file, including scene definitions, metadata, scripts and binary assets, plus a canonical root hash. Validate before scene adoption.
- Inspection/verification API and `verify-pif` CLI, strict-integrity mode, optional externally trusted full-archive SHA-256, and validated metadata editing via CLI.
- Stable project identity across editor saves; metadata does not carry script approval, machine identity or automatic personal information.

## Important compatibility and security notes

**0.5.2 reads PIF v1 and v2, and writes v2. 0.5.1 cannot open v2 files.** Retain original v1 projects or use legacy JSON interchange when working with older editors. Legacy v1 is reported as unverified and can be rejected with `--require-integrity`.

Embedded hashes are integrity checks, **not signatures or authentication**: an attacker can replace content and recompute hashes. For replacement detection, compare the archive against a digest obtained through an independently trusted channel. Hash verification does not establish that scripts are safe; review and explicitly approve executable code.

## Downloads

- Linux x86-64 AppImage
- Windows x64 ZIP (extract the entire ZIP before running)
- Exact source ZIP
- UI Lab PIF v2 example
- SHA256SUMS

Desktop binaries are unsigned. The example contains scripts requiring approval before Play.

## Verification and remaining scope

50 unit/integration tests, 190 assertions; TypeScript/Oxlint; browser PIF and UI workflows; Linux Electron production save/load checks. Packaged Linux verification is recorded during release preparation. Windows packages are built but Windows execution and physical Radeon CEDAR performance remain untested.

This does not implement the remaining FBX/nonblocking model parser, custom shaders, UV/texturing, reflection or expanded graphics/lighting/volumetric roadmap. XZ processing runs in workers; current GLB parsing/GPU uploads are not guaranteed stall-free. See `docs/PIF.md` and `docs/PLAN-0.6.md`.

Final packaged-build checks: both Linux PIF binary-save roundtrip and UI authoring/Play suites passed against the unpacked Linux artifact produced alongside the AppImage. Linux and Windows packages built successfully; all release assets receive SHA-256 verification before publication.
