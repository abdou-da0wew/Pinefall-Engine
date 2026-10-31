import { Icon } from "./icons";
import { useRef, useState } from "react";
import type { Entity, SceneDocument } from "../../runtime/src/schema";
import { compileScript } from "../../scripting/src/compiler";
import { SCRIPT_TEMPLATE } from "../../scripting/src/template";
interface PanelProps {
  scene: SceneDocument;
  disabled: boolean;
  commit: (fn: (scene: SceneDocument) => void) => void;
  exportText: (name: string, text: string) => Promise<void>;
  selectedId: string;
  onSelect: (id: string) => void;
}
export function ScriptPanel({
  scene,
  disabled,
  commit,
  exportText,
  selectedId,
  onSelect,
}: PanelProps) {
  const asset = scene.scripts?.find((s) => s.id === selectedId);
  const [draft, setDraft] = useState(asset?.source || ""),
    [name, setName] = useState(asset?.name || ""),
    [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  function add(source = SCRIPT_TEMPLATE, name = "CustomScript.ts") {
    const id = crypto.randomUUID();
    commit((s) => {
      s.scripts ??= [];
      s.scripts.push({ id, name, source });
    });
    onSelect(id);
  }
  function check() {
    try {
      compileScript(draft, name);
      setMessage("Syntax OK. TypeScript types are erased, not checked. Nothing executed.");
      return true;
    } catch (e) {
      setMessage(String(e));
      return false;
    }
  }
  function save() {
    if (!asset || !check()) return;
    commit((s) => {
      const target = s.scripts?.find((a) => a.id === asset.id);
      if (target) {
        target.source = draft;
        target.name = name;
      }
    });
    setMessage("Saved. Stop and Play again to instantiate the new code.");
  }
  return (
    <div className="script-workbench">
      <div className="script-list">
        <button disabled={disabled} onClick={() => add()}>
          <Icon name="plus" /> New TypeScript
        </button>
        <button disabled={disabled} onClick={() => input.current?.click()}>
          <Icon name="upload" /> Import .ts
        </button>
        {scene.scripts?.map((s) => (
          <button
            className={s.id === selectedId ? "active" : ""}
            key={s.id}
            onClick={() => onSelect(s.id)}
          >
            {s.name}
          </button>
        ))}
        <input
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
            add(await file.text(), file.name);
          }}
        />
      </div>
      <div className="script-editor">
        {asset ? (
          <>
            <div className="script-toolbar">
              <input
                aria-label="Script filename"
                value={name}
                disabled={disabled}
                onChange={(e) => setName(e.target.value)}
              />
              <button disabled={disabled} onClick={check}>
                Check syntax
              </button>
              <button disabled={disabled} onClick={save}>
                Save script
              </button>
              <button onClick={() => void exportText(name, draft)}>Export .ts</button>
              <button
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
                Delete
              </button>
            </div>
            <textarea
              aria-label="TypeScript source"
              spellCheck={false}
              disabled={disabled}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
            />
          </>
        ) : (
          <div className="script-help">
            <h3>Make the game behave your way.</h3>
            <p>
              Create/import a TypeScript module, save it, select an object and attach it in the
              Inspector. Multiple scripts can run alongside built-in controls.
            </p>
            <code>import &#123; Script, Vector3, MathUtils &#125; from '@pinefall/sdk';</code>
            <p>start · fixedUpdate · update · trigger · dispose</p>
            <p>
              Unsaved text is not included in scene exports. Scripts are trusted code, not
              sandboxed. Never enable code from an unknown source.
            </p>
          </div>
        )}
        <div className="script-message" role="status">
          {message ||
            "Ctrl/⌘ + Enter saves · edit while stopped · approve trusted scripts before Play"}
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
  const [message, setMessage] = useState("");
  return (
    <section>
      <h3>
        <Icon name="code" /> Custom scripts
      </h3>
      <select
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
      </select>
      {entity.scripts?.map((a) => (
        <div className="script-attachment" key={a.id}>
          <div>
            <label>
              <input
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
            <button onClick={() => onOpen(a.script)}>Edit code</button>
            <button
              disabled={disabled}
              onClick={() =>
                patch((e) => {
                  e.scripts = e.scripts?.filter((t) => t.id !== a.id);
                })
              }
            >
              Detach
            </button>
          </div>
          <label>
            Properties (JSON overrides)
            <textarea
              aria-label={"Script properties " + a.id}
              key={a.id + JSON.stringify(a.props)}
              disabled={disabled}
              defaultValue={JSON.stringify(a.props, null, 2)}
              onBlur={(event) => {
                try {
                  const props = JSON.parse(event.target.value);
                  if (!props || typeof props !== "object" || Array.isArray(props))
                    throw Error("Properties must be a JSON object");
                  patch((e) => {
                    const target = e.scripts?.find((t) => t.id === a.id);
                    if (target) target.props = props;
                  });
                  setMessage("");
                } catch (e) {
                  setMessage(String(e));
                }
              }}
            />
          </label>
        </div>
      ))}
      <small className="hint">
        {message ||
          "Add scripts without replacing the built-in behavior. Each attachment gets its own properties, state and lifecycle."}
      </small>
      <button className="wide-button" onClick={() => onOpen("")}>
        Open script editor
      </button>
    </section>
  );
}
