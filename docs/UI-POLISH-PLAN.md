# UI/UX implementation plan

> Historical release, design or acceptance record: retain the results and limits of its stated checkpoint. For current implementation and downloads, see [current status](CURRENT-STATUS.md).

Date: 2026-11-01. Begins after Plan02 release0.6.0 and owner deferral of external hardware acceptance.

## Scope and order

1. Capture the existing editor at desktop and narrow widths; inspect screenshots before changing layout.
2. Introduce source-owned TypeScript UI primitives: Button variants/sizes (including icon/toggle/link-like actions), Input, Select, Textarea, checkbox-backed Switch, Panel, Dialog, empty/status helpers and shared layout definitions. Use small clsx/class-variance-authority utilities and Radix dropdown accessibility primitives (the shadcn ownership approach), not a wholesale CSS framework or remote CDN.
3. Migrate native authoring controls throughout all editor modules to the shared layer while preserving semantic form types, refs, labels, keyboard shortcuts and existing tests. Keep specialized scene/game UI rendering separate from editor chrome.
4. Add a lightweight home shell that does not instantiate WebGL until a project is opened. Provide recent local project snapshots, explicit open-PIF, blank game and all four templates, preferences and a clearly disabled/TODO plugin marketplace. Never pretend a marketplace backend exists.
5. Store recent projects as bounded integrity-checked PIF snapshots in a separate IndexedDB store, not just names or broken paths. Keep portable PIF backup warnings; recovery/autosave remains separate. Save before returning home; do not silently discard unsaved changes on storage failure.
6. Reduce toolbar crowding with accessible project menus; move import settings into an on-demand dialog. Centralize default panel definitions and spacing/focus/color tokens. Prefer legibility and low GPU cost over blur/animation effects.
7. Capture and inspect after screenshots at desktop/narrow sizes and in Linux Electron. Test home/new/template/recent reload/settings, keyboard dialogs/menus, unavailable-storage handling, editor controls and existing engine/project workflows. Run TypeScript/Oxlint, unit tests and build; publish a tested update with truthful hardware limitations.

## Acceptance

No fake recent entries; reopening verifies archive integrity. All five starter choices work, with the normal blank project retaining the documented playable-character starter. Settings persist with validation and storage failures remain visible. Marketplace is marked coming later and makes no network requests. Home stays usable without a GPU. Editor buttons/inputs/selects/textareas use the same reusable primitives; dialog focus/Escape and menu keyboard navigation remain accessible. No horizontal page overflow at supported desktop widths. Screenshots are evidence, not substitutes for functional tests.

## Implementation outcome — 2026-11-01

Steps 1–7 are implemented and locally validated; details and screenshot links are in [0.6.1 notes](RELEASE-0.6.1.md). Production Linux tests and Windows packaging succeeded. Shared-control ownership is enforced by a source-scanning unit test. Recent-storage failures and concurrent edits are tested explicitly. Publication is the only remaining delivery step: no GitHub credential was retained and the GitHub connector is unsupported in this session. Physical acceptance remains owner-deferred, not passed.
