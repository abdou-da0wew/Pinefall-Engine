export interface EngineEvent {
  time: string;
  type: string;
  message: string;
  data?: Record<string, string | number | boolean>;
}
export class Events {
  private listeners = new Set<(event: EngineEvent) => void>();
  readonly entries: EngineEvent[] = [];
  emit(type: string, message: string, data?: EngineEvent["data"]) {
    const event = { time: new Date().toISOString(), type, message: message.slice(0, 2000), data };
    this.entries.push(event);
    if (this.entries.length > 200) this.entries.shift();
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* diagnostic consumers cannot interrupt engine ownership transitions */
      }
    }
  }
  subscribe(listener: (event: EngineEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  jsonl() {
    return this.entries.map((e) => JSON.stringify(e)).join("\n");
  }
  clear() {
    this.entries.length = 0;
  }
}
