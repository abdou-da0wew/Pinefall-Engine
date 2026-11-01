# Pinefall Engine 0.7.1 — formatting and lint cleanup

This maintenance release retains 0.7.0 graphics and folder workflows and standardizes repository-wide code quality.

- **Prettier 3.9.10 is the sole formatter.** Oxfmt and its configuration are removed. Prettier was run across all supported authored source, tests, scripts, examples, HTML/CSS, configuration and Markdown—not only changed files.
- **Biome 2.6.4 and Oxlint are linters.** Biome formatter and assist are explicitly disabled. Both linter commands reject warnings; `bun run check` enforces Prettier, TypeScript and both linters. Existing build/CI check calls enforce the same gates.
- Safe lint fixes and reviewed cleanup address implicit variable types, callback returns, dead counters, lazy-initialization expressions, control labels/roles, HTML language/button types and generic font fallbacks. Existing theme, rendering behavior and production sandbox policy are retained.
- Prettier editor defaults and EditorConfig are supplied. [Code-quality documentation](CODE-QUALITY.md) explains commands, rule exceptions and exclusions; no blanket source-directory suppression is used.
- Generated bundles, dependencies, binary assets, Bun's lockfile, third-party licenses and historical evidence data are not rewritten as authored code. Evidence README files are formatted.

Validation includes the formatting gate, TypeScript, both linters, unit tests, production build and representative browser/native regressions. The source archive contains the pinned dependency lockfile and configuration. Linux AppImage, Windows ZIP, source ZIP, these notes and SHA256SUMS form the release set; publication verifies each upload before making it public.

Windows execution and physical CEDAR/listening/independent acceptance remain owner-deferred, not passed. Desktop artifacts are unsigned. These lint/format results do not constitute hardware-performance certification.

## Recorded verification

- Prettier check, TypeScript and both linters pass without warnings/errors.
- 169 unit tests / 1,036 assertions pass.
- Browser commands, color picker, workspace/hierarchy and animator suites pass, as does the full graphics/shader completion matrix.
- Production desktop build, Linux AppImage and Windows ZIP packaging pass.
- Packaged Linux graphics authoring, GLB/FBX import, portable-to-folder/raw-PIF roundtrip and missing-companion recovery pass.
- Frozen-lockfile installation passes.
