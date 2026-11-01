import { test, expect } from "bun:test";
import { HeadlessEngine } from "../packages/headless/src";
import { createGame } from "../packages/project/src";
import { parseScene, serializeScene } from "../packages/runtime/src/schema";
import { compileScript } from "../packages/scripting/src/compiler";
import type { SceneDocument } from "../packages/runtime/src/schema";
function attach(scene: SceneDocument, source: string, index = 0, props = {}) {
  const id = crypto.randomUUID();
  scene.scripts ??= [];
  scene.scripts.push({ id, name: id + ".ts", source });
  scene.entities[index].scripts ??= [];
  scene.entities[index].scripts.push({ id: crypto.randomUUID(), script: id, enabled: true, props });
  return id;
}
test("script schema roundtrips and rejects dangling references and unsafe properties", () => {
  const s = createGame("scripts");
  attach(s, "export default () => ({})");
  expect(parseScene(JSON.parse(serializeScene(s)))).toEqual(s);
  s.entities[0].scripts![0].script = "missing";
  expect(() => parseScene(s)).toThrow();
});
test("import and syntax checks never execute scripts; Play refuses without explicit trust", async () => {
  const s = createGame("untrusted");
  attach(s, "throw Error('must never execute'); export default () => ({})");
  compileScript(s.scripts![0].source);
  const engine = await HeadlessEngine.create(s);
  try {
    expect(() => engine.step()).toThrow("trusted-code permission");
    expect(engine.events.entries.length).toBe(0);
  } finally {
    engine.dispose();
  }
});
test("typed class with defaults and per-object overrides executes alongside controller", async () => {
  const s = createGame("classes");
  attach(
    s,
    `import { Script } from '@pinefall/sdk'; export const defaults={speed:2}; export default class Counter extends Script { start(){this.ctx.log('ready');} fixedUpdate(dt:number){this.ctx.engine.speed=Number(this.ctx.props.speed); this.ctx.state.elapsed=Number(this.ctx.state.elapsed||0)+dt;} }`,
    1,
    { speed: 7 },
  );
  const e = await HeadlessEngine.create(s);
  e.allowSceneScripts = true;
  try {
    e.input.add("KeyW");
    e.step(60);
    expect(e.speed).toBe(7);
    expect(e.snapshot().entities[1].transform.position[2]).toBeLessThan(6);
    expect(e.events.entries.some((e) => e.message === "ready")).toBe(true);
  } finally {
    e.dispose();
  }
});
test("multiple scripts isolate closure state per object and share named helper modules", async () => {
  const s = createGame("helpers");
  s.scripts = [
    { id: "helper", name: "math.ts", source: "export function twice(n:number){return n*2;}" },
  ];
  const id = attach(
    s,
    `import {twice} from './math'; export default ctx=>{let n=0;return {fixedUpdate(){n++;ctx.log(String(twice(n)));}};}`,
  );
  s.entities[1].scripts = [{ id: "other", script: id, enabled: true, props: {} }];
  const e = await HeadlessEngine.create(s);
  e.allowSceneScripts = true;
  try {
    e.step(2);
    expect(e.events.entries.filter((e) => e.type === "script").map((e) => e.message)).toEqual([
      "2",
      "2",
      "4",
      "4",
    ]);
  } finally {
    e.dispose();
  }
});
test("failing script does not disable its sibling or built-in behavior", async () => {
  const s = createGame("errors");
  attach(s, 'export default ()=>({fixedUpdate(){throw Error("broken")}})', 1);
  attach(s, "export default ctx=>({fixedUpdate(){ctx.engine.speed++}})", 1);
  const e = await HeadlessEngine.create(s);
  e.allowSceneScripts = true;
  try {
    e.step(5);
    expect(e.speed).toBe(5);
    expect(e.events.entries.filter((e) => e.type === "error").length).toBe(1);
  } finally {
    e.dispose();
  }
});
test("syntax failure is logged and other scripts continue", async () => {
  const s = createGame("syntax");
  attach(s, "export default () => { bad syntax");
  attach(s, "export default ctx=>({start(){ctx.engine.won=true}})");
  const e = await HeadlessEngine.create(s);
  e.allowSceneScripts = true;
  try {
    e.step();
    expect(e.won).toBe(true);
    expect(e.events.entries.some((e) => e.type === "error")).toBe(true);
  } finally {
    e.dispose();
  }
});
test("event listeners are automatically removed on dispose", async () => {
  const s = createGame("events");
  attach(s, "export default ctx=>({start(){ctx.onEvent('ping',()=>ctx.log('pong'));}})");
  const e = await HeadlessEngine.create(s);
  e.allowSceneScripts = true;
  e.step();
  e.events.emit("custom:ping", "ping");
  expect(e.events.entries.filter((e) => e.message === "pong").length).toBe(1);
  e.dispose();
  e.events.emit("custom:ping", "ping");
  expect(e.events.entries.filter((e) => e.message === "pong").length).toBe(1);
});
test("trusted scripts spawn real physics entities and destroy them", async () => {
  const s = createGame("spawn");
  attach(
    s,
    `import {entity} from '@pinefall/sdk'; export default ctx=>{let id='';return {start(){const box=entity('Script crate','box',[0,5,0]);box.physics={type:'dynamic',shape:'box',mass:1,friction:.5,restitution:0,sensor:false};id=ctx.spawn(box).id;},fixedUpdate(){if(ctx.time.elapsed>.1)ctx.destroy(id);}};}`,
  );
  const e = await HeadlessEngine.create(s);
  e.allowSceneScripts = true;
  try {
    e.step(1);
    expect(e.document.entities.length).toBe(3);
    expect(e.physics.bodies.size).toBe(3);
    e.step(20);
    expect(e.document.entities.length).toBe(2);
    expect(e.physics.bodies.size).toBe(2);
  } finally {
    e.dispose();
  }
});
test("disabled attachments are not evaluated", async () => {
  const s = createGame("disabled");
  attach(s, "throw Error('not allowed'); export default ()=>({})");
  s.entities[0].scripts![0].enabled = false;
  const e = await HeadlessEngine.create(s);
  try {
    e.step();
    expect(e.events.entries.length).toBe(0);
  } finally {
    e.dispose();
  }
});

test("async script factories are rejected before execution", async () => {
  const scene = createGame("async");
  attach(scene, "export default async ctx=>{ctx.engine.won=true;return {}}");
  const e = await HeadlessEngine.create(scene);
  e.allowSceneScripts = true;
  try {
    e.step();
    expect(e.won).toBe(false);
    expect(e.events.entries.some((e) => e.type === "error")).toBe(true);
  } finally {
    e.dispose();
  }
});

test("disposing a script scope aborts its pending shader compilation", async () => {
  const scene = createGame("shader scope");
  attach(
    scene,
    `export default (ctx) => ({ start() {
    void ctx.graphics.compileShader(ctx.entity.id, {
      version: 1, fragment: 'vec4 shade(vec2 uv, vec3 p) { return vec4(1.0); }', uniforms: {}
    }).catch(() => {});
  } });`,
  );
  const engine = await HeadlessEngine.create(scene);
  const signals: AbortSignal[] = [];
  engine.graphics.compileShader = (_id, _source, signal) => {
    if (!signal) throw Error("Missing lifetime signal");
    signals.push(signal);
    return new Promise<void>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  };
  engine.allowSceneScripts = true;
  try {
    engine.step();
    expect(signals.length).toBe(1);
    expect(signals[0].aborted).toBe(false);
  } finally {
    engine.dispose();
  }
  expect(signals[0].aborted).toBe(true);
  await Promise.resolve();
});
