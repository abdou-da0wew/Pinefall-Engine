# Development setup and commit attribution

Use Bun and authored TypeScript. Run `bun install`, `bun run check` and `bun test tests`; use the relevant native/browser regression suites for changed workflows.

## Tracked commit-msg hook

`bun install` runs the prepare script; alternatively run `bun run hooks:install`. In this repository it sets `core.hooksPath=.githooks` and enables the tracked executable `.githooks/commit-msg`. A source ZIP without its own Git working tree skips setup. Existing non-Pinefall hooksPath configuration is preserved and requires manual integration.

Every ordinary local commit adds exactly one trailer:

```text
Co-authored-by: DiveeAgent <270451464+DiveeAgent@users.noreply.github.com>
```

The hook runs authored TypeScript with Bun and uses Git's trailer parser. Existing co-authors/comments are retained; amendments do not duplicate the requested trailer. Keep Bun on PATH when committing. Tests cover insertion, repeat execution, other co-authors and template comments.

Git hooks are local configuration: each checkout must install them. Git's `--no-verify` can bypass commit-msg hooks, and server-created commits do not run a local hook. This hook does not rewrite historical commits or claim server-side enforcement.

## Documentation policy

[Current status](CURRENT-STATUS.md) is the implementation index. Update user workflows, compatibility, SDK fields, limits, release links and evidence when code changes. Historical release notes, plans and acceptance records remain dated records; preserve their original results rather than rewriting history. Never turn an owner-deferred physical gate into a pass.

## Production bundling memory

Authored code, orchestration and tests remain TypeScript/Bun. Production Vite/Rollup runs through `scripts/build-vite.ts` using the vendored Vite entry under Node with a 1 GiB JS heap limit. Forcing that dependency tool through Bun exceeded the 2 GiB build sandbox after image workers were added; the bounded Node path builds successfully. Install Node alongside Bun for production builds. This tooling choice does not change Electron/game rendering, graphics settings or production sandbox policy.

## Code quality

Prettier is the sole formatter; Biome and Oxlint are linters. Run `bun run format` for the entire supported authored tree. `bun run check` enforces formatting, types and both linters. See [configuration, exclusions and rule policy](CODE-QUALITY.md). Oxfmt is no longer installed.
