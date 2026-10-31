import * as T from "three";
import { makeGlb } from "../tests/asset-fixtures";
import { sineWave } from "../tests/audio-fixtures";
import { createGame, placeModel } from "../packages/project/src";
import { prepareGlbRecord } from "../packages/assets/src/record";
import { adoptImport } from "../packages/assets/src/import";
import { entity, parseScene } from "../packages/runtime/src/schema";
import { createUIElement, emptyUI } from "../packages/ui/src/schema";
import { emptyAudio, defaultCue, waveURI } from "../packages/audio/src/definition";
import type { AnimatorDefinition } from "../packages/animation/src/definition";
/** Original procedural, rigid-weighted seven-joint character; no downloaded art or sound. */
export function tutorialRig() {
  const joints = [
    { name: "Hips", p: [0, 0, 0], size: [0.4, 0.3, 0.24], offset: 0 },
    { name: "Chest", p: [0, 0.35, 0], size: [0.42, 0.4, 0.24], offset: 0 },
    { name: "Head", p: [0, 0.75, 0], size: [0.32, 0.32, 0.32], offset: 0 },
    { name: "LeftArm", p: [-0.34, 0.35, 0], size: [0.15, 0.5, 0.15], offset: -0.25 },
    { name: "RightArm", p: [0.34, 0.35, 0], size: [0.15, 0.5, 0.15], offset: -0.25 },
    { name: "LeftLeg", p: [-0.13, -0.2, 0], size: [0.17, 0.65, 0.18], offset: -0.325 },
    { name: "RightLeg", p: [0.13, -0.2, 0], size: [0.17, 0.65, 0.18], offset: -0.325 },
  ];
  const position: number[] = [],
    normal: number[] = [],
    indices: number[] = [],
    weights: number[] = [],
    colors: number[] = [];
  for (const [i, joint] of joints.entries()) {
    const box = new T.BoxGeometry(...(joint.size as [number, number, number])).toNonIndexed(),
      p = box.getAttribute("position"),
      n = box.getAttribute("normal");
    for (let v = 0; v < p.count; v++) {
      position.push(
        p.getX(v) + joint.p[0],
        p.getY(v) + joint.p[1] + joint.offset,
        p.getZ(v) + joint.p[2],
      );
      normal.push(n.getX(v), n.getY(v), n.getZ(v));
      indices.push(i, 0, 0, 0);
      weights.push(1, 0, 0, 0);
      colors.push(
        ...(i === 2 ? [0.85, 0.65, 0.4] : i >= 5 ? [0.2, 0.32, 0.32] : [0.35, 0.62, 0.5]),
      );
    }
    box.dispose();
  }
  const buffers: Uint8Array[] = [],
    views: { buffer: number; byteOffset: number; byteLength: number }[] = [],
    accessors: Record<string, unknown>[] = [];
  let length = 0;
  const add = (
    values: number[],
    type: string,
    integer = false,
    range?: { min: number[]; max: number[] },
  ) => {
    const data = integer ? new Uint16Array(values) : new Float32Array(values),
      bytes = new Uint8Array(data.buffer),
      view = views.length;
    views.push({ buffer: 0, byteOffset: length, byteLength: bytes.length });
    buffers.push(bytes);
    length += bytes.length;
    const width = type === "MAT4" ? 16 : type === "VEC4" ? 4 : type === "VEC3" ? 3 : 1;
    accessors.push({
      bufferView: view,
      componentType: integer ? 5123 : 5126,
      count: values.length / width,
      type,
      ...range,
    });
    return accessors.length - 1;
  };
  const packed = new Float32Array(position),
    min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < packed.length; i++) {
    min[i % 3] = Math.min(min[i % 3], packed[i]);
    max[i % 3] = Math.max(max[i % 3], packed[i]);
  }
  const pos = add(position, "VEC3", false, { min, max }),
    nor = add(normal, "VEC3"),
    skin = add(indices, "VEC4", true),
    weight = add(weights, "VEC4"),
    color = add(colors, "VEC3");
  const inverse = add(
    joints.flatMap((j) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -j.p[0], -j.p[1], -j.p[2], 1]),
    "MAT4",
  );
  const animation = (
    name: string,
    tracks: { node: number; path: string; times: number[]; values: number[] }[],
  ) => ({
    name,
    samplers: tracks.map((t) => ({
      input: add(t.times, "SCALAR", false, { min: [t.times[0]], max: [t.times.at(-1)!] }),
      output: add(t.values, t.path === "rotation" ? "VEC4" : "VEC3"),
      interpolation: "LINEAR",
    })),
    channels: tracks.map((t, i) => ({ sampler: i, target: { node: t.node, path: t.path } })),
  });
  const angles = (axis: "x" | "y", values: number[]) =>
    values.flatMap((value) => {
      const q = new T.Quaternion().setFromAxisAngle(
        axis === "x" ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0),
        value,
      );
      return q.toArray();
    });
  const idle = { node: 2, path: "translation", times: [0, 1], values: [0, 0, 0, 0, 0, 0] },
    times = [0, 0.25, 0.5, 0.75, 1];
  const clips = [
    animation("Idle", [idle]),
    animation("Walk", [
      {
        node: 2,
        path: "translation",
        times,
        values: times.flatMap((t, i) => [0, i % 2 === 0 ? -0.05 : 0, t]),
      },
      ...[3, 4, 5, 6].map((joint, i) => ({
        node: joint + 2,
        path: "rotation",
        times,
        values: angles(
          "x",
          [-0.4, 0, 0.4, 0, -0.4].map((a) => a * (i % 2 ? -1 : 1)),
        ),
      })),
    ]),
    animation("Attack", [
      idle,
      {
        node: 6,
        path: "rotation",
        times: [0, 0.2, 0.45, 0.7, 1],
        values: angles("x", [0, -0.5, -1.4, -0.2, 0]),
      },
    ]),
    animation("Turn", [
      { ...idle, times: [0, 0.5] },
      { node: 2, path: "rotation", times: [0, 0.5], values: angles("y", [0, Math.PI / 2]) },
    ]),
  ];
  const bin = new Uint8Array(length);
  let at = 0;
  for (const bytes of buffers) {
    bin.set(bytes, at);
    at += bytes.length;
  }
  return makeGlb(
    {
      asset: { version: "2.0", generator: "Pinefall original tutorial rig" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        { name: "TutorialRig", children: [1, 2] },
        { name: "Character", mesh: 0, skin: 0 },
        ...joints.map((j, i) => ({
          name: j.name,
          translation: j.p,
          ...(i === 0 ? { children: [3, 4, 5, 6, 7, 8] } : {}),
        })),
      ],
      meshes: [
        {
          primitives: [
            {
              attributes: {
                POSITION: pos,
                NORMAL: nor,
                JOINTS_0: skin,
                WEIGHTS_0: weight,
                COLOR_0: color,
              },
              material: 0,
            },
          ],
        },
      ],
      materials: [
        {
          name: "Original colors",
          pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.85 },
        },
      ],
      skins: [{ joints: joints.map((_, i) => i + 2), skeleton: 2, inverseBindMatrices: inverse }],
      animations: clips,
      buffers: [{ byteLength: length }],
      bufferViews: views,
      accessors,
    },
    bin,
  );
}
function tone(seconds: number, frequency: number) {
  const bytes = sineWave(seconds),
    view = new DataView(bytes.buffer),
    rate = 16000;
  for (let i = 0; i < (bytes.length - 44) / 2; i++) {
    const t = i / rate,
      envelope = Math.min(1, t / 0.005) * Math.min(1, (seconds - t) / 0.02) * Math.exp(-t * 10);
    view.setInt16(
      44 + i * 2,
      Math.round(Math.sin(t * frequency * 2 * Math.PI) * 10000 * envelope),
      true,
    );
  }
  return waveURI(bytes);
}
export async function animationAudioTutorial() {
  const imported = adoptImport(
      createGame("Animation and audio workshop"),
      await prepareGlbRecord("workshop-character.glb", tutorialRig()),
    ),
    placed = placeModel(imported.scene, imported.asset.id, "Player rig"),
    scene = placed.scene;
  scene.entities = scene.entities.filter((e) => e.tag !== "player");
  scene.version = 3;
  const player = scene.entities.find((e) => e.id === placed.entity.id)!;
  const clip = (name: string, start = 0, end = 1) => ({
    subasset: imported.asset.import!.subassets.find(
      (s) => s.kind === "clip" && s.key === "name:" + name,
    )!.id,
    start,
    end,
  });
  const graph: AnimatorDefinition = {
    version: 1,
    rootMotion: { node: "Hips" },
    initial: "idle",
    parameters: { moving: false, attack: false, turn: false, always: true },
    clips: {
      idle: clip("Idle"),
      walk: {
        ...clip("Walk"),
        markers: [
          { id: "left", time: 0, entry: true, repeat: true, kind: "cosmetic" },
          { id: "right", time: 0.5, repeat: true, kind: "cosmetic" },
        ],
      },
      attack: { ...clip("Attack"), markers: [{ id: "hit", time: 0.45, kind: "gameplay" }] },
      turn: clip("Turn", 0, 0.5),
      recover: clip("Idle", 0, 0.2),
    },
    states: {
      idle: { clip: "idle", loop: true, speed: 1 },
      walk: { clip: "walk", loop: true, speed: 1 },
      attack: { clip: "attack", loop: false, speed: 1 },
      turn: { clip: "turn", loop: false, speed: 1 },
      recover: { clip: "recover", loop: false, speed: 1 },
    },
    transitions: [],
  };
  const transition = (
    from: string,
    to: string,
    parameter: string,
    value: boolean,
    minTime = 0,
    priority = 0,
  ) =>
    graph.transitions.push({
      from,
      to,
      parameter,
      operator: "eq",
      value,
      fade: 0.08,
      priority,
      minTime,
    });
  for (const from of ["idle", "walk"]) {
    transition(from, "attack", "attack", true, 0, 10);
    transition(from, "turn", "turn", true, 0, 5);
  }
  transition("idle", "walk", "moving", true);
  transition("walk", "idle", "moving", false, 0.05);
  transition("attack", "recover", "always", true, 1);
  transition("recover", "idle", "always", true, 0.2);
  transition("turn", "idle", "always", true, 0.5);
  player.transform.position = [-1, 0.9, -2];
  player.physics = {
    type: "kinematic",
    shape: "capsule",
    mass: 75,
    friction: 0.5,
    restitution: 0,
    sensor: false,
  };
  player.tag = "player";
  player.behavior = "character";
  player.animator = graph;
  player.audioCues = { left: "step", right: "step", hit: "impact" };
  const twin = structuredClone(player);
  twin.id = crypto.randomUUID();
  twin.name = "Independent rig";
  delete twin.tag;
  twin.transform.position[0] = 1;
  twin.animator!.states.walk.speed = 0.75;
  scene.entities.push(twin);
  const wall = entity("Root-motion wall", "box", [0, 0.3, 3], [8, 0.6, 0.5], "#536d66");
  wall.physics = {
    type: "fixed",
    shape: "box",
    mass: 1,
    friction: 0.5,
    restitution: 0,
    sensor: false,
  };
  scene.entities.push(wall);
  scene.audio = emptyAudio();
  scene.audio.assets = [
    { id: "step-wav", name: "original-step.wav", data: tone(0.08, 160) },
    { id: "hit-wav", name: "original-hit.wav", data: tone(0.14, 95) },
    { id: "ui-wav", name: "original-ui.wav", data: tone(0.12, 660) },
  ];
  scene.audio.cues = [
    { ...defaultCue("step", "step-wav"), spatial: true, gainDb: -8 },
    { ...defaultCue("impact", "hit-wav"), spatial: true },
    { ...defaultCue("interface", "ui-wav"), bus: "ui" },
  ];
  scene.scripts = [
    {
      id: "workshop",
      name: "Workshop controller",
      source: `export default ctx=>{let attack=false,turn=false,hits=0;const automatic=ctx.boolean('automatic');return {start(){if(!automatic){ctx.ui.onAction('ui-sound',()=>ctx.audio.play('interface'));ctx.animation.onEvent(e=>{if(e.message==='hit'){hits++;ctx.ui.setText('hits','Attack hits: '+hits);}});}},fixedUpdate(){const a=ctx.input.has('KeyF'),t=ctx.input.has('KeyE');ctx.animation.setParameter('moving',automatic||ctx.input.has('KeyW'));ctx.animation.setParameter('attack',!automatic&&a&&!attack);ctx.animation.setParameter('turn',!automatic&&t&&!turn);attack=a;turn=t;},update(){if(!automatic)ctx.ui.setText('state','State: '+ctx.animation.snapshot.state+' · Z '+ctx.object.position.z.toFixed(2));}};}`,
    },
  ];
  player.scripts = [
    { id: "control", script: "workshop", enabled: true, props: { automatic: false } },
  ];
  twin.scripts = [{ id: "control", script: "workshop", enabled: true, props: { automatic: true } }];
  scene.ui = emptyUI();
  const panel = createUIElement("panel", "workshop-panel", "Workshop");
  panel.anchor = "bottom-left";
  panel.width = 470;
  panel.height = 190;
  panel.style.backgroundOpacity = 0.92;
  scene.ui.elements.push(panel);
  for (const [id, text, y] of [
    ["help", "W walk · E turn 90° · F attack", 10],
    ["state", "State: idle", 44],
    ["hits", "Attack hits: 0", 76],
  ] as const) {
    const label = createUIElement("text", id, id);
    label.parent = panel.id;
    label.x = 14;
    label.y = y;
    label.width = 420;
    label.height = 30;
    label.text = text;
    label.style.fontSize = 15;
    scene.ui.elements.push(label);
  }
  const button = createUIElement("button", "ui-sound", "UI sound");
  button.parent = panel.id;
  button.x = 14;
  button.y = 116;
  button.width = 300;
  button.height = 42;
  button.text = "Play UI sound (works while paused)";
  button.action = "ui-sound";
  button.style.fontSize = 14;
  scene.ui.elements.push(button);
  return parseScene(scene);
}
