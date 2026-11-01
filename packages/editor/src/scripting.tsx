import { Panel } from "./ui";
import { Button, Input, Select } from "./ui";
import { Icon } from "./icons";
import { useRef, useState } from "react";
import type { Entity, SceneDocument } from "../../runtime/src/schema";
import { compileScript } from "../../scripting/src/compiler";
import { SCRIPT_TEMPLATE, uniqueScriptName } from "../../scripting/src/template";
interface PanelProps {
  scene: SceneDocument;
  disabled: boolean;
  commit: (fn: (scene: SceneDocument) => void) => void;
  exportText: (name: string, text: string) => Promise<void>;
  selectedId: string;
  onSelect: (id: string) => void;
  onOpenFiles: () => void;
  onOpenSource: () => void;
}
export function ScriptPanel({
  scene,
  disabled,
  commit,
  exportText,
  selectedId,
  onSelect,
  onOpenFiles,
  onOpenSource,
}: PanelProps) {
  const asset = scene.scripts?.find((s) => s.id === selectedId);
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  function add(source = SCRIPT_TEMPLATE, name = "CustomScript.ts", updateExisting = false) {
    try {
      compileScript(source, name);
      const matches = scene.scripts?.filter((s) => s.name === name) ?? [];
      if (updateExisting && matches.length > 1)
        throw Error("Ambiguous filename; rename duplicate script assets first");
      const existing = updateExisting ? matches[0] : undefined;
      const id = existing?.id ?? crypto.randomUUID();
      commit((s) => {
        s.scripts ??= [];
        const target = existing && s.scripts.find((a) => a.id === existing.id);
        if (target) target.source = source;
        else s.scripts.push({ id, name, source });
      });
      onSelect(id);
    } catch (error) {
      setMessage(String(error));
    }
  }
  return (
    <div className="script-workbench">
      <div className="script-list">
        <Button
          disabled={disabled}
          onClick={() => {
            add(SCRIPT_TEMPLATE, uniqueScriptName((scene.scripts ?? []).map((s) => s.name)));
            onOpenFiles();
          }}
        >
          <Icon name="plus" /> New TypeScript
        </Button>
        <Button disabled={disabled} onClick={() => input.current?.click()}>
          <Icon name="upload" /> Import .ts
        </Button>
        {scene.scripts?.map((script) => (
          <Button
            key={script.id}
            className={script.id === selectedId ? "active" : ""}
            onClick={() => onSelect(script.id)}
          >
            {script.name}
          </Button>
        ))}
        <Input
          type="file"
          accept=".ts"
          hidden
          ref={input}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (file.size > 64000) {
              setMessage("Script limit: 64 KB");
              return;
            }
            add(await file.text(), file.name, true);
          }}
        />
      </div>
      <div className="script-editor">
        <div className="script-toolbar">
          <Button onClick={onOpenFiles}>Project files & external tools…</Button>
          {asset && (
            <>
              <Button onClick={onOpenSource}>Open source externally</Button>
              <Button onClick={() => void exportText(asset.name, asset.source)}>Export .ts</Button>
              <Button
                disabled={disabled}
                onClick={() => {
                  commit((s) => {
                    s.scripts = s.scripts?.filter((a) => a.id !== asset.id);
                    for (const e of s.entities)
                      e.scripts = e.scripts?.filter((a) => a.script !== asset.id);
                  });
                  onSelect("");
                }}
              >
                Detach and unregister
              </Button>
            </>
          )}
        </div>
        <div className="script-help">
          <h3>{asset?.name ?? "Edit code in your own tools."}</h3>
          <p>
            Source text is edited outside Pinefall, not in an embedded code editor. Desktop project
            folders support external editor launching, watched changes, diagnostics and explicit
            Apply.
          </p>
          <p>
            Nothing is executed merely because a file changes. Resolve diagnostics, Apply, then
            approve scripts before Play. Unregistering a script does not delete its disk file.
          </p>
          <code>start · fixedUpdate · update · trigger · dispose</code>
        </div>
        <div className="script-message" role="status">
          {message ||
            "Open Project files to configure VS Code, VSCodium, Visual Studio or a text editor."}
        </div>
      </div>
    </div>
  );
}
export function ScriptAttachments({
  entity,
  scene,
  disabled,
  patch,
  onOpen,
}: {
  entity: Entity;
  scene: SceneDocument;
  disabled: boolean;
  patch: (fn: (entity: Entity) => void) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <Panel>
      <h3>
        <Icon name="code" /> Custom scripts
      </h3>
      <Select
        aria-label="Attach script"
        value=""
        disabled={disabled}
        onChange={(event) => {
          const script = event.target.value;
          if (script)
            patch((e) => {
              e.scripts ??= [];
              e.scripts.push({ id: crypto.randomUUID(), script, enabled: true, props: {} });
            });
        }}
      >
        <option value="">Attach a script…</option>
        {scene.scripts?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      {entity.scripts?.map((a) => (
        <div className="script-attachment" key={a.id}>
          <div>
            <label>
              <Input
                aria-label={"Enable script " + a.id}
                type="checkbox"
                disabled={disabled}
                checked={a.enabled}
                onChange={(event) =>
                  patch((e) => {
                    const target = e.scripts?.find((t) => t.id === a.id);
                    if (target) target.enabled = event.target.checked;
                  })
                }
              />
              {scene.scripts?.find((s) => s.id === a.script)?.name}
            </label>
            <Button onClick={() => onOpen(a.script)}>Open source files</Button>
            <Button
              disabled={disabled}
              onClick={() =>
                patch((e) => {
                  e.scripts = e.scripts?.filter((t) => t.id !== a.id);
                })
              }
            >
              Detach
            </Button>
          </div>
          <Button onClick={() => onOpen("")}>Edit properties in scene.json externally</Button>
        </div>
      ))}
      <small className="hint">
        Add scripts without replacing built-in behavior. Source and JSON overrides are editable in
        project files.
      </small>
      <Button className="wide-button" onClick={() => onOpen("")}>
        Open project files
      </Button>
    </Panel>
  );
}
