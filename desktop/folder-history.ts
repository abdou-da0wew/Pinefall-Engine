import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWrite } from "../packages/project/src/atomic-file";
import type { FolderRecent, RepackSettings } from "../packages/project/src/disk-api";
export class FolderHistory {
  records: FolderRecent[] = [];
  readonly ready: Promise<void>;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private path: string) {
    this.ready = readFile(path, "utf8")
      .then((text) => {
        const parsed: unknown = JSON.parse(text);
        if (!Array.isArray(parsed)) return;
        this.records = parsed
          .filter(
            (v): v is FolderRecent =>
              typeof v?.id === "string" &&
              typeof v.root === "string" &&
              isAbsolute(v.root) &&
              typeof v.opened === "number",
          )
          .slice(0, 20)
          .map((v) => ({
            ...v,
            settings: this.validate(v.settings),
            archive: typeof v.archive === "string" && isAbsolute(v.archive) ? v.archive : undefined,
          }));
      })
      .catch(() => {});
  }
  validate(value: Partial<RepackSettings> = {}): RepackSettings {
    const mode = value.mode ?? "manual",
      intervalSeconds = value.intervalSeconds ?? 120,
      shortcut = value.shortcut ?? "Mod+Shift+S";
    if (
      !["manual", "interval", "per-action"].includes(mode) ||
      !Number.isInteger(intervalSeconds) ||
      intervalSeconds < 10 ||
      intervalSeconds > 86400 ||
      !/^Mod\+(?:Shift\+)?(?:Alt\+)?[a-z0-9]$/i.test(shortcut)
    )
      throw Error("Invalid repack settings");
    const reserved = [
      "Mod+A",
      "Mod+C",
      "Mod+D",
      "Mod+G",
      "Mod+I",
      "Mod+N",
      "Mod+O",
      "Mod+Shift+A",
      "Mod+Shift+H",
      "Mod+Shift+P",
      "Mod+Shift+Z",
      "Mod+V",
      "Mod+X",
      "Mod+Y",
      "Mod+Z",
    ];
    if (reserved.some((key) => key.toLowerCase() === shortcut.toLowerCase()))
      throw Error("Shortcut is reserved by another editor command");
    return { mode, intervalSeconds, shortcut };
  }
  async remember(root: string) {
    await this.ready;
    let record = this.records.find((r) => r.root === root);
    if (!record) record = { id: randomUUID(), root, opened: Date.now(), settings: this.validate() };
    record.opened = Date.now();
    this.records = [record, ...this.records.filter((r) => r.id !== record.id)].slice(0, 20);
    await this.save();
    return record;
  }
  save() {
    const text = JSON.stringify(this.records);
    const task = this.tail.catch(() => {}).then(() => atomicWrite(this.path, text));
    this.tail = task;
    return task;
  }
}
