import { parseUI, emptyUI } from "./schema";
import type { UIDocument, UIElement, UIValue, UIStyle } from "./schema";
export type UIEventType = "click" | "change" | "submit";
export interface UIEvent {
  id: string;
  type: UIEventType;
  value: UIValue;
  action: string;
}
export interface UIAPI {
  get(id: string): UIElement | undefined;
  find(name: string): UIElement | undefined;
  snapshot(): UIDocument;
  create(element: UIElement): UIElement;
  remove(id: string): void;
  patch(
    id: string,
    patch: Partial<Omit<UIElement, "id" | "kind" | "style">> & { style?: Partial<UIStyle> },
  ): void;
  setText(id: string, text: string): void;
  setValue(id: string, value: UIValue): void;
  setVisible(id: string, visible: boolean): void;
  show(id: string): void;
  hide(id: string): void;
  setEnabled(id: string, enabled: boolean): void;
  setStyle(id: string, style: Partial<UIStyle>): void;
  on(id: string, type: UIEventType, listener: (event: UIEvent) => void): () => void;
  onAction(action: string, listener: (event: UIEvent) => void): () => void;
}
export class UIStore implements UIAPI {
  private document: UIDocument = emptyUI();
  private listeners = new Set<{
    id?: string;
    type?: UIEventType;
    action?: string;
    fn: (e: UIEvent) => void;
  }>();
  private observers = new Set<() => void>();
  revision = 0;
  interactive = false;
  constructor(private error: (error: unknown) => void = () => {}) {}
  load(ui?: UIDocument) {
    this.document = parseUI(ui || emptyUI());
    this.listeners.clear();
    this.interactive = false;
    this.changed();
  }
  private changed() {
    this.revision++;
    for (const fn of this.observers) {
      try {
        fn();
      } catch (error) {
        this.error(error);
      }
    }
  }
  subscribe(fn: () => void) {
    this.observers.add(fn);
    return () => {
      this.observers.delete(fn);
    };
  }
  get(id: string) {
    const e = this.document.elements.find((e) => e.id === id);
    return e ? structuredClone(e) : undefined;
  }
  find(name: string) {
    const e = this.document.elements.find((e) => e.name === name);
    return e ? structuredClone(e) : undefined;
  }
  snapshot() {
    return structuredClone(this.document);
  }
  create(element: UIElement) {
    const next = parseUI({ ...this.document, elements: [...this.document.elements, element] });
    this.document = next;
    this.changed();
    return this.get(element.id)!;
  }
  remove(id: string) {
    const ids = new Set([id]);
    let added = true;
    while (added) {
      added = false;
      for (const e of this.document.elements)
        if (e.parent && ids.has(e.parent) && !ids.has(e.id)) {
          ids.add(e.id);
          added = true;
        }
    }
    this.document.elements = this.document.elements.filter((e) => !ids.has(e.id));
    for (const l of this.listeners) if (l.id && ids.has(l.id)) this.listeners.delete(l);
    this.changed();
  }
  patch(
    id: string,
    patch: Partial<Omit<UIElement, "id" | "kind" | "style">> & { style?: Partial<UIStyle> },
  ) {
    const old = this.document.elements.find((e) => e.id === id);
    if (!old) throw Error("UI element not found: " + id);
    const next = {
      ...old,
      ...patch,
      id: old.id,
      kind: old.kind,
      style: { ...old.style, ...patch.style },
    };
    if (JSON.stringify(old) === JSON.stringify(next)) return;
    const checked = parseUI({
      ...this.document,
      elements: this.document.elements.map((e) => (e.id === id ? next : e)),
    });
    this.document = checked;
    this.changed();
  }
  setText(id: string, text: string) {
    this.patch(id, { text });
  }
  setValue(id: string, value: UIValue) {
    this.patch(id, { value });
  }
  show(id: string) {
    this.setVisible(id, true);
  }
  hide(id: string) {
    this.setVisible(id, false);
  }
  setVisible(id: string, visible: boolean) {
    this.patch(id, { visible });
  }
  setEnabled(id: string, enabled: boolean) {
    this.patch(id, { enabled });
  }
  setStyle(id: string, style: Partial<UIStyle>) {
    this.patch(id, { style });
  }
  on(id: string, type: UIEventType, fn: (e: UIEvent) => void) {
    if (!this.get(id)) throw Error("UI element not found: " + id);
    const record = { id, type, fn };
    this.listeners.add(record);
    return () => {
      this.listeners.delete(record);
    };
  }
  onAction(action: string, fn: (e: UIEvent) => void) {
    const record = { action, fn };
    this.listeners.add(record);
    return () => {
      this.listeners.delete(record);
    };
  }
  active(id: string) {
    let e = this.document.elements.find((e) => e.id === id);
    while (e) {
      if (!e.visible || !e.enabled) return false;
      e = e.parent ? this.document.elements.find((n) => n.id === e!.parent) : undefined;
    }
    return !!this.get(id);
  }
  dispatch(id: string, type: UIEventType, value?: UIValue) {
    const e = this.get(id);
    if (!this.interactive || !e || !this.active(id)) return false;
    if (
      (type === "click" && e.kind !== "button") ||
      (type === "submit" && e.kind !== "input") ||
      (type === "change" && !["slider", "toggle", "input", "select"].includes(e.kind))
    )
      return false;
    if (type === "change" && value !== undefined) this.setValue(id, value);
    const event: UIEvent = {
      id,
      type,
      value: type === "change" && value !== undefined ? value : e.value,
      action: e.action,
    };
    for (const listener of [...this.listeners])
      if (
        (listener.id === id && listener.type === type) ||
        (listener.action && listener.action === event.action)
      ) {
        try {
          listener.fn(event);
        } catch (error) {
          this.listeners.delete(listener);
          this.error(error);
        }
      }
    return true;
  }
  dispose() {
    this.listeners.clear();
    this.observers.clear();
    this.interactive = false;
  }
}
