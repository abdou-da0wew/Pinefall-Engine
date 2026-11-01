# Pinefall Engine 0.6.2 — Commands, disk-backed assets and real project preview

> Historical release, design or acceptance record: retain the results and limits of its stated checkpoint. For current implementation and downloads, see [current status](CURRENT-STATUS.md).

## Keyboard and authoring

Typed command routing and a searchable **F1 / Ctrl+Shift+P** palette cover project actions, importing, history, scene/UI copy-cut-paste, duplication/deletion, grouping, rename/frame, W/E/R tools, Play/Stop/Pause, panels, settings and named model placement/reimport. Text, IME, repeat, menu/modal and gameplay scopes are respected. Script-editor Ctrl+S saves the script. Native dialog autofocus now reaches the intended field; UI clipboards survive panel switches. [Shortcut reference](SHORTCUTS.md).

## Assets on disk

Browser/Electron encoded sources and cooked artifacts live in an integrity-checked IndexedDB store rather than the old permanent session Uint8Array Map. Import workers persist references; PIF workers share disk storage rather than copying an inventory from the renderer. Default checkpoint/cache records are reference-only. Unused library models are decoded only when placed; there is no second encoded-audio catalog in RAM. Runtime resources retain explicit bounds, including a small idle decoded-model cache.

The disk store fails visibly on unavailable/quota/corrupt storage, bounds metadata as well as bytes, and protects other windows/workers during reclamation. A 48 MB storage test measured approximately 94 KiB post-GC JS heap growth with zero permanent source-byte cache. That is not total process RAM. [Architecture, async API migration and limitations](DISK-ASSETS.md).

## Useful workflow fixes

- **Player now previews the actual authored project**, not a default starter. It uses a verified snapshot in the same window, works in Electron despite popup restrictions, and returns to the same authored scene. Script trust is still explicit.
- Model library import → cold reopen → place on demand is covered by an end-to-end test.
- Canceling a model chooser clears reimport/repair intent; a later new import or drop cannot accidentally reuse that target.
- Retry appears after a real failed load, not briefly during a normal asynchronous load transition.
- PIF writer metadata now identifies 0.6.2 rather than a stale hardcoded version; a regression test prevents writer/package version drift.
- Recovery/snapshot failures are visible on Home. Existing standalone web export remains available through `bun scripts/game.ts export-web game.pif output-folder` after `bun run build`; this release does not add a GUI game packager.

## Validation

- TypeScript/Oxlint: 178 files, zero warnings/errors.
- **132 unit tests / 693 assertions / 25 files.**
- Browser: keyboard/typing/modal/gameplay/UI contexts, script save/trust, disk persistence/heap/corruption/quota/cross-window safety, lazy model loading, current-project Player return, model import/reimport/normalization/pending repair, PIF, recovery storage, Home, game creation/export, UI authoring, runtime behavior, animation/root motion, authored audio and streaming audio. Existing 100-cycle stress checks remain passing.
- Production Linux Electron checks cover commands, actual-project Player handoff, Home, native PIF save/open, textured FBX repair, authored-audio dialogs and the exported animation/audio workshop.
- Linux AppImage and Windows ZIP built. Windows execution, physical CEDAR GPU, physical audio/listening/timing and independent acceptance remain owner-deferred/unverified—not passed.

## Boundaries

This is not zero-RAM rendering, a user-selected native project-folder backend, unlimited-size asset importing or a finished production engine. Existing low-end import/export limits remain documented in DISK-ASSETS.md. No sandbox weakening or new heavy UI framework was added. PIF remains real XZ with separate definitions/resources/scripts; format selection through v6 is unchanged. Source snapshots remain local and evictable, so export backups.

Actual captures are in `docs/evidence/commands-disk-0.6.2/`. Release assets include Linux, Windows, source, the original workshop and SHA-256 checksums.
