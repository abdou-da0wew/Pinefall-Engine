import { test, expect } from "bun:test";
import {
  matchCommand,
  matchesShortcut,
  type KeyStroke,
  type EditorCommand,
} from "../packages/editor/src/commands";
const key = (patch: Partial<KeyStroke> = {}): KeyStroke => ({
  key: "z",
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  repeat: false,
  isComposing: false,
  defaultPrevented: false,
  ...patch,
});
const commands: EditorCommand[] = [
  { id: "undo", label: "Undo", keys: ["Mod+Z"], run: () => {} },
  { id: "save", label: "Save", keys: ["Mod+S"], allowTyping: true, run: () => {} },
  { id: "delete", label: "Delete", keys: ["Delete"], sceneOnly: true, run: () => {} },
];
test("shortcut chords distinguish exact modifiers and support Command on macOS", () => {
  expect(matchesShortcut(key(), "Mod+Z")).toBe(true);
  expect(matchesShortcut(key({ ctrlKey: false, metaKey: true }), "Mod+Z")).toBe(true);
  expect(matchesShortcut(key({ shiftKey: true }), "Mod+Z")).toBe(false);
  expect(matchesShortcut(key({ altKey: true }), "Mod+Z")).toBe(false);
  expect(matchesShortcut(key({ ctrlKey: false }), "Mod+Z")).toBe(false);
  expect(matchesShortcut(key({ shiftKey: true }), "Mod+Shift+Z")).toBe(true);
});
test("typing, modal, repeat, composition and handled events keep their own keys", () => {
  const context = { modal: false, typing: false, scene: true };
  expect(matchCommand(key(), commands, context)?.id).toBe("undo");
  for (const patch of [{ repeat: true }, { isComposing: true }, { defaultPrevented: true }])
    expect(matchCommand(key(patch), commands, context)).toBeUndefined();
  expect(matchCommand(key(), commands, { ...context, modal: true })).toBeUndefined();
  expect(matchCommand(key(), commands, { ...context, typing: true })).toBeUndefined();
  expect(matchCommand(key({ key: "s" }), commands, { ...context, typing: true })?.id).toBe("save");
  expect(
    matchCommand(key({ key: "Delete", ctrlKey: false }), commands, { ...context, scene: false }),
  ).toBeUndefined();
  expect(matchCommand(key({ key: "Delete", ctrlKey: false }), commands, context)?.id).toBe(
    "delete",
  );
});

import { copySceneSelection, pasteSceneSelection } from "../packages/editor/src/clipboard";
import { createGame } from "../packages/project/src";
test("scene clipboard pastes copied definitions after cut and rejects cross-project misuse", () => {
  const scene = createGame("Clipboard"),
    original = scene.entities[0],
    clipboard = copySceneSelection(scene, [original.id]);
  scene.entities = scene.entities.filter((e) => e.id !== original.id);
  const ids = pasteSceneSelection(scene, clipboard);
  expect(ids).toHaveLength(1);
  expect(ids[0]).not.toBe(original.id);
  expect(scene.entities.some((e) => e.id === ids[0])).toBe(true);
  const other = createGame("Other");
  expect(() => pasteSceneSelection(other, clipboard)).toThrow("another project");
  expect(clipboard.scene.entities.some((e) => e.id === original.id)).toBe(true);
});
