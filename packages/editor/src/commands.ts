export interface EditorCommand {
  id: string;
  label: string;
  keys: string[];
  disabled?: string;
  allowTyping?: boolean;
  sceneOnly?: boolean;
  run: () => unknown;
}
export interface KeyStroke {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  defaultPrevented: boolean;
}
export function matchesShortcut(event: KeyStroke, chord: string) {
  const parts = chord.toLowerCase().split("+"),
    key = parts.at(-1);
  return (
    event.key.toLowerCase() === key &&
    (event.ctrlKey || event.metaKey) === parts.includes("mod") &&
    event.shiftKey === parts.includes("shift") &&
    event.altKey === parts.includes("alt")
  );
}
export function matchCommand(
  event: KeyStroke,
  commands: EditorCommand[],
  context: { modal: boolean; typing: boolean; scene: boolean },
) {
  if (event.defaultPrevented || event.isComposing || event.repeat || context.modal)
    return undefined;
  return commands.find(
    (command) =>
      command.keys.some((chord) => matchesShortcut(event, chord)) &&
      (!context.typing || command.allowTyping) &&
      (!command.sceneOnly || context.scene),
  );
}
export function invokeCommand(command: EditorCommand, onError: (message: string) => void) {
  if (command.disabled) return;
  try {
    void Promise.resolve(command.run()).catch((error) => onError(String(error)));
  } catch (error) {
    onError(String(error));
  }
}
export function dispatchShortcut(
  event: KeyboardEvent,
  commands: EditorCommand[],
  onError: (message: string) => void,
) {
  const target = event.target instanceof Element ? event.target : null;
  const typing = !!target?.closest(
    'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]',
  );
  const modal = !!document.querySelector('dialog[open],[role="dialog"],[role="menu"]');
  const command = matchCommand(event, commands, {
    modal,
    typing,
    scene:
      target === document.body ||
      target === document.documentElement ||
      !!target?.closest(".viewport,.hierarchy,.inspector,.ui-editor"),
  });
  if (!command) {
    const reserved = commands.find((command) =>
      command.keys.some((chord) => matchesShortcut(event, chord)),
    );
    if (
      reserved &&
      !modal &&
      !event.defaultPrevented &&
      !event.isComposing &&
      ((event.repeat && (!typing || reserved.allowTyping)) || (typing && /^F\d+$/.test(event.key)))
    ) {
      event.preventDefault();
      if (!event.repeat) onError("Leave the text field before using " + reserved.label);
    }
    return;
  }
  event.preventDefault();
  if (command.disabled) {
    onError(command.disabled);
    return;
  }
  // Commit blur-based inspector fields before taking a saved project snapshot.
  if (typing && target instanceof HTMLElement && target.tagName !== "TEXTAREA") target.blur();
  invokeCommand(command, onError);
}
export const shortcutLabel = (keys: string[]) =>
  keys.map((key) => key.replaceAll("Mod", "Ctrl/⌘")).join(" / ");
