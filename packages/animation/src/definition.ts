import { ClipClock, type Marker } from "./clock";
export interface ClipBinding {
  subasset: string;
  start: number;
  end: number;
  markers?: Marker[];
}
export interface AnimationState {
  clip: string;
  loop: boolean;
  speed: number;
  blend?: { parameter: string; points: { value: number; clip: string }[] };
}
export interface AnimationTransition {
  from: string;
  to: string;
  parameter: string;
  operator: "eq" | "gt" | "lt";
  value: number | boolean;
  fade: number;
  priority: number;
  minTime: number;
}
export interface AnimatorDefinition {
  version: 1;
  rootMotion?: { node: string };
  initial: string;
  parameters: Record<string, number | boolean>;
  clips: Record<string, ClipBinding>;
  states: Record<string, AnimationState>;
  transitions: AnimationTransition[];
}
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid animator object");
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((k) => !keys.includes(k))) throw Error("Unknown animator field");
}
function text(value: unknown) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 100 ||
    ["__proto__", "prototype", "constructor"].includes(value)
  )
    throw Error("Invalid animator ID");
  return value;
}
function number(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw Error("Invalid animator number");
  return value;
}
export function parseAnimator(input: unknown): AnimatorDefinition {
  const raw = obj(input);
  if (JSON.stringify(raw).length > 64000) throw Error("Animator metadata budget");
  fields(raw, ["version", "initial", "parameters", "clips", "states", "transitions", "rootMotion"]);
  if (raw.version !== 1) throw Error("Unsupported animator version");
  const parameters: AnimatorDefinition["parameters"] = {},
    clips: AnimatorDefinition["clips"] = {},
    states: AnimatorDefinition["states"] = {};
  const p = obj(raw.parameters),
    c = obj(raw.clips),
    s = obj(raw.states);
  if (
    Object.keys(p).length > 32 ||
    !Object.keys(c).length ||
    Object.keys(c).length > 32 ||
    !Object.keys(s).length ||
    Object.keys(s).length > 64 ||
    !Array.isArray(raw.transitions) ||
    raw.transitions.length > 128
  )
    throw Error("Animator definition budget");
  for (const [key, value] of Object.entries(p))
    parameters[text(key)] = typeof value === "boolean" ? value : number(value, -1e6, 1e6);
  for (const [key, value] of Object.entries(c)) {
    text(key);
    const item = obj(value);
    fields(item, ["subasset", "start", "end", "markers"]);
    const start = number(item.start, 0, 86400),
      end = number(item.end, 0, 86400);
    if (end - start < 0.001) throw Error("Empty animation trim");
    const markers = new ClipClock(end - start, { markers: item.markers as Marker[] | undefined })
      .markers;
    clips[key] = {
      subasset: text(item.subasset),
      start,
      end,
      ...(item.markers !== undefined ? { markers: markers.map((m) => ({ ...m })) } : {}),
    };
  }
  for (const [key, value] of Object.entries(s)) {
    text(key);
    const item = obj(value);
    fields(item, ["clip", "loop", "speed", "blend"]);
    const clip = text(item.clip);
    if (!Object.hasOwn(clips, clip) || typeof item.loop !== "boolean")
      throw Error("Invalid state clip/loop");
    const state: AnimationState = { clip, loop: item.loop, speed: number(item.speed, -8, 8) };
    if (item.blend !== undefined) {
      const blend = obj(item.blend);
      fields(blend, ["parameter", "points"]);
      const parameter = text(blend.parameter);
      if (
        typeof parameters[parameter] !== "number" ||
        !Array.isArray(blend.points) ||
        blend.points.length < 2 ||
        blend.points.length > 8
      )
        throw Error("Invalid blend parameter/points");
      let last = -Infinity;
      const seen = new Set<string>();
      const points = blend.points.map((point) => {
        const b = obj(point);
        fields(b, ["value", "clip"]);
        const value = number(b.value, -1e6, 1e6),
          clip = text(b.clip);
        if (value <= last || !Object.hasOwn(clips, clip) || seen.has(clip))
          throw Error("Unsorted/duplicate/missing blend point");
        last = value;
        seen.add(clip);
        return { value, clip };
      });
      state.blend = { parameter, points };
    }
    states[key] = state;
  }
  const initial = text(raw.initial);
  if (!Object.hasOwn(states, initial)) throw Error("Missing initial state");
  const transitions = raw.transitions.map((value) => {
    const t = obj(value);
    fields(t, ["from", "to", "parameter", "operator", "value", "fade", "priority", "minTime"]);
    const from = text(t.from),
      to = text(t.to),
      parameter = text(t.parameter);
    if (
      !Object.hasOwn(states, from) ||
      !Object.hasOwn(states, to) ||
      from === to ||
      !Object.hasOwn(parameters, parameter) ||
      !["eq", "gt", "lt"].includes(String(t.operator)) ||
      typeof t.value !== typeof parameters[parameter] ||
      (typeof t.value === "number" && !Number.isFinite(t.value)) ||
      (typeof t.value === "boolean" && t.operator !== "eq")
    )
      throw Error("Invalid animation transition");
    return {
      from,
      to,
      parameter,
      operator: t.operator as AnimationTransition["operator"],
      value: t.value as number | boolean,
      fade: number(t.fade, 0, 10),
      priority: number(t.priority, -1000, 1000),
      minTime: number(t.minTime, 0, 86400),
    };
  });
  // Ordinary timed cycles are valid. A zero-dwell cycle is not allowed to oscillate at every boundary.
  const active = new Set<string>(),
    done = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) throw Error("Immediate transition cycle");
    if (done.has(id)) return;
    active.add(id);
    for (const t of transitions) if (t.from === id && t.minTime === 0) visit(t.to);
    active.delete(id);
    done.add(id);
  };
  for (const id of Object.keys(states)) visit(id);
  let rootMotion: AnimatorDefinition["rootMotion"];
  if (raw.rootMotion !== undefined) {
    const motion = obj(raw.rootMotion);
    fields(motion, ["node"]);
    rootMotion = { node: text(motion.node) };
  }
  return {
    version: 1,
    initial,
    parameters,
    clips,
    states,
    transitions,
    ...(rootMotion ? { rootMotion } : {}),
  };
}
