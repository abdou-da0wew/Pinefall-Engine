import { test, expect } from "bun:test";
import { ClipClock } from "../packages/animation/src/clock";
import { ThreeClipPlayer } from "../packages/animation/src/three-player";
import { VoiceSystem, type VoiceBackend, type VoiceControl } from "../packages/audio/src/voices";
import { NullAudioBackend } from "../packages/audio/src/null";
import { inspectWave } from "../packages/audio/src/wav";
import { sineWave } from "./audio-fixtures";
import { Group, AnimationClip, NumberKeyframeTrack } from "three";
test("marker intervals, zero boundaries and authored tie ordering are deterministic", () => {
  const clock = new ClipClock(1, {
    activation: 7,
    markers: [
      { id: "entry", time: 0, kind: "gameplay", entry: true },
      { id: "loop", time: 0, kind: "cosmetic", repeat: true },
      { id: "hit", time: 0.5, kind: "gameplay" },
      { id: "sound", time: 0.5, kind: "cosmetic" },
    ],
  });
  expect(clock.advance(0).events.map((e) => e.id)).toEqual(["entry"]);
  expect(clock.advance(0).events).toEqual([]);
  const events = clock.advance(2.5).events;
  expect(events.map((e) => [e.id, e.loop])).toEqual([
    ["hit", 0],
    ["sound", 0],
    ["loop", 1],
    ["hit", 1],
    ["sound", 1],
    ["loop", 2],
    ["hit", 2],
    ["sound", 2],
  ]);
  expect(events.every((e) => e.activation === 7)).toBe(true);
  expect(clock.time).toBe(0.5);
  expect(clock.advance(0).events).toEqual([]);
});
test("seek and reverse sampling invent no markers; once ends at final pose", () => {
  const c = new ClipClock(1, {
    loop: false,
    markers: [
      { id: "entry", time: 0, kind: "gameplay", entry: true },
      { id: "end", time: 1, kind: "gameplay" },
    ],
  });
  c.seek(0.75);
  expect(c.advance(0.25).events.map((e) => e.id)).toEqual(["end"]);
  expect(c.advance(10).events).toEqual([]);
  expect(c.time).toBe(1);
  c.speed = -1;
  expect(c.advance(0.5).events).toEqual([]);
  expect(c.time).toBe(0.5);
  expect(() => c.seek(NaN)).toThrow();
  expect(() => c.advance(Infinity)).toThrow();
  expect(() => new ClipClock(0)).toThrow();
});
test("marker overflow pauses transactionally without allocating millions of deliveries", () => {
  const clock = new ClipClock(0.01, { markers: [{ id: "hit", time: 0.005, kind: "gameplay" }] });
  expect(clock.advance(3600)).toEqual({ events: [], overflow: true });
  expect(clock.paused).toBe(true);
  expect(clock.time).toBe(0);
  expect(clock.fault).toContain("overflow");
  clock.seek(0.005);
  expect(clock.fault).toBeUndefined();
  expect(clock.advance(1).events).toEqual([]);
});
test("per-instance mixers share immutable clips but not poses or owned bindings", () => {
  const a = new Group(),
    b = new Group();
  a.name = b.name = "Root";
  const clip = new AnimationClip("Move", 1, [
    new NumberKeyframeTrack(".position[x]", [0, 1], [0, 4]),
  ]);
  const first = new ThreeClipPlayer(a, new Map([["stable-clip", clip]])),
    second = new ThreeClipPlayer(b, new Map([["stable-clip", clip]]));
  first.play("stable-clip", { loop: false });
  second.play("stable-clip", { loop: false });
  first.seek(0.25);
  second.seek(0.75);
  expect(a.position.x).toBeCloseTo(1);
  expect(b.position.x).toBeCloseTo(3);
  expect(clip.tracks[0].values[1]).toBe(4);
  first.dispose();
  first.dispose();
  expect(a.position.x).toBe(0);
  expect(b.position.x).toBeCloseTo(3);
  expect(() => first.advance(0.1)).toThrow("disposed");
  second.dispose();
  expect(b.position.x).toBe(0);
});
test("PCM preflight rejects malformed, empty, truncated and unsupported input before decoder allocation", () => {
  const bytes = sineWave(0.2, 2);
  expect(inspectWave(bytes)).toMatchObject({
    frames: 3200,
    channels: 2,
    sampleRate: 16000,
    pcmBytes: 25600,
  });
  expect(() => inspectWave(bytes.subarray(1))).toThrow();
  expect(() => inspectWave(sineWave(0.001))).toThrow();
  const bad = bytes.slice();
  new DataView(bad.buffer).setUint16(20, 3, true);
  expect(() => inspectWave(bad)).toThrow("PCM16");
  const corrupt = bytes.slice();
  new DataView(corrupt.buffer).setUint32(40, 0xffffffff, true);
  expect(() => inspectWave(corrupt)).toThrow("Truncated");
});
test("null audio reports not-rendered; role/priority admission and generations are deterministic", async () => {
  const backend = new NullAudioBackend();
  backend.loadWave("cue", sineWave());
  const audio = new VoiceSystem(backend, 2, 1);
  const dialogue = audio.play({ asset: "cue", bus: "dialogue", loop: true }),
    fx = audio.play({ asset: "cue", loop: true });
  expect(dialogue.status).toBe("not-rendered");
  expect(fx.status).toBe("not-rendered");
  const ui = audio.play({ asset: "cue", bus: "ui", loop: true });
  expect(ui.status).toBe("not-rendered");
  expect(audio.stats.active).toBe(2);
  expect(audio.play({ asset: "cue", priority: 1000 }).status).toBe("rejected");
  expect(audio.play({ asset: "missing" }).status).toBe("rejected");
  audio.reset();
  const current = audio.play({ asset: "cue" });
  if (fx.status === "not-rendered") audio.stop(fx.handle, 0);
  expect(audio.stats.active).toBe(1);
  expect(current.status).toBe("not-rendered");
  audio.advance(0.2);
  expect(audio.stats.active).toBe(0);
  expect(backend.trace.every((t) => t.status === "not-rendered")).toBe(true);
  await audio.dispose();
  await audio.dispose();
  expect(() => audio.play({ asset: "cue" })).toThrow("disposed");
});
test("release tails stay bounded and failed starts do not evict valid voices", async () => {
  const ended: (() => void)[] = [],
    forced: number[] = [];
  let fail = false;
  const backend: VoiceBackend = {
    rendered: true,
    ready: true,
    duration: () => 1,
    start: (_request, onEnded): VoiceControl => {
      if (fail) throw Error("device failure");
      const index = ended.push(onEnded) - 1;
      return {
        stop: (fade) => {
          if (fade === 0) {
            forced.push(index);
            onEnded();
          }
        },
      };
    },
    dispose: () => {},
  };
  const audio = new VoiceSystem(backend, 1, 2);
  for (let i = 0; i < 10; i++) audio.play({ asset: "cue", loop: true });
  expect(audio.stats).toMatchObject({ active: 1, tails: 2 });
  expect(forced.length).toBe(7);
  fail = true;
  expect(audio.play({ asset: "cue", loop: true }).status).toBe("rejected");
  expect(audio.stats.active).toBe(1);
  audio.reset();
  fail = false;
  audio.play({ asset: "cue" });
  for (const callback of ended.slice(0, -1)) callback();
  expect(audio.stats.active).toBe(1);
  await audio.dispose();
});

