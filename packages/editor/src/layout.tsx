import { panelDefaults } from "./preferences";
import { Button, Select } from "./ui";
import { useState, useRef } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { Icon } from "./icons";
interface Layout {
  left: number;
  right: number;
  bottom: number;
  dock: "bottom" | "right";
  focus: boolean;
}
const defaults: Layout = panelDefaults;
function load(): Layout {
  try {
    const d = JSON.parse(localStorage.getItem("pinefall.layout.v1") || "null");
    if (d && Number.isFinite(d.left) && Number.isFinite(d.right) && Number.isFinite(d.bottom))
      return {
        ...defaults,
        left: Math.min(420, Math.max(180, d.left)),
        right: Math.min(440, Math.max(230, d.right)),
        bottom: Math.min(600, Math.max(140, d.bottom)),
        dock: d.dock === "right" ? "right" : "bottom",
      };
  } catch {}
  return defaults;
}
export function useWorkspaceLayout(scripts: boolean) {
  const [dockDragging, setDockDragging] = useState(false);
  const [layout, setLayout] = useState(load),
    [resizing, setResizing] = useState(false);
  const drag = useRef<{
    x: number;
    y: number;
    start: Layout;
    kind: "left" | "right" | "bottom";
  } | null>(null);
  function update(next: Layout) {
    setLayout(next);
    try {
      localStorage.setItem("pinefall.layout.v1", JSON.stringify(next));
    } catch {}
  }
  function start(event: PointerEvent<HTMLElement>, kind: "left" | "right" | "bottom") {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      start: { ...layout, bottom: scripts ? Math.max(layout.bottom, 330) : layout.bottom },
      kind,
    };
    setResizing(true);
  }
  function move(event: PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d) return;
    const next = { ...d.start };
    if (d.kind === "left")
      next.left = Math.max(
        180,
        Math.min(420, window.innerWidth - next.right - 360, d.start.left + event.clientX - d.x),
      );
    if (d.kind === "right")
      next.right = Math.max(
        230,
        Math.min(440, window.innerWidth - next.left - 360, d.start.right - event.clientX + d.x),
      );
    if (d.kind === "bottom")
      next.bottom = Math.max(
        140,
        Math.min(window.innerHeight - 310, d.start.bottom - event.clientY + d.y),
      );
    update(next);
  }
  const toolbar = (
    <div className="layout-toolbar">
      <label>
        <Icon name="columns" />
        <Select
          aria-label="Workspace layout"
          value={layout.focus ? "focus" : layout.dock === "right" ? "right" : "balanced"}
          onChange={(e) => {
            const mode = e.target.value;
            update(
              mode === "balanced"
                ? { ...defaults }
                : {
                    ...layout,
                    focus: mode === "focus",
                    dock: mode === "right" ? "right" : "bottom",
                  },
            );
          }}
        >
          <option value="balanced">Balanced layout</option>
          <option value="right">Shelf docked right</option>
          <option value="focus">Focus viewport</option>
        </Select>
      </label>
      <Button
        aria-label="Reset workspace layout"
        title="Reset panel sizes"
        onClick={() => update({ ...defaults })}
      >
        <Icon name="undo" />
      </Button>
    </div>
  );
  const handles = (["left", "right", "bottom"] as const).map((kind) => (
    // biome-ignore lint/a11y/useSemanticElements: This is a focusable adjustable splitter with arrow-key resizing, not a thematic hr.
    <div
      key={kind}
      role="separator"
      tabIndex={0}
      aria-label={"Resize " + kind + " panel"}
      aria-orientation={kind === "bottom" ? "horizontal" : "vertical"}
      aria-valuenow={layout[kind]}
      aria-valuemin={kind === "bottom" ? 140 : kind === "left" ? 180 : 230}
      aria-valuemax={kind === "bottom" ? 600 : 440}
      className={"resize-handle resize-" + kind}
      onPointerDown={(e) => start(e, kind)}
      onPointerMove={move}
      onPointerUp={() => {
        drag.current = null;
        setResizing(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setResizing(false);
      }}
      onDoubleClick={() => update({ ...layout, [kind]: defaults[kind] })}
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault();
        const delta = (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) * 16;
        const min = kind === "bottom" ? 140 : kind === "left" ? 180 : 230;
        const max =
          kind === "bottom" ? Math.max(140, window.innerHeight - 310) : kind === "left" ? 420 : 440;
        update({ ...layout, [kind]: Math.max(min, Math.min(max, layout[kind] + delta)) });
      }}
    >
      <span />
    </div>
  ));
  const dockGrip = (
    <Button
      className="dock-grip"
      title="Drag shelf to dock"
      aria-label="Drag shelf to dock"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("application/x-pinefall-panel", "shelf");
        event.dataTransfer.effectAllowed = "move";
        setDockDragging(true);
      }}
      onDragEnd={() => setDockDragging(false)}
    >
      <Icon name="rows" />
    </Button>
  );
  const dockTargets = dockDragging ? (
    <div className="dock-targets">
      {(["bottom", "right"] as const).map((dock) => (
        // biome-ignore lint/a11y/useSemanticElements: Drag docking target is not a form fieldset; keyboard docking is provided by the toolbar.
        <div
          role="group"
          aria-label={"Dock shelf " + dock}
          key={dock}
          className={"dock-target dock-target-" + dock}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.dataTransfer.getData("application/x-pinefall-panel") === "shelf")
              update({ ...layout, dock, focus: false });
            setDockDragging(false);
          }}
        >
          <Icon name={dock === "right" ? "columns" : "rows"} size={24} />
          <span>Dock shelf {dock}</span>
        </div>
      ))}
    </div>
  ) : null;
  return {
    dock: layout.dock,
    toolbar,
    handles,
    dockGrip,
    dockTargets,
    style: {
      "--panel-left": layout.left + "px",
      "--panel-right": layout.right + "px",
      "--panel-bottom": (scripts ? Math.max(330, layout.bottom) : layout.bottom) + "px",
    } as CSSProperties,
    className:
      (layout.focus ? " layout-focus" : "") +
      (layout.dock === "right" ? " dock-right" : "") +
      (resizing ? " resizing" : ""),
    toggleFocus: () => update({ ...layout, focus: !layout.focus }),
  };
}
