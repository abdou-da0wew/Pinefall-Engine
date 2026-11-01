# Shader checkpoint — not complete Plan 03 acceptance

Version: 0.6.3-dev.1. Browser and Linux Electron tests use SwiftShader in the container. They are not CEDAR/Windows hardware evidence.

- `native-plan03-shader-recovery.png`: built Electron shader source/uniform editor, consent, and failed-compile diagnostics; previous valid material is retained.
- `plan03-shader-standalone.png`: built standalone procedural shader reference after explicit consent.
- `plan03-shader-native.txt`: native compile/apply, source and uniform draft persistence, failed apply, Home checkpoint, cold reopen and consent reset.
- `plan03-shader-units.txt`: 141 tests, 754 assertions, no failures.

GPU fixture `bun tests/shader-browser.ts` passed default denial, failed-link last-valid retention, authored line diagnostics, stable uniform/material updates, cancellation, queued trust revocation, context restoration, rendered skin+morph/morph/instanced-world-position pixels and 20 replacement cycles. Shader programs after trust disable: 0. General graphics fixture passed 100 post/resize cycles, exact grey patch [128,128,128,255], reservations released, forced LDR fallback, material instance isolation, shadow budget and context restoration.

Reproduce native UI after `bun run desktop:build`: `TEST_NATIVE=1 xvfb-run -a bun tests/plan03-editor.ts`. Production exports require the built dist and reference export directories described by `tests/plan03-export.ts`; use TEST_SHADERS=1 for shader-reference-web.

Pending: texture/UV/channel-packing/slot authoring, PMREM environment ownership, independent shadow update policy/fitted frusta, broader post failure/fixture gates and actual depth-aware scattering. Custom shaders are bounded unlit fragments, not custom lit/depth/sampler shaders. No completed Plan 03 release is claimed.
