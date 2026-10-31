import { cloneScene, parseScene } from "../../runtime/src/schema";
import type { SceneDocument } from "../../runtime/src/schema";
/** Editor-only history. No runtime imports this class. Bounded by both count and bytes. */
export class History {
  private past: string[] = [];
  private future: string[] = [];
  commit(scene: SceneDocument) {
    this.past.push(JSON.stringify(scene));
    while (this.past.length > 20 || this.past.reduce((s, v) => s + v.length, 0) > 16_000_000)
      this.past.shift();
    this.future = [];
  }
  undo(current: SceneDocument) {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(JSON.stringify(current));
    return parseScene(JSON.parse(previous));
  }
  redo(current: SceneDocument) {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(JSON.stringify(current));
    return parseScene(JSON.parse(next));
  }
  reset() {
    this.past = [];
    this.future = [];
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  copy(scene: SceneDocument) {
    return cloneScene(scene);
  }
}
