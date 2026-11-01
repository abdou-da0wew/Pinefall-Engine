# Browser shader file exchange — 2026-11-01

Unreleased checkpoint after `ee75f91`; see [current status](../../CURRENT-STATUS.md).

- `bun run check`: typecheck and lint, 237 files, zero warnings/errors.
- `bun test tests`: 157 pass, 936 assertions across 35 files.
- `bun tests/shader-files-browser.ts`: real browser UI imports and uniform files, trust gating, staged GPU Apply, driver compilation failure retention, oversized input rejection, candidate export, adopted-source persistence after closing/reopening and cold reload. [Log](browser.txt).
- `bun tests/shader-browser.ts`: prior runtime shader regression, cancellation/revocation/context restoration and 20 replacement cycles, zero retained programs. [Log](runtime.txt).
- `bun run desktop:build`: passed, 1,060 portable SDK files; existing large-chunk warning remains.
- `xvfb-run -a bun tests/external-code-native.ts`: passed native folder workflow and restart, including Home folder reopening. [Log](native-regression.txt).

[Import dialog](browser-shader-file-import.png) · [failed compilation](browser-shader-file-failure.png). Screenshots are real Chromium/SwiftShader captures, not hardware-performance evidence. The no-sandbox switches belong to the container test harness, not production configuration. Native screenshot evidence from the previous folder checkpoint remains separate.

These checks do not complete map/UV/slot/displacement/HDR/scattering work, archive unification or new-source registration. Physical CEDAR/Windows and independent timing acceptance remain unverified. No new release is implied.
