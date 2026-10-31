import type { UIElement, UIValue } from "./schema";
import type { UIStore } from "./store";
interface Node {
  root: HTMLDivElement;
  control: HTMLElement;
  label?: HTMLElement;
  fill?: HTMLElement;
  kind: string;
  handle: HTMLDivElement;
}
/** Keyed DOM overlay; no React, HTML injection, or renderer dependency. */
export class UIRenderer {
  readonly root = document.createElement("div");
  private stage = document.createElement("div");
  private nodes = new Map<string, Node>();
  private dirty = true;
  private selected = "";
  private lastInteractive = false;
  private unsubscribe: () => void;
  constructor(
    private store: UIStore,
    private canvas: HTMLCanvasElement,
    private select?: (id: string) => void,
    private clearInput?: () => void,
    private edit?: (id: string, patch: Pick<UIElement, "x" | "y" | "width" | "height">) => void,
  ) {
    this.root.dataset.pinefallUi = "";
    Object.assign(this.root.style, {
      position: "fixed",
      overflow: "hidden",
      pointerEvents: "none",
      zIndex: "15",
    });
    Object.assign(this.stage.style, {
      position: "absolute",
      transformOrigin: "top left",
      pointerEvents: "none",
      fontFamily: "system-ui,sans-serif",
    });
    this.root.append(this.stage);
    document.body.append(this.root);
    this.unsubscribe = store.subscribe(() => {
      this.dirty = true;
    });
    this.root.addEventListener("pointerdown", (event) => {
      this.clearInput?.();
      event.stopPropagation();
    });
  }
  private make(e: UIElement): Node {
    const root = document.createElement("div");
    root.dataset.uiId = e.id;
    const control = document.createElement(
      e.kind === "button"
        ? "button"
        : e.kind === "select"
          ? "select"
          : e.kind === "input" || e.kind === "slider" || e.kind === "toggle"
            ? "input"
            : "div",
    );
    const handle = document.createElement("div");
    handle.dataset.uiResize = "";
    handle.title = "Drag to resize; Shift disables 8px snapping";
    Object.assign(handle.style, {
      position: "absolute",
      right: "0",
      bottom: "0",
      width: "16px",
      height: "16px",
      background: "#d8d1a7",
      cursor: "nwse-resize",
      zIndex: "101",
    });
    const node: Node = { root, control, kind: e.kind, handle };
    root.append(handle);
    let drag:
      | { x: number; y: number; original: UIElement; resize: boolean; moved: boolean }
      | undefined;
    root.addEventListener("pointerdown", (event) => {
      if (this.store.interactive || !this.edit || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.clearInput?.();
      const original = this.store.get(e.id);
      if (!original) return;
      if (
        original.parent &&
        this.store.get(original.parent)?.layout !== "absolute" &&
        event.target !== handle
      )
        return;
      drag = {
        x: event.clientX,
        y: event.clientY,
        original,
        resize: event.target === handle,
        moved: false,
      };
      root.setPointerCapture(event.pointerId);
    });
    root.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const rect = this.canvas.getBoundingClientRect(),
        ui = this.store.snapshot(),
        scale = Math.min(rect.width / ui.width, rect.height / ui.height) || 1;
      const dx = (event.clientX - drag.x) / scale,
        dy = (event.clientY - drag.y) / scale;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      drag.moved = true;
      const snap = (v: number, min: number, max: number) =>
          Math.min(max, Math.max(min, event.shiftKey ? v : Math.round(v / 8) * 8)),
        o = drag.original;
      this.store.patch(
        e.id,
        drag.resize
          ? { width: snap(o.width + dx, 16, 4096), height: snap(o.height + dy, 16, 4096) }
          : {
              x: snap(o.x + dx * (o.anchor.includes("right") ? -1 : 1), -4096, 4096),
              y: snap(o.y + dy * (o.anchor.includes("bottom") ? -1 : 1), -4096, 4096),
            },
      );
    });
    const finish = (cancel: boolean) => {
      if (!drag) return;
      const d = drag;
      drag = undefined;
      const current = this.store.get(e.id);
      if (cancel) {
        this.store.patch(e.id, {
          x: d.original.x,
          y: d.original.y,
          width: d.original.width,
          height: d.original.height,
        });
        return;
      }
      if (d.moved && current)
        this.edit?.(e.id, {
          x: current.x,
          y: current.y,
          width: current.width,
          height: current.height,
        });
    };
    root.addEventListener("pointerup", () => finish(false));
    root.addEventListener("pointercancel", () => finish(true));

