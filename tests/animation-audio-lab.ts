import { prepareImport } from "../packages/assets/src/import";
import { hashBytes } from "../packages/assets/src/blobs";
import manifest from "./fixtures/dcc-manifest.json";
import * as T from "three";
import { ModelCache } from "../packages/assets/src/cache";
import { assetMemory } from "../packages/assets/src/budget";
import { toDataURI } from "../packages/assets/src/glb";
import { ThreeClipPlayer } from "../packages/animation/src/three-player";
import { BrowserAudioBackend } from "../packages/audio/src/browser";
import { VoiceSystem } from "../packages/audio/src/voices";
import { skinnedTriangle } from "./asset-fixtures";
import { sineWave } from "./audio-fixtures";
const status = document.querySelector<HTMLPreElement>("#status")!;
const button = (id: string) => document.querySelector<HTMLButtonElement>("#" + id)!;
const cache = new ModelCache(),
  backend = new BrowserAudioBackend(),
  audio = new VoiceSystem(backend, 4, 2);
const renderer = new T.WebGLRenderer({
    canvas: document.querySelector("canvas")!,
    antialias: false,
  }),
  scene = new T.Scene(),
  camera = new T.PerspectiveCamera(42, 720 / 400, 0.1, 100);
renderer.setSize(720, 400, false);
scene.background = new T.Color("#172c25");
camera.position.set(0, 1, 5);
camera.lookAt(0, 0.8, 0);
scene.add(new T.HemisphereLight("#ffffff", "#5c755b", 3));
const light = new T.DirectionalLight("#fff6d6", 3);
light.position.set(0, 2, 4);
scene.add(light);
const external = new URLSearchParams(location.search).get("character") === "1";
let data = toDataURI(skinnedTriangle());
if (external) {
  const fixture = manifest.fixtures.find(
    (f) => f.name === "blender_293_barbarian_7400_binary.fbx",
  )!;
  const response = await fetch("/.cache/dcc/" + fixture.name);
  if (!response.ok) {
    status.textContent =
      "External character not cached. Run bun tests/dcc-fidelity.ts --fetch, or choose the synthetic fixture link.";
    throw Error("Missing external character fixture");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if ((await hashBytes(bytes)) !== fixture.sha256) throw Error("External fixture hash mismatch");
  data = (await prepareImport([new File([bytes], fixture.name)], new AbortController().signal))
    .data;
}
const baseline = assetMemory.snapshot.used; // immutable source/cache blobs are owned by the asset service
await cache.prepare(data, new AbortController().signal);
const first = await cache.acquireAsync(data, "first", new AbortController().signal),
  second = await cache.acquireAsync(data, "second", new AbortController().signal);
first.root.position.x = -1.4;
second.root.position.x = 0.4;
if (external) {
  first.root.position.x = 0;
  second.root.position.x = 0;
  const bounds = new T.Box3().setFromObject(first.root),
    size = bounds.getSize(new T.Vector3()),
    center = bounds.getCenter(new T.Vector3());
  const spacing = Math.max(size.x, size.y * 0.65);
  first.root.position.x = -spacing * 0.7;
  second.root.position.x = spacing * 0.7;
  camera.position.set(center.x, center.y, center.z + Math.max(size.y, spacing) * 3);
  camera.lookAt(center);
}
scene.add(first.root, second.root);
const clips = new Map([["lift", first.root.animations[0]]]);
let a = new ThreeClipPlayer(first.root, clips),
  b = new ThreeClipPlayer(second.root, clips),
  events = 0,
  dead = false,
  cycles = 0;
const start = () => {
  a.play("lift", { loop: false, markers: [{ id: "footstep", time: 0.5, kind: "cosmetic" }] });
  b.play("lift", { loop: true, speed: 0.5 });
  b.seek(0.5);
};
start();
const jointsA: T.Bone[] = [],
  jointsB: T.Bone[] = [];
first.root.traverse((o) => {
  if (o instanceof T.Bone) jointsA.push(o);
});
second.root.traverse((o) => {
  if (o instanceof T.Bone) jointsB.push(o);
});
const boneA = jointsA[0],
  boneB = jointsB[0];
const snapshots = () => ({
  ready: !dead,
  external,
  joints: jointsA.length,
  poseDifference: jointsA.reduce(
    (sum, bone, i) =>
      sum +
      bone.position.distanceTo(jointsB[i].position) +
      1 -
      Math.abs(bone.quaternion.dot(jointsB[i].quaternion)),
    0,
  ),
  first: boneA.position.y,
  second: boneB.position.y,
  events,
  cycles,
  parses: cache.metrics.parses,
  leases: cache.metrics.leases,
  bindings: a.stats.bindings + b.stats.bindings,
  voices: audio.stats.active,
  tails: audio.stats.tails,
  device: backend.stats,
  peak: backend.outputPeak(),
  accounted: assetMemory.snapshot.used,
  baseline,
});
function show(message = "") {
  status.textContent = message + "\n" + JSON.stringify(snapshots(), null, 2);
}
let frame = 0,
  running = false,
  last = performance.now(),
  accumulator = 0,
  draws = 0;
function render() {
  if (dead) return;
  const now = performance.now(),
    dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running) {
    accumulator = Math.min(0.1, accumulator + dt);
    while (accumulator >= 1 / 60) {
      const result = a.advance(1 / 60);
      b.advance(1 / 60);
      events += result.events.length;
      if (result.events.length && backend.ready) audio.play({ asset: "tone", gainDb: -18 });
      accumulator -= 1 / 60;
    }
    if (++draws % 10 === 0)
      show("Running fixed-tick presentation fixture. The demo cue is not a calibrated footstep.");
  }
  renderer.render(scene, camera);
  frame = requestAnimationFrame(render);
}
render();
function bind(id: string, action: () => void | Promise<void>) {
  button(id).disabled = false;
  button(id).onclick = () => {
    void Promise.resolve()
      .then(action)
      .catch((error) => show(String(error)));
  };
}
bind("run", () => {
  running = !running;
  accumulator = 0;
  button("run").textContent = running ? "Pause animation" : "Run animation";
  button("step").disabled = running;
  show();
});
bind("step", () => {
  const result = a.advance(0.25);
  b.advance(0.25);
  events += result.events.length;
  show("Advanced one explicit simulation interval; seeking never sends markers.");
});
// unlock() is invoked directly in the gesture handler, not in a timer or a promise continuation.
button("audio").disabled = false;
button("audio").onclick = () => {
  void backend
    .unlock()
    .then(async (unlocked) => {
      if (!unlocked) {
        show("Audio remains blocked by the device/browser.");
        return;
      }
      if (!backend.duration("tone"))
        await backend.loadWave("tone", sineWave(1), new AbortController().signal);
      show("Device unlocked. No automatic playback.");
    })
    .catch((error) => show(String(error)));
};
bind("cue", () => {
  const result = audio.play({ asset: "tone", gainDb: -6 });
  show(JSON.stringify(result));
});
bind("stress", () => {
  if (!backend.ready || !backend.duration("tone"))
    throw Error("Enable audio before lifecycle testing");
  running = false;
  button("run").textContent = "Run animation";
  button("step").disabled = false;
  a.dispose();
  b.dispose();
  for (let i = 0; i < 100; i++) {
    const player = new ThreeClipPlayer(first.root, clips);
    player.play("lift");
    player.seek(0.5);
    player.dispose();
    if (player.stats.bindings || player.stats.actions) throw Error("Mixer binding leak");
    audio.play({ asset: "tone", loop: true });
    audio.reset();
    if (audio.stats.active || audio.stats.tails || backend.stats.voices)
      throw Error("Voice ownership leak");
  }
  cycles += 100;
  a = new ThreeClipPlayer(first.root, clips);
  b = new ThreeClipPlayer(second.root, clips);
  start();
  show("100 cycles completed with zero retained temporary voices/bindings.");
});
bind("dispose", async () => {
  dead = true;
  cancelAnimationFrame(frame);
  a.dispose();
  b.dispose();
  first.release();
  second.release();
  cache.dispose();
  await audio.dispose();
  renderer.dispose();
  scene.clear();
  for (const element of document.querySelectorAll("button")) element.disabled = true;
  show("Disposed. PCM reservations, model leases and mixer bindings released.");
});
declare global {
  interface Window {
    plan02Fixture: { snapshot: typeof snapshots };
  }
}
window.plan02Fixture = { snapshot: snapshots };
show("Ready. Animation and audio are explicit; selecting the fixture does not autoplay.");
