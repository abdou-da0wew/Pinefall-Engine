import { useState } from "react";
import { Icon } from "./icons";
import { ColorPicker } from "./color-picker";
import { createUIElement, emptyUI } from "../../ui/src/schema";
import { sampleHUD, UI_DEMO_SCRIPT } from "../../ui/src/presets";
import type { UIElement, UIKind, UIStyle } from "../../ui/src/schema";
import type { SceneDocument } from "../../runtime/src/schema";
import { entity } from "../../runtime/src/schema";
export function UIEditor({
  scene,
  selected,
  onSelect,
  commit,
  disabled,
}: {
  scene: SceneDocument;
  selected: string;
  onSelect: (id: string) => void;
  commit: (fn: (s: SceneDocument) => void) => void;
  disabled: boolean;
}) {
  const [kind, setKind] = useState<UIKind>("text");
  const ui = scene.ui || emptyUI(),
    chosen = ui.elements.find((e) => e.id === selected);
  function patch(fn: (e: UIElement) => void) {
    commit((s) => {
      const e = s.ui?.elements.find((e) => e.id === selected);
      if (e) fn(e);
    });
  }
  function add() {
    let i = 1;
    while (ui.elements.some((e) => e.id === kind + "-" + i)) i++;
    const e = createUIElement(kind, kind + "-" + i, kind + " " + i);
    if (chosen?.kind === "panel") e.parent = chosen.id;
    commit((s) => {
      s.ui ??= emptyUI();
      s.ui.elements.push(e);
    });
    onSelect(e.id);
  }
  function remove() {
    commit((s) => {
      if (!s.ui) return;
      const ids = new Set([selected]);
      let more = true;
      while (more) {
        more = false;
        for (const e of s.ui.elements)
          if (e.parent && ids.has(e.parent) && !ids.has(e.id)) {
            ids.add(e.id);
            more = true;
          }
      }
      s.ui.elements = s.ui.elements.filter((e) => !ids.has(e.id));
    });
    onSelect("");
  }
  function sample() {
    if (
      ui.elements.length &&
      !window.confirm(
        "Replace the current HUD? Undo restores it. Existing UI scripts may reference replaced elements.",
      )
    )
      return;
    commit((s) => {
      const previous = new Set(
        s.entities
          .filter((e) => e.tag === "ui-demo-controller")
          .flatMap((e) => (e.scripts || []).map((a) => a.script)),
      );
      s.entities = s.entities.filter((e) => e.tag !== "ui-demo-controller");
      s.scripts = s.scripts?.filter(
        (script) =>
          !previous.has(script.id) ||
          s.entities.some((e) => e.scripts?.some((a) => a.script === script.id)),
      );
      s.ui = sampleHUD();
      s.scripts ??= [];
      const id = crypto.randomUUID();
      s.scripts.push({
        id,
        name: "HUDController-" + id.slice(0, 8) + ".ts",
        source: UI_DEMO_SCRIPT,
      });
      const controller = entity("HUD Controller");
      delete controller.mesh;
      controller.tag = "ui-demo-controller";
      controller.scripts = [{ id: crypto.randomUUID(), script: id, enabled: true, props: {} }];
      s.entities.push(controller);
    });
    onSelect("hud-panel");
  }
  function number(
    label: string,
    value: number,
    change: (n: number) => void,
    min = -4096,
    max = 4096,
    step = 1,
  ) {
    return (
      <label className="ui-field">
        {label}
        <input
          aria-label={"UI " + label}
          key={selected + label + value}
          type="number"
          defaultValue={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onBlur={(event) => {
            const n = Number(event.target.value);
            if (Number.isFinite(n) && n >= min && n <= max) change(n);
            else event.target.value = String(value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </label>
    );
  }
  function depth(e: UIElement) {
    let level = 0,
      p = e.parent;
    while (p) {
      level++;
      p = ui.elements.find((e) => e.id === p)?.parent;
    }
    return level;
  }
  return (
    <div className="ui-editor">
      <aside>
        <div className="ui-add">
          <select
            aria-label="UI element type"
            value={kind}
            disabled={disabled}
            onChange={(e) => setKind(e.target.value as UIKind)}
          >
            {(
              [
                "panel",
                "text",
                "button",
                "progress",
                "toggle",
                "slider",
                "input",
                "select",
              ] as const
            ).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <button aria-label="Add UI element" disabled={disabled} onClick={add}>
            <Icon name="plus" />
          </button>
        </div>
        <button className="wide-button" disabled={disabled} onClick={sample}>
          Add sample HUD + script
        </button>
        <div className="ui-tree">
          {ui.elements.map((e) => (
            <button
              key={e.id}
              className={selected === e.id ? "active" : ""}
              style={{ paddingLeft: 8 + depth(e) * 12 }}
              onClick={() => onSelect(e.id)}
            >
              <Icon name={e.kind === "panel" ? "folder" : "assets"} />
              {e.name}
            </button>
          ))}
        </div>
      </aside>
      <div className="ui-properties">
        <div className="ui-designer-heading">
          <strong>
            <Icon name="assets" /> GAME UI DESIGNER
          </strong>
          <span>
            {ui.width} × {ui.height} design canvas · click a widget in the viewport to select
          </span>
          <button
            disabled={disabled}
            onClick={() =>
              commit((s) => {
                s.ui ??= emptyUI();
                s.ui.width = 1280;
                s.ui.height = 720;
              })
            }
          >
            Reset canvas size
          </button>
        </div>
        <div className="ui-fields">
          {number(
            "Canvas width",
            ui.width,
            (n) =>
              commit((s) => {
                s.ui ??= emptyUI();
                s.ui.width = n;
              }),
            320,
            4096,
          )}
          {number(
            "Canvas height",
            ui.height,
            (n) =>
              commit((s) => {
                s.ui ??= emptyUI();
                s.ui.height = n;
              }),
            180,
            2160,
          )}
        </div>
        {chosen ? (
          <>
            <div className="ui-fields">
              <label className="ui-field">
                Name
                <input
                  aria-label="UI Name"
                  key={chosen.id + chosen.name}
                  defaultValue={chosen.name}
                  disabled={disabled}
                  onBlur={(event) =>
                    patch((e) => {
                      e.name = event.target.value;
                    })
                  }
                />
              </label>
              <label className="ui-field">
                SDK ID<code>{chosen.id}</code>
              </label>
              <button
                disabled={disabled}
                onClick={() => {
                  const e = structuredClone(chosen);
                  e.id = crypto.randomUUID();
                  e.name += " copy";
                  e.x += 16;
                  e.y += 16;
                  commit((s) => s.ui!.elements.push(e));
                  onSelect(e.id);
                }}
              >
                <Icon name="copy" />
                Duplicate
              </button>
              <button disabled={disabled} onClick={remove}>
                <Icon name="trash" />
                Delete subtree
              </button>
            </div>
            <div className="ui-fields">
              <label className="ui-field">
                Parent panel
                <select
                  aria-label="UI Parent"
                  value={chosen.parent || ""}
                  disabled={disabled}
                  onChange={(event) =>
                    patch((e) => {
                      e.parent = event.target.value || undefined;
                    })
                  }
                >
                  <option value="">Canvas root</option>
                  {ui.elements
                    .filter((e) => e.kind === "panel" && e.id !== chosen.id)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="ui-field">
                Anchor
                <select
                  aria-label="UI Anchor"
                  value={chosen.anchor}
                  disabled={disabled}
                  onChange={(event) =>
                    patch((e) => {
                      e.anchor = event.target.value as UIElement["anchor"];
                    })
                  }
                >
                  {["top-left", "top-right", "bottom-left", "bottom-right", "center"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              {number("X", chosen.x, (n) =>
                patch((e) => {
                  e.x = n;
                }),
              )}
              {number("Y", chosen.y, (n) =>
                patch((e) => {
                  e.y = n;
                }),
              )}
              {number(
                "Width",
                chosen.width,
                (n) =>
                  patch((e) => {
                    e.width = n;
                  }),
                16,
                4096,
              )}
              {number(
                "Height",
                chosen.height,
                (n) =>
                  patch((e) => {
                    e.height = n;
                  }),
                16,
                4096,
              )}
            </div>
            <div className="ui-fields">
              <label className="ui-field ui-text">
                Text / label
                <input
                  aria-label="UI Text"
                  key={chosen.id + chosen.text}
                  defaultValue={chosen.text}
                  disabled={disabled}
                  onBlur={(event) =>
                    patch((e) => {
                      e.text = event.target.value;
                    })
                  }
                />
              </label>
              <label className="ui-field">
                Action name
                <input
                  aria-label="UI Action"
                  key={chosen.id + chosen.action}
                  defaultValue={chosen.action}
                  disabled={disabled}
                  onBlur={(event) =>
                    patch((e) => {
                      e.action = event.target.value;
                    })
                  }
                />
              </label>
              {(["visible", "enabled"] as const).map((k) => (
                <label key={k}>
                  <input
                    aria-label={"UI " + k}
                    type="checkbox"
                    checked={chosen[k]}
                    disabled={disabled}
                    onChange={(event) =>
                      patch((e) => {
                        e[k] = event.target.checked;
                      })
                    }
                  />
                  {k}
                </label>
              ))}
            </div>
            <div className="ui-fields">
              {(["background", "color", "accent"] as const).map((k) => (
                <label key={k} className="ui-field">
                  {k}
                  <ColorPicker
                    label={"UI " + k}
                    value={chosen.style[k]}
                    disabled={disabled}
                    onChange={(color) =>
                      patch((e) => {
                        e.style[k] = color;
                      })
                    }
                  />
                </label>
              ))}
              {number(
                "Background opacity",
                chosen.style.backgroundOpacity,
                (n) =>
                  patch((e) => {
                    e.style.backgroundOpacity = n;
                  }),
                0,
                1,
                0.05,
              )}
              {number(
                "Font size",
                chosen.style.fontSize,
                (n) =>
                  patch((e) => {
                    e.style.fontSize = n;
                  }),
                8,
                96,
              )}
              {number(
                "Opacity",
                chosen.style.opacity,
                (n) =>
                  patch((e) => {
                    e.style.opacity = n;
                  }),
                0,
                1,
                0.05,
              )}
              {number(
                "Radius",
                chosen.style.radius,
                (n) =>
                  patch((e) => {
                    e.style.radius = n;
                  }),
                0,
                100,
              )}
              {number(
                "Padding",
                chosen.style.padding,
                (n) =>
                  patch((e) => {
                    e.style.padding = n;
                  }),
                0,
                100,
              )}
              {number(
                "Border",
                chosen.style.border,
                (n) =>
                  patch((e) => {
                    e.style.border = n;
                  }),
                0,
                20,
              )}
              {number(
                "Z order",
                chosen.z,
                (n) =>
                  patch((e) => {
                    e.z = n;
                  }),
                -100,
                100,
              )}
              <label className="ui-field">
                Align
                <select
                  aria-label="UI Align"
                  value={chosen.style.align}
                  disabled={disabled}
                  onChange={(event) =>
                    patch((e) => {
                      e.style.align = event.target.value as UIStyle["align"];
                    })
                  }
                >
                  {["left", "center", "right"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            {["progress", "slider"].includes(chosen.kind) && (
              <div className="ui-fields">
                {number(
                  "Value",
                  Number(chosen.value),
                  (n) =>
                    patch((e) => {
                      e.value = n;
                    }),
                  chosen.min,
                  chosen.max,
                )}
                {number(
                  "Minimum",
                  chosen.min,
                  (n) =>
                    patch((e) => {
                      e.min = n;
                    }),
                  -1000000,
                  1000000,
                )}
                {number(
                  "Maximum",
                  chosen.max,
                  (n) =>
                    patch((e) => {
                      e.max = n;
                    }),
                  -1000000,
                  1000000,
                )}
                {number(
                  "Step",
                  chosen.step,
                  (n) =>
                    patch((e) => {
                      e.step = n;
                    }),
                  0.001,
                  1000000,
                  0.1,
                )}
              </div>
            )}
            {chosen.kind === "toggle" && (
              <label>
                <input
                  aria-label="UI Checked"
                  disabled={disabled}
                  type="checkbox"
                  checked={Boolean(chosen.value)}
                  onChange={(event) =>
                    patch((e) => {
                      e.value = event.target.checked;
                    })
                  }
                />
                Checked by default
              </label>
            )}
            {["input", "select"].includes(chosen.kind) && (
              <label className="ui-field">
                Initial value
                <input
                  aria-label="UI Initial value"
                  key={chosen.id + String(chosen.value)}
                  disabled={disabled}
                  defaultValue={String(chosen.value)}
                  onBlur={(event) =>
                    patch((e) => {
                      e.value = event.target.value;
                    })
                  }
                />
              </label>
            )}
            {chosen.kind === "select" && (
              <label className="ui-field">
                Options, one per line
                <textarea
                  aria-label="UI Options"
                  disabled={disabled}
                  key={chosen.id + chosen.options.join("|")}
                  defaultValue={chosen.options.join("\n")}
                  onBlur={(event) =>
                    patch((e) => {
                      e.options = event.target.value.split("\n").filter(Boolean);
                      if (!e.options.includes(String(e.value))) e.value = e.options[0] || "";
                    })
                  }
                />
              </label>
            )}
            {chosen.kind === "panel" && (
              <div className="ui-fields">
                <label className="ui-field">
                  Child layout
                  <select
                    aria-label="UI Layout"
                    disabled={disabled}
                    value={chosen.layout}
                    onChange={(event) =>
                      patch((e) => {
                        e.layout = event.target.value as UIElement["layout"];
                      })
                    }
                  >
                    {["absolute", "row", "column"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                {number(
                  "Gap",
                  chosen.gap,
                  (n) =>
                    patch((e) => {
                      e.gap = n;
                    }),
                  0,
                  200,
                )}
              </div>
            )}
            <p className="ui-note">
              Scripts: ctx.ui.setText('{chosen.id}', 'Hello'); ctx.ui.on('{chosen.id}', 'click',
              handler). UI changes during Play are temporary. For click events use buttons;
              sliders/toggles/inputs/selects emit change. Row/column panels ignore child X/Y/anchor
              offsets.
            </p>
          </>
        ) : (
          <div className="ui-empty">
            <h3>Build the interface your game needs.</h3>
            <p>
              Add a widget, or insert a sample HUD and its controller script. Layouts are saved in
              scene JSON and work in standalone exports. Review and approve scripts before Play.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
