# Formatting and linting

Prettier is the **only formatter**. Biome and Oxlint are independent linters. All authored implementation remains TypeScript; adopting Biome does not introduce authored JavaScript.

## Commands

- `bun run format` — run Prettier over the entire repository, not just changed files.
- `bun run format:check` — verify formatting without writing.
- `bun run lint:oxlint` — existing strict Oxlint correctness/TypeScript/React checks, warnings rejected.
- `bun run lint:biome` — Biome recommended lint preset with the documented exceptions below, warnings rejected.
- `bun run lint` — run both linters.
- `bun run lint:fix` — apply ordinary linter fixes; does not enable Biome formatting or unsafe fixes. Follow with `bun run format` and review the diff.
- `bun run check` — formatting check, TypeScript typecheck, then both linters.
- `bun test tests` — regression suite.

The build and desktop CI already call `bun run check`, so unformatted source or either linter failing blocks those paths. Dependency versions and the Bun lockfile are committed. `bun install --frozen-lockfile` reproduces the tools. Prettier editor settings are in `.vscode/`; `.editorconfig` sets consistent LF/UTF-8/two-space defaults.

## Ownership and exclusions

`.prettierrc.json` owns style (100-column print width, double quotes, semicolons, trailing commas, LF). The former Oxfmt package/configuration is removed. `biome.json` explicitly disables **formatter** and **assist**, so Biome cannot compete with Prettier or organize imports as a side effect of a check.

Dependencies, generated bundles, desktop staging, caches, build artifacts and coverage are excluded. Bun owns its generated lockfile. Third-party license texts and recorded evidence JSON/text are preserved byte-for-byte. Authored source, tests, scripts, examples, HTML/CSS, configurations and Markdown—including evidence README files—are included wherever Prettier supports the file type. Binary files and languages unsupported by Prettier are not falsely reported as formatted.

## Lint policy

Oxlint retains correctness rules, the TypeScript/React plugins, explicit-any/ts-comment restrictions and unused-variable checks. Biome starts with `preset: recommended`, not an empty preset. Shared `Input`, `Select`, `Textarea`, `Switch`, `Button` and `ColorPicker` components are recognized as labelable controls.

Explicit Biome exceptions preserve established source conventions rather than rewrite behavior during formatting:

- Non-null assertions remain permitted for validated schemas and fixture invariants; TypeScript still checks the asserted types.
- Template-literal preference is disabled; string concatenation is not a correctness defect.
- CSS descending-specificity/important-style preferences are disabled to retain the existing deliberate theme cascade.
- Biome exhaustive-dependency inference is disabled for the imperative renderer/editor lifecycle, whose subscription ownership and revision-driven callbacks use refs. This is not a claim that hook dependency inference proves runtime correctness; lifecycle behavior is covered by regression tests.

Narrow inline suppressions explain delegated tree keyboard handling, adjustable splitters/non-form ARIA groups, stateless duplicate diagnostic rows and the bounded streaming decoder loop. Accessibility fixes add missing roles/language/button types and font fallbacks without changing the normal rendered theme. Dead counters, implicit variable types, callback returns and lazy-initialization expressions are cleaned up. No blanket source-directory suppression is used.
