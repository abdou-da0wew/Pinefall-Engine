import { ClipClock, type MarkerEvent } from "./clock";
import { parseAnimator, type AnimatorDefinition } from "./definition";
export interface PoseSample {
  clip: string;
  time: number;
  weight: number;
}
export interface GraphFrame {
  samples: PoseSample[];
  fadeToken: number;
  alpha: number;
}
export interface MotionInterval {
  before: number;
  after: number;
  frame: GraphFrame;
  gain: number;
}
export interface GraphEvent extends MarkerEvent {
  state: string;
  clip: string;
}
/** Single bounded state decision per fixed boundary; no expression evaluation or renderer dependencies. */
export class AnimationGraph {
  readonly definition: AnimatorDefinition;
  private values: Record<string, number | boolean>;
  private current: string;
  private clock: ClipClock;
  private token = 0;
  private elapsed = 0;
  private fadeElapsed = 0;
  private fadeDuration = 0;
  private playbackSpeed: number | undefined;
  setPlaybackSpeed(speed: number) {
    if (!Number.isFinite(speed) || Math.abs(speed) > 8)
      throw Error("Animation speed outside -8..8");
    this.playbackSpeed = speed;
    this.clock.speed = speed;
  }
  constructor(definition: AnimatorDefinition) {
    this.definition = parseAnimator(definition);
    this.values = { ...this.definition.parameters };
    this.current = this.definition.initial;
    this.clock = this.makeClock();
  }
  private makeClock() {
    const state = this.definition.states[this.current],
      clip = this.definition.clips[state.clip];
    return new ClipClock(clip.end - clip.start, {
      loop: state.loop,
      speed: this.playbackSpeed ?? state.speed,
      markers: clip.markers,
      activation: ++this.token,
    });
  }
  get state() {
    return this.current;
  }
  get activation() {
    return this.token;
  }
  get paused() {
    return this.clock.paused;
  }
  set paused(value: boolean) {
    this.clock.paused = value;
  }
  get snapshot() {
    return {
      state: this.current,
      activation: this.token,
      normalized: this.clock.normalized,
      time:
        this.definition.clips[this.definition.states[this.current].clip].start + this.clock.time,
      speed: this.clock.speed,
      elapsed: this.elapsed,
      parameters: { ...this.values },
      fade: this.fadeDuration ? Math.min(1, this.fadeElapsed / this.fadeDuration) : 1,
      fault: this.clock.fault,
    };
  }
  setParameter(name: string, value: number | boolean) {
    if (
      !Object.hasOwn(this.values, name) ||
      typeof value !== typeof this.values[name] ||
      (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > 1e6))
    )
      throw Error("Invalid animator parameter");
    this.values[name] = value;
  }
  play(state: string, fade = 0) {
    if (
      !Object.hasOwn(this.definition.states, state) ||
      !Number.isFinite(fade) ||
      fade < 0 ||
      fade > 10
    )
      throw Error("Invalid animation state/fade");
    this.current = state;
    this.clock = this.makeClock();
    this.elapsed = 0;
    this.fadeDuration = fade;
    this.fadeElapsed = 0;
  }
  reset() {
    this.playbackSpeed = undefined;
    this.values = { ...this.definition.parameters };
    this.play(this.definition.initial);
  }
  seek(normalized: number) {
    if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1)
      throw Error("Invalid normalized seek");
    this.clock.seek(normalized * this.clock.duration);
    this.fadeDuration = 0;
  }
  private weights() {
    const state = this.definition.states[this.current];
    if (!state.blend) return [{ clip: state.clip, weight: 1 }];
    const { points, parameter } = state.blend,
      value = this.values[parameter] as number;
    if (value <= points[0].value) return [{ clip: points[0].clip, weight: 1 }];
    if (value >= points.at(-1)!.value) return [{ clip: points.at(-1)!.clip, weight: 1 }];
    const index = points.findIndex((p) => p.value >= value),
      a = points[index - 1],
      b = points[index],
      weight = (value - a.value) / (b.value - a.value);
    return [
      { clip: a.clip, weight: 1 - weight },
      { clip: b.clip, weight },
    ];
  }
  frame(): GraphFrame {
    return {
      fadeToken: this.token,
      alpha: this.fadeDuration ? Math.min(1, this.fadeElapsed / this.fadeDuration) : 1,
      samples: this.weights().map(({ clip, weight }) => {
        const binding = this.definition.clips[clip];
        return {
          clip,
          weight,
          time: binding.start + this.clock.normalized * (binding.end - binding.start),
        };
      }),
    };
  }
  advance(dt: number): { events: GraphEvent[]; overflow: boolean; motion?: MotionInterval } {
    if (!Number.isFinite(dt) || dt < 0 || dt > 3600) throw Error("Invalid graph delta");
    if (this.clock.paused) return { events: [], overflow: false };
    const candidates = this.definition.transitions
      .map((t, index) => ({ t, index }))
      .filter(
        ({ t }) =>
          t.from === this.current &&
          this.elapsed + 1e-10 >= t.minTime &&
          (t.operator === "eq"
            ? this.values[t.parameter] === t.value
            : t.operator === "gt"
              ? (this.values[t.parameter] as number) > (t.value as number)
              : (this.values[t.parameter] as number) < (t.value as number)),
      )
      .sort((a, b) => b.t.priority - a.t.priority || a.index - b.index);
    if (candidates.length) this.play(candidates[0].t.to, candidates[0].t.fade);
    const duration = this.weights().reduce(
      (sum, { clip, weight }) =>
        sum + weight * (this.definition.clips[clip].end - this.definition.clips[clip].start),
      0,
    );
    const cadence = this.clock.duration / duration;
    this.clock.speed = this.playbackSpeed ?? this.definition.states[this.current].speed;
    const before = this.clock.cursor,
      frame = this.frame();
    const result = this.clock.advance(dt, cadence);
    if (!result.overflow) {
      this.elapsed += dt;
      this.fadeElapsed += dt;
    }
    return {
      overflow: result.overflow,
      ...(!result.overflow
        ? {
            motion: {
              before,
              after: this.clock.cursor,
              frame,
              gain: (frame.alpha + this.frame().alpha) / 2,
            },
          }
        : {}),
      events: result.events.map((event) => ({
        ...event,
        state: this.current,
        clip: this.definition.states[this.current].clip,
      })),
    };
  }
}
