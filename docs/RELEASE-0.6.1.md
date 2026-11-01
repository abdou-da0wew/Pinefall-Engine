# Pinefall Engine 0.6.1 — Home and shared editor UI

## What changed

- Home screen with real local recent-project archives, search/removal, portable PIF opening, a normal blank game and all four existing 3D templates. The home screen does not create a canvas or WebGL renderer.
- Source-owned, TypeScript shadcn-style components: variant/size-aware buttons, icon/toggle actions, input/select/textarea, switches, panels, empty states, native dialogs, shared asynchronous confirmations and accessible Radix menus. All editor authoring modules use these primitives; game HUD/runtime UI remains independently reusable.
- Less crowded Project and Assets menus, import settings/actions dialogs, a native reimport-review dialog, missing-import issue badges, responsive shelf controls and wrapping asset cards. Shared panel defaults and consistent spacing/focus tokens.
- Validated local preferences: comfortable/compact density, reduced motion and default rendering profile. Rendering-profile defaults apply when entering the editor; the existing in-editor rendering controls remain available.
- Plugins marketplace is explicitly **TODO / later**. There is no fake catalogue, installation or publishing backend.

## Storage and safety

Recents contain integrity-checked PIF snapshots, not invented paths. Limits: 12 projects, 64 MiB total, 16 MiB per archive; no silent eviction. Snapshots update when opening/creating from Home, saving PIF, returning Home, and before editor New/Open/template replacement. Storage failures preserve the active editor. A failed Home save offers Keep editing, PIF backup, or an explicit return without updating the snapshot. Concurrent committed edits prevent stale Home transitions. Old session blobs are pruned to the retained recovery document when entering Home.

Local IndexedDB snapshots are **not backups**: browser/device storage may be cleared. Export a portable `.pif`. Integrity hashing detects corruption, not publisher authenticity. Scripts still require explicit trust; opening a recent archive does not grant it.

## Validation

- TypeScript + Oxlint: 169 files, zero warnings/errors.
- Unit tests: **128 passed, 670 assertions, 24 files**.
- Home: all five starters, no canvas on Home, real recent archive reload, search/no-match, corrupted-archive rejection/removal, real animation/audio PIF reopening, preference persistence, keyboard focus/Escape, 390 px Home and narrow desktop layouts.
- Failure injection: quota/unavailable recent storage retains the current project; restoring storage recovers normally. Concurrent committed edits during a held snapshot worker keep the editor open.
- Browser regressions: workspace/color, UI authoring, PIF, authored audio, import normalization/assets/pending repair, game creation, scripts, storage, animation/root motion and runtime behavior.
- Production **Linux packaged Electron**: Home/settings/recents/layout, PIF binary IPC roundtrip, UI authoring, FBX missing-companion repair and the exported animation/audio workshop.
- Linux AppImage and Windows ZIP built. **Windows execution, physical CEDAR GPU, physical listening/timing and independent acceptance remain owner-deferred/unverified**, not passed. Native automated tests use Xvfb/SwiftShader, not the target hardware.

## Screenshots and dependencies

Actual before/after captures are in [the UI evidence folder](evidence/ui-0.6.1/). [Home](evidence/ui-0.6.1/ui-home-desktop.png), [comfortable native editor](evidence/ui-0.6.1/ui-native-editor-comfortable.png), [narrow native editor](evidence/ui-0.6.1/ui-native-editor-narrow.png), [settings](evidence/ui-0.6.1/ui-settings.png), [before](evidence/ui-0.6.1/ui-before-desktop.png).

Uses clsx2.1.1 (MIT), class-variance-authority0.7.1 (**Apache-2.0**), Radix dropdown2.2.1 (MIT), with bundled dependency notices in `docs/licenses/ui-primitives-notices.txt`. No Tailwind runtime, remote UI CDN or GPU-heavy blur effects were introduced. The initial new editor bundle measured about 176.5 kB gzip versus 139.5 kB previously; this includes the Home features and menus, not only the dependency cost.

## Publication

Builds and the local source/tag are prepared. GitHub publication requires fresh authentication: the earlier credential was deliberately not retained. Do not treat these notes as proof that a remote 0.6.1 release exists. The prepared publisher verifies all five local assets and upload digests before marking a release public.