    root.append(control);
    if (control instanceof HTMLInputElement) {
      control.type = e.kind === "slider" ? "range" : e.kind === "toggle" ? "checkbox" : "text";
      if (e.kind === "input") control.maxLength = 1000;
    }
    if (["slider", "toggle", "progress"].includes(e.kind)) {
      const label = document.createElement("label");
      label.htmlFor = "game-ui-" + e.id;
      Object.assign(label.style, {
        padding: "0",
        border: "0",
        margin: "0",
        background: "none",
        borderRadius: "0",
        color: "inherit",
        font: "inherit",
        lineHeight: "1.2",
        flexShrink: "0",
        cursor: "inherit",
      });
      node.label = label;
      root.prepend(label);
    }
    control.id = "game-ui-" + e.id;
    if (e.kind === "progress") {
      node.fill = document.createElement("div");
      control.append(node.fill);
      control.setAttribute("role", "progressbar");
    }
    control.addEventListener("click", (event) => {
      if (!this.store.interactive) {
        event.preventDefault();
        this.select?.(e.id);
        return;
      }
      if (e.kind === "button") this.store.dispatch(e.id, "click");
    });
    const change = () => {
      if (!this.store.interactive) return;
      let value: UIValue = "";
      if (control instanceof HTMLInputElement)
        value =
          e.kind === "toggle"
            ? control.checked
            : e.kind === "slider"
              ? Number(control.value)
              : control.value;
      else if (control instanceof HTMLSelectElement) value = control.value;
      this.store.dispatch(e.id, "change", value);
    };
    control.addEventListener(
      e.kind === "toggle" || e.kind === "select" ? "change" : "input",
      change,
    );
    control.addEventListener("keydown", (event) => {
      if (
        (event as KeyboardEvent).key === "Enter" &&
        e.kind === "input" &&
        this.store.interactive
      ) {
        event.preventDefault();
        this.store.dispatch(e.id, "submit");
      }
    });
    root.addEventListener("click", (event) => {
      if (!this.store.interactive) {
        event.stopPropagation();
        this.select?.(e.id);
      }
    });
    return node;
  }
  draw() {
    const rect = this.canvas.getBoundingClientRect();
    Object.assign(this.root.style, {
      left: rect.left + "px",
      top: rect.top + "px",
      width: rect.width + "px",
      height: rect.height + "px",
    });
    if (!this.dirty && this.lastInteractive === this.store.interactive) return;
    this.dirty = false;
    this.lastInteractive = this.store.interactive;
    const ui = this.store.snapshot(),
      scale = Math.min(rect.width / ui.width, rect.height / ui.height);
    Object.assign(this.stage.style, {
      width: ui.width + "px",
      height: ui.height + "px",
      left: (rect.width - ui.width * scale) / 2 + "px",
      top: (rect.height - ui.height * scale) / 2 + "px",
      transform: `scale(${scale})`,
    });
    const ids = new Set(ui.elements.map((e) => e.id));
    for (const [id, n] of this.nodes)
      if (!ids.has(id)) {
        n.root.remove();
        this.nodes.delete(id);
      }
    for (const e of ui.elements) {
      let n = this.nodes.get(e.id);
      if (n && n.kind !== e.kind) {
        n.root.remove();
        this.nodes.delete(e.id);
        n = undefined;
      }
      if (!n) {
        n = this.make(e);
        this.nodes.set(e.id, n);
      }
    }
    for (const e of ui.elements) {
      const n = this.nodes.get(e.id)!,
        parent = e.parent ? this.nodes.get(e.parent)?.control : this.stage,
        parentData = ui.elements.find((p) => p.id === e.parent),
        flow = parentData && parentData.layout !== "absolute";
      if (parent && n.root.parentElement !== parent) parent.append(n.root);
      const anchor = e.anchor;
      Object.assign(n.root.style, {
        position: flow ? "relative" : "absolute",
        flexShrink: "0",
        left: flow
          ? ""
          : anchor === "center"
            ? `calc(50% + ${e.x}px)`
            : anchor.includes("right")
              ? ""
              : e.x + "px",
        right: !flow && anchor.includes("right") ? e.x + "px" : "",
        top: flow
          ? ""
          : anchor === "center"
            ? `calc(50% + ${e.y}px)`
            : anchor.includes("bottom")
              ? ""
              : e.y + "px",
        bottom: !flow && anchor.includes("bottom") ? e.y + "px" : "",
        transform: !flow && anchor === "center" ? "translate(-50%,-50%)" : "",
        width: e.width + "px",
        height: e.height + "px",
        display: e.visible ? "flex" : "none",
        flexDirection: "column",
        gap: "5px",
        boxSizing: "border-box",
        overflow: "hidden",
        color: e.style.color,
        background: `rgba(${[1, 3, 5].map((i) => parseInt(e.style.background.slice(i, i + 2), 16)).join(",")},${e.style.backgroundOpacity})`,
        opacity: String(e.style.opacity),
        border: `${e.style.border}px solid ${e.style.accent}`,
        borderRadius: e.style.radius + "px",
        padding: e.style.padding + "px",
        fontSize: e.style.fontSize + "px",
        textAlign: e.style.align,
        zIndex: String(e.z),
        pointerEvents: this.store.interactive
          ? ["button", "toggle", "slider", "input", "select"].includes(e.kind)
            ? "auto"
            : "none"
          : this.select
            ? "auto"
            : "none",
      });
      Object.assign(n.control.style, {
        boxSizing: "border-box",
        width: "100%",
        height: "100%",
        minHeight: "0",
        minWidth: "0",
        font: "inherit",
        lineHeight: "1.2",
        color: "inherit",
        background: "transparent",
        border: "none",
        padding: "0",
        margin: "0",
        textAlign: e.style.align,
        accentColor: e.style.accent,
      });
      n.handle.style.display = !this.store.interactive && e.id === this.selected ? "block" : "none";
      n.handle.style.pointerEvents = "auto";
      n.root.style.outline =
        !this.store.interactive && e.id === this.selected ? "2px dashed #d8d1a7" : "none";
      n.control.style.pointerEvents =
        this.store.interactive && !["panel", "text", "progress"].includes(e.kind) ? "auto" : "none";
      n.control.setAttribute("aria-label", e.text || e.name);
      if (n.label) {
        n.label.textContent = e.text;
        n.label.style.fontSize = Math.min(16, e.style.fontSize) + "px";
      }
      const enabled = this.store.active(e.id) && this.store.interactive;
      if (
        n.control instanceof HTMLButtonElement ||
        n.control instanceof HTMLInputElement ||
        n.control instanceof HTMLSelectElement
      ) {
        n.control.disabled = this.store.interactive && !enabled;
        n.control.tabIndex = this.store.interactive ? 0 : -1;
      }
      if (e.kind === "text" || e.kind === "button") {
        n.control.textContent = e.text;
        n.control.style.whiteSpace = "pre-wrap";
        if (e.kind === "text") {
          n.control.style.display = "flex";
          n.control.style.alignItems = "center";
          n.control.style.justifyContent =
            e.style.align === "center"
              ? "center"
              : e.style.align === "right"
                ? "flex-end"
                : "flex-start";
        }
      }
      if (e.kind === "panel")
        Object.assign(n.control.style, {
          position: "relative",
          overflow: "auto",
          display: e.layout === "absolute" ? "block" : "flex",
          flexDirection: e.layout === "row" ? "row" : "column",
          gap: e.gap + "px",
        });
      if (n.control instanceof HTMLInputElement) {
        if (e.kind === "toggle") {
          n.control.checked = Boolean(e.value);
          n.control.style.width = "22px";
          n.control.style.height = "22px";
        } else if (e.kind === "slider") {
          n.control.min = String(e.min);
          n.control.max = String(e.max);
          n.control.step = String(e.step);
          n.control.value = String(e.value);
        } else if (n.control.value !== String(e.value)) n.control.value = String(e.value);
      }
      if (n.control instanceof HTMLSelectElement) {
        if (
          JSON.stringify([...n.control.options].map((o) => o.value)) !== JSON.stringify(e.options)
        ) {
          n.control.replaceChildren(
            ...e.options.map((text) => {
              const option = document.createElement("option");
              option.value = text;
              option.textContent = text;
              option.style.color = "#14211b";
              return option;
            }),
          );
        }
        n.control.value = String(e.value);
      }
      if (e.kind === "progress" && n.fill) {
        n.control.setAttribute("aria-valuemin", String(e.min));
        n.control.setAttribute("aria-valuemax", String(e.max));
        n.control.setAttribute("aria-valuenow", String(e.value));
        Object.assign(n.control.style, {
          background: "#0005",
          borderRadius: "4px",
          overflow: "hidden",
        });
        Object.assign(n.fill.style, {
          height: "100%",
          width: ((Number(e.value) - e.min) / (e.max - e.min)) * 100 + "%",
          background: e.style.accent,
        });
      }
    }
  }
  setSelection(id: string) {
    this.selected = id;
    this.dirty = true;
  }
  resized() {
    this.dirty = true;
  }
  dispose() {
    this.unsubscribe();
    this.root.remove();
    this.nodes.clear();
  }
}
