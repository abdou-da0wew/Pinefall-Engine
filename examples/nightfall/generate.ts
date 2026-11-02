import { readFile } from "node:fs/promises";
import { entity, parseScene, type Entity, type Vec3 } from "../../packages/runtime/src/schema";
import { createGame } from "../../packages/project/src";
import { prepareGlbRecord } from "../../packages/assets/src/record";
import { adoptImport } from "../../packages/assets/src/import";
import {
  emptyGraphics,
  DEFAULT_SURFACE,
  DEFAULT_POST,
} from "../../packages/runtime/src/graphics-definition";
import { textureBinding } from "../../packages/runtime/src/image-definition";
import { emptyAudio, defaultCue, waveURI } from "../../packages/audio/src/definition";
import { createUIElement, emptyUI, type UIAnchor } from "../../packages/ui/src/schema";
import { forest, weaponModel } from "./scenery";
import { wretchRig } from "./wretch";
import { seeded } from "./scripts/Rules";
function sound(kind: string, seconds: number) {
  const rate = 22050,
    n = Math.floor(rate * seconds),
    bytes = new Uint8Array(44 + n * 2),
    v = new DataView(bytes.buffer);
  const str = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  const rand = seeded(39);
  let low = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate,
      noise = rand() * 2 - 1;
    low = 0.97 * low + 0.03 * noise;
    let value = 0;
    const env = Math.min(1, t * 500) * Math.min(1, (seconds - t) * 80);
    if (kind === "wind")
      value =
        (low * 1.7 +
          Math.sin(t * Math.PI * 2 * 55) * 0.035 +
          Math.sin(t * Math.PI * 2 * 82.5) * 0.02) *
        (0.6 + 0.2 * Math.sin((t * Math.PI) / 4));
    else if (kind === "shot" || kind === "blast")
      value =
        (noise * 0.65 + Math.sin(2 * Math.PI * (kind === "shot" ? 90 : 55) * t) * 0.4) *
        Math.exp(-t * (kind === "shot" ? 22 : 12));
    else if (kind === "growl")
      value =
        (Math.sin(t * 2 * Math.PI * (65 + 12 * Math.sin(t * 16))) * 0.45 + low * 2) *
        Math.sin((Math.PI * t) / seconds);
    else if (kind === "bell")
      value =
        (Math.sin(t * 440) + 0.4 * Math.sin(t * 667) + 0.2 * Math.sin(t * 1130)) *
        Math.exp(-t * 3) *
        0.4;
    else if (kind === "reload") value = noise * Math.exp(-((t % 0.18) * 55)) * 0.45;
    else value = (low * 3 + Math.sin(t * 350) * 0.15) * Math.exp(-t * 25);
    v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, value * env)) * 24000), true);
  }
  return waveURI(bytes);
}
export async function nightfallScene() {
  let scene = createGame("Nightfall Keep");
  scene.version = 3;
  scene.template = "first-person";
  scene.entities = [];
  scene.assets = [];
  scene.environment = {
    background: "#08161d",
    fog: "#14272e",
    fogNear: 16,
    fogFar: 96,
    sun: 0.8,
    ambient: 0.7,
    sunColor: "#9dbbd5",
    gravity: -18,
  };
  scene.graphics = emptyGraphics();
  scene.graphics.post = {
    ...DEFAULT_POST,
    enabled: true,
    bloom: true,
    strength: 0.15,
    exposure: 1.15,
    contrast: 1.06,
    saturation: 0.8,
    vignette: 0.35,
    grain: 0.015,
  };
  for (const name of ["stone", "forest-floor"]) {
    scene.graphics.images ??= [];
    scene.graphics.images.push({
      id: name,
      name: name + ".jpg",
      format: "jpeg",
      width: 1024,
      height: 1024,
      data:
        "data:image/jpeg;base64," +
        (await readFile(new URL("./art/" + name + ".jpg", import.meta.url))).toString("base64"),
    });
    scene.graphics.materials.push({
      ...DEFAULT_SURFACE,
      id: name,
      name,
      roughness: 0.95,
      color: name === "stone" ? "#9ca6a3" : "#868e7c",
      maps: { color: { ...textureBinding(name), repeat: name === "stone" ? [3, 2] : [16, 16] } },
    });
  }
  const add = (e: Entity, id?: string) => {
    if (id) e.id = id;
    scene.entities.push(e);
    return e;
  };
  const solid = (name: string, p: Vec3, s: Vec3, material?: string) => {
    const e = add(entity(name, "box", p, s, "#656f66"));
    if (material) e.mesh!.material = material;
    e.physics = {
      type: "fixed",
      shape: "box",
      mass: 1,
      friction: 0.8,
      restitution: 0,
      sensor: false,
    };
    return e;
  };
  for (const x of [-40, 40])
    for (const z of [-40, 40])
      solid("Forest earth", [x, -0.5, z], [80, 1, 80], "forest-floor").tag = "ground";
  for (const [x, z, w, d] of [
    [-80, -40, 2, 80],
    [-80, 40, 2, 80],
    [80, -40, 2, 80],
    [80, 40, 2, 80],
    [-40, -80, 80, 2],
    [40, -80, 80, 2],
    [-40, 80, 80, 2],
    [40, 80, 80, 2],
  ]) {
    const e = solid("Map boundary", [x, 3, z], [w, 6, d]);
    delete e.mesh;
  }
  const scenery = forest();
  const importAsset = async (name: string, bytes: Uint8Array) => {
    const imported = adoptImport(scene, await prepareGlbRecord(name + ".glb", bytes));
    scene = imported.scene;
    return imported.asset;
  };
  const forestAsset = await importAsset("Blackwood sectors", scenery.bytes);
  const woods = add(entity("Blackwood forest", "asset", [0, 0, 0], [1, 1, 1], "#ffffff"), "forest");
  woods.mesh!.asset = forestAsset.id;
  for (const [x, z, r] of scenery.trunks) {
    const trunk = solid("Tree collision", [x, 2, z], [r * 2, 4, r * 2]);
    delete trunk.mesh;
  }
  // An open gate, courtyard, breached curtain wall and roofed keep are real collision spaces.
  for (const [name, x, y, z, w, h, d] of [
    ["West curtain", -23, 3, -22, 2, 6, 56],
    ["East curtain", 23, 3, -22, 2, 6, 56],
    ["North curtain", 0, 3, -50, 48, 6, 2],
    ["Gate west", -15, 3, 5, 18, 6, 2],
    ["Gate east", 15, 3, 5, 18, 6, 2],
    ["Gate lintel", 0, 7, 5, 13, 3, 3],
    ["Keep west", -12, 4, -34, 2, 8, 23],
    ["Keep east", 12, 4, -34, 2, 8, 23],
    ["Keep rear", 0, 4, -45, 26, 8, 2],
    ["Keep entrance west", -8, 4, -23, 10, 8, 2],
    ["Keep entrance east", 8, 4, -23, 10, 8, 2],
    ["Keep entry arch", 0, 6.5, -23, 7, 3, 2],
    ["Keep roof", 0, 8, -34, 26, 1, 24],
    ["Broken partition", -5, 1.3, -35, 12, 2.6, 1],
  ] as [string, number, number, number, number, number, number][]) {
    solid(name, [x, y, z], [w, h, d], "stone");
  }
  for (const x of [-23, 23])
    for (const z of [5, -50]) {
      solid("Watchtower", [x, 5, z], [6, 10, 6], "stone");
      for (let j = 0; j < 4; j++)
        solid("Tower merlon", [x - 2.4 + j * 1.6, 10.6, z - 2.4], [0.85, 1.4, 1], "stone");
    }
  for (let j = 0; j < 14; j++)
    for (const x of [-23, 23]) {
      const e = add(
        entity("Curtain merlon", "box", [x, 6.6, -47 + j * 3.6], [2, 1.2, 1.6], "#82918b"),
      );
      e.mesh!.material = "stone";
    }
  for (let i = 0; i < 12; i++) {
    const x = 31 + (i % 4) * 3,
      z = 14 + Math.floor(i / 4) * 4;
    solid("Forgotten grave", [x, 0.65, z], [0.85, 1.3, 0.25], "stone");
    add(entity("Grave cross", "box", [x, 1.2, z], [1.3, 0.2, 0.28], "#9ba394"));
  }
  for (const x of [-16, 16])
    for (const z of [-9, -19, -31]) {
      solid("Courtyard buttress", [x, 1.5, z], [2, 3, 2], "stone");
    }
  for (const [x, z] of [
    [-5, 7],
    [5, 7],
    [-9, -25],
    [9, -39],
  ]) {
    add(entity("Wrought iron torch post", "cylinder", [x, 1.5, z], [0.11, 3, 0.11], "#363c36"));
    const flame = add(entity("Lantern flame", "sphere", [x, 3, z], [0.26, 0.42, 0.26], "#ffb45f"));
    flame.mesh!.surface = {
      ...DEFAULT_SURFACE,
      color: "#ffb45f",
      emissive: "#ff8a38",
      emissiveIntensity: 4,
    };
    flame.light = { type: "point", color: "#ffad62", intensity: 45, range: 14 };
  }
  const moon = add(entity("Cold moon", "sphere", [30, 38, -65], [5, 5, 5], "#b6d1d6"));
  moon.mesh!.surface = { ...DEFAULT_SURFACE, family: "unlit", color: "#b6d1d6" };
  scene.scripts = [];
  for (const [id, name] of [
    ["director", "Director.ts"],
    ["rules", "Rules.ts"],
  ])
    scene.scripts.push({
      id,
      name,
      source: await readFile(new URL("./scripts/" + name, import.meta.url), "utf8"),
    });
  const player = add(entity("Warden", "capsule", [0, 1.05, 20], [1, 1, 1]), "warden");
  player.tag = "player";
  player.physics = {
    type: "kinematic",
    shape: "capsule",
    mass: 75,
    friction: 0,
    restitution: 0,
    sensor: false,
  };
  player.scripts = [{ id: "director", script: "director", enabled: true, props: {} }];
  for (const [i, shotgun] of [false, true].entries()) {
    const asset = await importAsset(
      shotgun ? "Reliquary shotgun" : "Warden pistol",
      weaponModel(shotgun),
    );
    const e = add(entity("Viewmodel " + i, "asset", [0, -20, 0]), "weapon-" + i);
    e.mesh!.asset = asset.id;
    e.mesh!.castShadow = false;
  }
  const torch = add(entity("Warden flashlight"), "flashlight");
  delete torch.mesh;
  torch.light = { type: "spot", color: "#d7e4cc", intensity: 10, range: 28 };
  const rig = await importAsset("Wretch", wretchRig());
  for (let i = 0; i < 12; i++) {
    const e = add(entity("Wretch " + i, "asset", [0, -20 - i * 3, 0]), "enemy-" + i);
    e.mesh!.asset = rig.id;
    e.physics = {
      type: "kinematic",
      shape: "capsule",
      mass: 65,
      friction: 0,
      restitution: 0,
      sensor: false,
    };
    const clips = Object.fromEntries(
      ["Idle", "Walk", "Attack", "Death"].map((name) => [
        name.toLowerCase(),
        {
          subasset: rig.import!.subassets.find(
            (s) => s.kind === "clip" && s.key === "name:" + name,
          )!.id,
          start: 0,
          end: name === "Death" ? 0.5 : 1,
        },
      ]),
    );
    e.animator = {
      version: 1,
      initial: "idle",
      parameters: {},
      clips,
      states: Object.fromEntries(
        Object.keys(clips).map((name) => [
          name,
          { clip: name, loop: name === "walk" || name === "idle", speed: 1 },
        ]),
      ),
      transitions: [],
    };
  }
  for (let i = 0; i < 32; i++) {
    const e = add(
      entity("Ballistic tracer " + i, "box", [0, -20, 0], [0.05, 0.05, 0.7], "#ffc982"),
      "tracer-" + i,
    );
    e.mesh!.castShadow = false;
    e.mesh!.surface = { ...DEFAULT_SURFACE, family: "unlit", color: "#ffc982" };
  }
  for (let i = 0; i < 16; i++) {
    const e = add(
      entity("Impact " + i, "sphere", [0, -20, 0], [0.1, 0.1, 0.1], "#d2ad7c"),
      "impact-" + i,
    );
    e.mesh!.surface = { ...DEFAULT_SURFACE, family: "unlit", color: "#d2ad7c" };
    e.mesh!.castShadow = false;
  }
  const muzzle = add(
    entity("Muzzle flame", "cone", [0, -20, 0], [0.1, 0.22, 0.1], "#ffe3a2"),
    "muzzle",
  );
  muzzle.mesh!.surface = { ...DEFAULT_SURFACE, family: "unlit", color: "#ffe3a2" };
  muzzle.mesh!.castShadow = false;
  for (const [i, p] of (
    [
      [0, 0.5, -16],
      [0, 0.5, -39],
      [35, 0.5, 22],
      [-40, 0.5, 24],
    ] as Vec3[]
  ).entries()) {
    const e = add(
      entity("Supply cache " + (i + 1), "box", p, [1, 0.8, 0.7], "#8a8967"),
      "cache-" + i,
    );
    e.mesh!.surface = {
      ...DEFAULT_SURFACE,
      color: "#899776",
      emissive: "#8a9a70",
      emissiveIntensity: 0.25,
    };
  }
  scene.audio = emptyAudio();
  for (const [kind, seconds] of [
    ["wind", 8],
    ["shot", 0.25],
    ["blast", 0.5],
    ["step", 0.14],
    ["reload", 0.65],
    ["growl", 0.8],
    ["impact", 0.2],
    ["bell", 1.5],
  ] as const) {
    scene.audio.assets.push({ id: kind + "-wav", name: kind + ".wav", data: sound(kind, seconds) });
    scene.audio.cues.push({
      ...defaultCue(kind, kind + "-wav"),
      spatial: ["growl", "impact"].includes(kind),
      loop: kind === "wind",
      bus: kind === "wind" ? "music" : "effects",
      gainDb: kind === "wind" ? -10 : kind === "step" ? -14 : -4,
    });
  }

  scene.ui = emptyUI();
  const text = (
    id: string,
    value: string,
    anchor: UIAnchor,
    x: number,
    y: number,
    width: number,
    size = 18,
  ) => {
    const e = createUIElement("text", id, id);
    Object.assign(e, { anchor, x, y, width, height: 40, text: value });
    e.style.fontSize = size;
    e.style.color = "#e5dcc4";
    scene.ui!.elements.push(e);
    return e;
  };
  text("brand", "N I G H T F A L L   /   K E E P", "top-left", 30, 24, 500, 18);
  text("wave", "THE WOODS ARE LISTENING", "top-right", 30, 24, 380, 16).style.align = "right";
  text("health", "VITALS 100   |   STAMINA 100", "bottom-left", 30, 55, 500, 21);
  text("ammo", "WARDEN / 9mm    15 / 120", "bottom-right", 30, 55, 470, 23).style.align = "right";
  text(
    "hint",
    "WASD move · Shift sprint · R reload · 1 / 2 switch · E supplies · F torch",
    "bottom-left",
    30,
    16,
    1000,
    14,
  );
  text("crosshair", "+", "center", 0, 0, 40, 24).style.align = "center";
  text("notice", "SURVIVE UNTIL THE BELLS FALL SILENT", "center", 0, -160, 800, 24).style.align =
    "center";
  text("damage", "", "center", 0, 60, 500, 20).style.align = "center";
  text("score", "0 KILLS  /  0 POINTS", "top-left", 30, 64, 400, 14);
  const restart = createUIElement("button", "retry", "Retry");
  Object.assign(restart, {
    anchor: "center",
    x: 0,
    y: 110,
    width: 260,
    text: "Rise again",
    action: "restart",
    visible: false,
  });
  restart.style.background = "#394846";
  scene.ui.elements.push(restart);
  return parseScene(scene);
}
