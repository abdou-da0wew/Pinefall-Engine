# Unified native opening and source registration

Unreleased work after c66cd12. [Current status](../../CURRENT-STATUS.md) remains authoritative.

- `bun run check`: typecheck/lint pass; 243 files, zero warnings/errors.
- `bun test tests`: 162 pass, 986 assertions, 37 files.
- `bun run desktop:build`: passed; 1,060 portable SDK files. Existing bundle-size warning remains.
- `xvfb-run -a bun tests/unified-sources-native.ts`: [pass](native.txt), Home opens legacy PIF into a working folder, registers TS and GLSL files without execution, explicitly applies them, selects a registered shader through staged compilation, then opens raw PIF8 through the editor Open project route.
- `xvfb-run -a bun tests/external-code-native.ts`: [pass](native-regression.txt), existing external-file/IDE/Apply/retention/repacking/restart regression.
- `tests/project-archive.test.ts`: all legacy versions 1–7, raw PIF8, typed metadata/source preservation, hash tampering, unsupported minimum reader, unknown inventory and pre/mid-upload cancellation.
- `tests/source-registration.test.ts`: TS, GLSL, existing shader metadata/material catalogs, file preservation, duplicate rejection, invalid/uniform-only JSON and oversized fragment cleanup.

Screenshots: [source registration](native-source-registration.png), [unified in-editor opening](native-unified-open.png). Actual Linux Electron on SwiftShader; not CEDAR/Windows timing evidence. Production sandbox settings were not weakened. Physical and independent acceptance remain owner-deferred, not passed.

A real concurrent-validation failure was found in the first native run: registration and the watcher started competing semantic jobs. Registration now leaves validation to the root watcher, and the repeated native run passes. This is not a claim that all possible transition races are covered.

No new release or whole-Plan03 completion is implied.
