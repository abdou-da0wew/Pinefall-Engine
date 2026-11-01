# Commands, disk-backed assets and usable authoring

> Historical release, design or acceptance record: retain the results and limits of its stated checkpoint. For current implementation and downloads, see [current status](CURRENT-STATUS.md).

Written before implementation, 2026-11-01. Baseline: published 0.6.1.

## Problems to fix

The current BlobStore retains every admitted source/artifact as Uint8Array in a session Map and reserves 64 MiB for it. Workers reduce parsing stalls but do not fix residence or repeated copies. Project worker messages copy the complete inventory. Audio catalogs also retain encoded sources. Editor keyboard handling only covers project save/open globally; hierarchy shortcuts are local and advertised transform/history commands are inconsistent. Native application menu shortcuts must not conflict with editor ownership.

## Execution order

1. Audit consumers and write this plan. Preserve portable, integrity-checked XZ PIF and separate reusable runtime/editor packages.
2. Introduce asynchronous persistent blob access in browser/Electron IndexedDB (real disk-backed origin storage, not localStorage or a permanent byte Map). Node/CLI memory mode stays explicit and bounded. Successful admission means durable transaction completion; unavailable/quota/corrupt storage must fail visibly rather than silently falling back to RAM. Reads verify content hashes. Keep a lightweight reference/size index only. No unbounded resident byte cache.
3. Convert runtime model reads, source reimport, export, audio inspection and project worker transport to asynchronous reads. Persist sources/artifacts on admission; send only document references to PIF workers when disk storage is shared. Worker/native memory modes keep compatibility. Treat export/import parsing buffers as temporary bounded work, not permanent residency. Retain transactional checkpoint and previous-checkpoint recovery behavior; do not delete undo/source refs while still needed.
4. Stop retaining a second encoded-audio inventory in disk mode. Load sources for validation/decoding when necessary, release transient bytes, and retain only active runtime resources. Keep existing audio scheduling/trust/persistent-music behavior.
5. Introduce a typed command registry and dispatcher: explicit chords, descriptions, availability and editable/modal/play focus rules. Support undo/redo, duplicate/delete/group/select/frame, W/E/R transform modes, project new/open/save/import, Play/Stop/Pause, panel navigation and command discovery. Do not steal typing, code-editor commands, UI navigation, gameplay keys or native dialog Escape. Prevent repeat-triggered destructive operations. Share actions with visible controls rather than create divergent shortcut implementations.
6. Add a searchable command palette/help with disabled reasons and visible disk/runtime memory diagnostics. Make import → reusable library asset → place → edit → save/reopen → playable export the acceptance workflow. Fix defects found rather than claiming production-engine parity.
7. Validate unit, real-browser storage/failure injection, keyboard focus/modal/play interactions, worker cancellation, imports/reimports, PIF and native Linux Electron. Check storage bytes versus resident bytes, not just counters relabeled as disk. Inspect screenshots. Update release notes/version and publish only after verified regression checks.

## Boundaries and acceptance honesty

Zero RAM is impossible: active geometry, textures, audio, physics and parsing need memory. Sources and unused artifacts must not stay resident merely because they belong to a project. IndexedDB is browser/Electron-managed disk, not yet a user-selected project-folder filesystem. It is evictable: PIF backups remain essential. Existing per-file/decoder bounds must not simply be raised without validating peak memory and export limits. Physical CEDAR and Windows execution remain owner-deferred, not passed. This work improves concrete authoring workflows; it is not a claim to finish every possible game-engine feature.

## Implementation outcome — 0.6.2

Implemented command discovery/routing, scene/UI clipboards, typing/repeat/modal/gameplay rules, disk-backed sources/artifacts, asynchronous verified reads, reference worker/checkpoint transport, lazy library models and removal of redundant encoded-audio residence. Actual-project Player snapshot and return are tested in browser/packaged Linux. Canceled import intent resets safely. Boot errors appear on Home.

See [release evidence](RELEASE-0.6.2.md), [shortcuts](SHORTCUTS.md) and [storage architecture/limits](DISK-ASSETS.md). Physical hardware/listening and Windows execution remain unverified. Native project folders, larger import budgets and total-process memory profiling are not claimed complete. Publication status is separate from implementation.
