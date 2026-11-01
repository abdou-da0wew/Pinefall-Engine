# Editor commands and keyboard behavior

Open **F1** or **Ctrl/⌘+Shift+P** for searchable commands, current availability and disabled reasons. Search is focused immediately; Down enters results, arrows/Home/End navigate, Enter executes, Escape closes. Commands without a dedicated chord (including placing/reimporting a named library model) remain keyboard-accessible through this palette.

| Action                                           | Shortcut                              |
| ------------------------------------------------ | ------------------------------------- |
| New game / Open project                          | Ctrl/⌘+N / Ctrl/⌘+O                   |
| Save/export portable PIF                         | Ctrl/⌘+S or Ctrl/⌘+Shift+S            |
| Import model and companion textures              | Ctrl/⌘+I                              |
| Undo / Redo                                      | Ctrl/⌘+Z / Ctrl/⌘+Shift+Z or Ctrl/⌘+Y |
| Copy / Cut / Paste selection                     | Ctrl/⌘+C / X / V                      |
| Duplicate / Delete selection                     | Ctrl/⌘+D / Delete or Backspace        |
| Select visible scene objects / Group             | Ctrl/⌘+A / Ctrl/⌘+G                   |
| Rename selection / Frame scene selection         | F2 / F                                |
| Translate / Rotate / Scale                       | W / E / R                             |
| Play or Stop / Stop only                         | F5 / Shift+F5                         |
| Pause or Resume                                  | F6                                    |
| Preview actual project in standalone player      | Ctrl/⌘+F5                             |
| Save snapshot and return Home                    | Ctrl/⌘+Shift+H                        |
| Maximize or restore viewport                     | Shift+Space                           |
| Settings / Audio studio                          | Ctrl/⌘+, / Ctrl/⌘+Shift+A             |
| Assets / Console / UI designer / Scripts / Guide | Ctrl/⌘+1 / 2 / 3 / 4 / 5              |

## Focus and safety

- Scene selection commands apply in the viewport, hierarchy or inspector. UI-widget selection uses its own copy/cut/paste/duplicate/delete actions. Hierarchy arrow navigation, range selection and Enter behavior remain local to the tree.
- Object/widget clipboards contain definitions and references, not model bytes. They are **project-local**, not OS clipboard interchange. Use prefab export/import across projects. The UI clipboard survives switching editor panels.
- Typing keeps native text selection, copy/paste and undo. Single-letter transform keys do not intercept text. There is no embedded TypeScript source editor. External IDE shortcuts belong to that IDE. In Pinefall, Save backs up the working folder as PIF8 when attached, otherwise uses the legacy export path; Apply remains explicit.
- Function keys blocked by a text field do not fall through into browser reload. IME composition and key repeats do not issue destructive editor commands repeatedly.
- Modal dialogs and menus keep their keys; closing a dialog with Escape does not also pause gameplay. Opening a modal/text input clears held movement. Gameplay gets W/A/S/D, Space, Shift and R instead of editor transform commands. Escape pauses gameplay outside modal dialogs; native select controls retain their own Escape handling.
- Unsupported/disabled commands do not silently mutate the document. Browser/OS-reserved shortcuts can differ from Electron; the command palette and visible controls are the fallback. Windows execution and physical keyboard-layout acceptance are not claimed from Linux tests.

## Folder repack shortcuts

Project files → Folder archives/repacking configures a persisted custom `Mod+...` chord (default Mod+Shift+S). Reserved editor chords are rejected. It routes through the command system, works from text fields as a save action, and is suppressed by open modal dialogs. Manual, interval and settled-change modes share the serialized native archive worker.