test("fixed-tick accumulation delivers the half-second marker at tick thirty", () => {
  const clock = new ClipClock(1, {
    markers: [
      { id: "half", time: 0.5, kind: "gameplay" },
      { id: "loop", time: 0, kind: "cosmetic", repeat: true },
    ],
  });
  const ticks: number[] = [];
  for (let tick = 1; tick <= 60; tick++) {
    if (clock.advance(1 / 60).events.length) ticks.push(tick);
  }
  expect(ticks).toEqual([30, 60]);
  expect(clock.time).toBe(0);
});

test("marker activation/loop keys do not replay a delivered hit after seek or direction changes", () => {
  const clock = new ClipClock(1, { markers: [{ id: "hit", time: 0.5, kind: "gameplay" }] });
  expect(clock.advance(0.5).events.length).toBe(1);
  clock.seek(0.25);
  expect(clock.advance(0.25).events).toEqual([]);
  clock.speed = -1;
  clock.advance(1);
  clock.speed = 1;
  expect(clock.advance(1).events).toEqual([]);
  expect(clock.advance(1).events.map((e) => e.loop)).toEqual([1]);
});

test("loop seeks preserve iteration identity and the exact preview endpoint", () => {
  const clock = new ClipClock(1, { markers: [{ id: "hit", time: 0.5, kind: "gameplay" }] });
  expect(clock.advance(2.5).events.map((e) => e.loop)).toEqual([0, 1, 2]);
  clock.seek(0.25);
  expect(clock.advance(0.25).events).toEqual([]);
  expect(clock.advance(1).events.map((e) => e.loop)).toEqual([3]);
  clock.seek(1);
  expect(clock.time).toBe(1);
  expect(clock.advance(0).events).toEqual([]);
  expect(clock.time).toBe(1);
  clock.advance(0.1);
  expect(clock.time).toBeCloseTo(0.1);
  const reverse = new ClipClock(1, { speed: -1 });
  expect(reverse.time).toBe(1);
  reverse.advance(0.25);
  expect(reverse.time).toBeCloseTo(0.75);
});
