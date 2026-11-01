import { useState } from "react";
import { Button, Dialog, Input, EmptyState } from "./ui";
import { invokeCommand, shortcutLabel, type EditorCommand } from "./commands";
export function CommandPalette({
  commands,
  onClose,
  onError,
}: {
  commands: EditorCommand[];
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = commands.filter((command) =>
    (command.label + " " + command.keys.join(" ")).toLowerCase().includes(query.toLowerCase()),
  );
  function execute(command: EditorCommand) {
    if (command.disabled) return;
    onClose();
    invokeCommand(command, onError);
  }
  return (
    <Dialog
      title="Commands and shortcuts"
      description="Search actions. Unavailable actions explain why. Typing and modal dialogs keep their own keys."
      onClose={onClose}
    >
      <Input
        autoFocus
        className="pf-command-search"
        type="search"
        aria-label="Search commands"
        placeholder="Search commands or shortcuts…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            document
              .querySelector<HTMLButtonElement>(".pf-command-list button:not(:disabled)")
              ?.focus();
          }
          if (e.key === "Enter") {
            const command = filtered.find((command) => !command.disabled);
            if (command) {
              e.preventDefault();
              execute(command);
            }
          }
        }}
      />
      <div
        className="pf-command-list"
        aria-label="Available commands"
        onKeyDown={(e) => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
          const buttons = [
            ...e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
          ];
          if (!buttons.length) return;
          e.preventDefault();
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
          ]?.focus();
        }}
      >
        {filtered.map((command) => (
          <div key={command.id}>
            <Button
              disabled={!!command.disabled}
              title={command.disabled}
              onClick={() => execute(command)}
            >
              <span>{command.label}</span>
              <kbd>{shortcutLabel(command.keys)}</kbd>
            </Button>
            {command.disabled && <small>{command.disabled}</small>}
          </div>
        ))}
        {!filtered.length && (
          <EmptyState title="No matching commands">
            Try an action name, such as import, save or frame.
          </EmptyState>
        )}
      </div>
    </Dialog>
  );
}
