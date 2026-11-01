# Workspace, hierarchy and Phosphor icons

## Icons

Editor UI icons now use **Phosphor Icons** (`@phosphor-icons/react`), bundled as local SVG components. No CDN, icon font or network request is needed. This replaces the old text-symbol icons in the scene hierarchy, toolbars, transform tools, inspector, asset shelf and script panels. See THIRD_PARTY.md for attribution.

## Resizing and docking

- Drag the separator between hierarchy/viewport or viewport/inspector to change widths.
- Drag the shelf's top separator to change its height. The Scripts workbench retains a taller minimum; source editing itself is external.
- Double-click a separator to reset that dimension; focus it with Tab and use arrow keys for keyboard resizing.
- Drag the shelf's small layout grip onto a highlighted **bottom** or **right** docking target.
- The top **Workspace layout** selector provides Balanced, Shelf docked right, and Focus viewport modes.
- The viewport maximize icon toggles focus/restore. **Reset panel sizes** restores defaults.
- Panel sizes and shelf docking are stored locally. Focus mode is temporary and does not hide panels after restart.
- Screen-size bounds keep a usable viewport. Very narrow windows hide the inspector; desktop-size windows are recommended.

These are resizable docked panels and two shelf tilings, not an unrestricted floating-window or multi-monitor editor. The Electron application's outer window still resizes normally through the OS.

## Collections and transform parents

The list shown in the original screenshot is now a real scene tree, not a flat list.

**Collections** are organizational folders. They can contain objects and nested collections without changing transforms, collider placement or gameplay. These organize **scene instances**, not the underlying imported-file library database.

1. Select objects, using Ctrl/⌘ for multiple selection or Shift for a range.
2. Click **New collection** (folder-plus) or press Ctrl/⌘+G while the hierarchy is focused.
3. Type the collection name and press Enter.
4. Drag more objects/collections onto it. Drop onto the scene root, or use **Move selection to root**, to take items out.
5. Click the caret or double-click a collection to collapse/expand. Expand all/Collapse all are in the hierarchy toolbar.

**Object parenting** is different: drop an object onto another object to establish a transform parent. World position/rotation/scale are preserved on the move. Existing child subtrees follow their parent. Physics bodies must remain transform roots in this engine; drop them in a collection instead. Parent changes that would require sheared or out-of-range transforms are rejected rather than silently deforming the object. Cycles are rejected.

Collection metadata and parent relationships roundtrip in scene JSON; prefab imports remap their IDs. Collections do not add runtime draw calls or bodies. Collapsed branches are stored locally per scene name. Search reveals matching nodes and their ancestors even inside collapsed branches without destroying the saved collapse state.

## Navigation and quality-of-life

With focus inside the hierarchy:

| Key/action                 | Result                                                                   |
| -------------------------- | ------------------------------------------------------------------------ |
| Up / Down                  | Select adjacent visible row                                              |
| Left / Right               | Collapse, select parent / expand                                         |
| Enter                      | Toggle collection or frame object                                        |
| Ctrl/⌘+click               | Toggle an item in the selection                                          |
| Shift+click / Shift+arrows | Range selection                                                          |
| Ctrl/⌘+A                   | Select visible rows                                                      |
| F2                         | Rename selected item                                                     |
| F                          | Frame the selection's object or collection bounds                        |
| Ctrl/⌘+G                   | Group selection in a new collection                                      |
| Ctrl/⌘+D                   | Duplicate selected subtrees, remapping internal references               |
| Delete                     | Delete selected subtrees (confirmation when multiple items are affected) |

Hover rows for rename/visibility controls. Hidden objects keep their row, dimmed. All scene mutations participate in the existing undo/redo history. Ordinary scene edits now preserve the orbit camera instead of snapping to the initial view. Each script attachment/entity retains its normal serialized data during duplication.

Micro-interactions include subtle hover/press feedback, drag/drop target highlighting, clear focus rings, hover actions and separator highlights. `prefers-reduced-motion` disables transitions and press movement. Actual GPU rendering still depends on the user's graphics stack.

## Validation

28 unit/physics/headless/scripting/hierarchy tests (82 assertions) pass. New hierarchy tests cover organizational grouping, scene roundtrip, world-position preservation, invalid cycles/physics parenting, subtree duplication and deletion. Browser workspace tests cover SVG icons, grouping/renaming, collapse and search, drag/drop, resizing, drag docking, focus/restore, keyboard duplication, rejected physics parenting and persistence. Existing scripting, creation and starter browser smoke tests pass. Browser rendering validation uses SwiftShader, not CEDAR hardware.

The 0.4 Linux package also passed the existing script import/trust/physics-spawn/Stop restoration test under Xvfb/SwiftShader. Windows packages were generated but not executed. Physical CEDAR GPU support remains unverified. See [0.4 release notes](RELEASE-0.4.0.md) for distribution and validation details.

### Unreleased: Home working folders

Desktop Home lists persisted working folders separately from browser snapshots. Opening a folder validates its registered sources and verifies hashes before handing the session to the editor. It does not grant script or shader trust. Invalid registered sources must be fixed externally before opening succeeds; raw PIF backups still preserve unregistered drafts.

### Unreleased: unified native opening and registration

Native Open project and Mod+O now open both legacy PIF1–7 and raw PIF8 through an empty-folder extraction workflow. Home validates before entering the editor; in-editor opening presents diagnostics and requires Apply. Project files → Register existing authored source adds externally created TS, GLSL, shader metadata and material JSON without replacing source files or granting execution trust. See [PIF conversion limits](PIF.md#legacy-to-folder-conversion-limits) and [source registration](SCRIPTING.md#registering-files-created-outside-pinefall).
