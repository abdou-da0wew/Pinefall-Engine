import * as T from "three";
import { ClipClock, type ClockOptions } from "./clock";
/** Presentation adapter only. A mixer/binding set belongs to this instance, never the shared clips. */
export class ThreeClipPlayer {
  private readonly mixer: T.AnimationMixer;
  private readonly clips: Map<string, T.AnimationClip>;
  private action?: T.AnimationAction;
  private clock?: ClipClock;
  private activation = 0;
  private dead = false;
  constructor(
    readonly root: T.Object3D,
    clips: ReadonlyMap<string, T.AnimationClip>,
  ) {
    if (clips.size > 128) throw Error("Clip catalog budget");
    this.clips = new Map(clips);
    this.mixer = new T.AnimationMixer(root);
  }
  get stats() {
    return { actions: this.mixer.stats.actions.inUse, bindings: this.mixer.stats.bindings.inUse };
  }
  get cursor() {
    return this.clock;
  }
  get disposed() {
    return this.dead;
  }
  play(id: string, options: Omit<ClockOptions, "activation"> = {}) {
    this.assertAlive();
    const clip = this.clips.get(id);
    if (!clip) throw Error("Missing animation clip: " + id);
    const clock = new ClipClock(clip.duration, { ...options, activation: this.activation + 1 });
    this.mixer.stopAllAction();
    this.activation++;
    this.clock = clock;
    this.action = this.mixer.clipAction(clip);
    this.action.reset();
    this.action.setLoop(T.LoopOnce, 1);
    this.action.clampWhenFinished = true;
    this.action.play();
    this.action.paused = true;
    this.sample();
  }
  private sample() {
    if (!this.clock || !this.action) return;
    this.action.time = this.clock.time;
    this.action.enabled = true;
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);
  }
  advance(dt: number) {
    this.assertAlive();
    if (!this.clock) return { events: [], overflow: false };
    const result = this.clock.advance(dt);
    this.sample();
    return result;
  }
  seek(time: number) {
    this.assertAlive();
    if (!this.clock) throw Error("No active clip");
    this.clock.seek(time);
    this.sample();
  }
  stop() {
    this.assertAlive();
    this.mixer.stopAllAction();
    this.clock = undefined;
    this.action = undefined;
    this.root.updateMatrixWorld(true);
  }
  dispose() {
    if (this.dead) return;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.clips.clear();
    this.clock = undefined;
    this.action = undefined;
    this.dead = true;
  }
  private assertAlive() {
    if (this.dead) throw Error("Animation player disposed");
  }
}
