# Publishing the prepared 0.5 releases

> Historical release, design or acceptance record: retain the results and limits of its stated checkpoint. For current implementation and downloads, see [current status](CURRENT-STATUS.md).

Target: `abdou-da0wew/Pinefall-Engine`.

- `v0.5.0`: exact historical UI-toolkit commit `6919ac2` and its original verified binaries.
- `v0.5.1`: release-preparation commit carrying the PIF feature and 0.5.1 application version.

Both releases have Linux/Windows binaries, exact source archives, an example and SHA256SUMS. Staging is under `build/publish/v0.5.0` and `build/publish/v0.5.1`.

```sh
bun scripts/publish-releases.ts 0.5.0 0.5.1 --check
# After supplying credentials through the process environment:
bun scripts/publish-releases.ts 0.5.0 0.5.1
```

The publisher requires `GITHUB_TOKEN` or `GH_TOKEN` with Contents read/write on this repository. It never writes credentials to files or git configuration. It checks local hashes/tags before network access, pushes main and both tags without force, creates draft releases, uploads/verifies every asset, then publishes 0.5.0 first and 0.5.1 as latest. Existing published releases are not modified. Failed uploads leave a draft to retry rather than publishing incomplete downloads.

On an authenticated local workstation with GitHub CLI, supply `GH_TOKEN` from `gh auth token` to the process rather than pasting a token into a command or source file. Use a short-lived, repository-scoped credential and revoke it after publication. The workspace must contain the staged binaries; source archives alone do not include build outputs.

Preparation is not publication: consult the publisher receipts or GitHub release pages to confirm actual success.
