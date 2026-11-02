import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeGlb } from "./glb";
import { seeded } from "./scripts/Rules";
export function colored(g: T.BufferGeometry, color: string) {
  const geometry = g.index ? g.toNonIndexed() : g;
  const c = new T.Color(color),
    n = geometry.getAttribute("position").count;
  geometry.setAttribute(
    "color",
    new T.Float32BufferAttribute(Array.from({ length: n }, () => c.toArray()).flat(), 3),
  );
  geometry.deleteAttribute("uv");
  return geometry;
}
/** Sector meshes remain individually frustum-cullable inside one imported GLB. */
export function geometryGlb(parts: { name: string; geometry: T.BufferGeometry }[]) {
  const views: Record<string, unknown>[] = [],
    accessors: Record<string, unknown>[] = [],
    buffers: Uint8Array[] = [];
  let length = 0;
  const meshes = parts.map(({ geometry }) => {
    geometry.computeBoundingBox();
    const attributes: Record<string, number> = {};
    for (const [name, key] of [
      ["position", "POSITION"],
      ["normal", "NORMAL"],
      ["color", "COLOR_0"],
    ]) {
      const attr = geometry.getAttribute(name),
        data = new Float32Array(attr.array),
        bytes = new Uint8Array(data.buffer);
      attributes[key] = accessors.length;
      views.push({ buffer: 0, byteOffset: length, byteLength: bytes.length });
      accessors.push({
        bufferView: views.length - 1,
        componentType: 5126,
        count: attr.count,
        type: "VEC3",
        ...(name === "position"
          ? { min: geometry.boundingBox!.min.toArray(), max: geometry.boundingBox!.max.toArray() }
          : {}),
      });
      buffers.push(bytes);
      length += bytes.length;
    }
    return { primitives: [{ attributes, material: 0 }] };
  });
  const bin = new Uint8Array(length);
  let at = 0;
  for (const b of buffers) {
    bin.set(b, at);
    at += b.length;
  }
  return makeGlb(
    {
      asset: { version: "2.0", generator: "Nightfall Keep original procedural scenery" },
      scene: 0,
      scenes: [{ nodes: parts.map((_, i) => i) }],
      nodes: parts.map((p, i) => ({ name: p.name, mesh: i })),
      meshes,
      materials: [
        {
          name: "Weathered vertex color",
          pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.94 },
        },
      ],
      buffers: [{ byteLength: length }],
      bufferViews: views,
      accessors,
    },
    bin,
  );
}
export function forest() {
  const random = seeded(7113),
    sectors = Array.from({ length: 16 }, () => [] as T.BufferGeometry[]),
    trunks: [number, number, number][] = [];
  const add = (g: T.BufferGeometry, c: string, x: number, z: number) => {
    sectors[
      Math.min(3, Math.max(0, Math.floor((z + 80) / 40))) * 4 +
        Math.min(3, Math.max(0, Math.floor((x + 80) / 40)))
    ].push(colored(g, c));
  };
  for (let i = 0; i < 230; i++) {
    const x = (random() - 0.5) * 150,
      z = (random() - 0.5) * 150;
    if (
      (Math.abs(x) < 26 && z < 9 && z > -57) ||
      (Math.abs(x) < 5 && z > 0) ||
      Math.hypot(x - 35, z - 20) < 10
    )
      continue;
    const h = 7 + random() * 10,
      r = 0.18 + random() * 0.18;
    trunks.push([x, z, r]);
    add(new T.CylinderGeometry(r * 0.5, r, h, 7).translate(x, h / 2, z), "#514b3a", x, z);
    for (let tier = 0; tier < 4; tier++) {
      const height = h * (0.4 + tier * 0.16),
        width = (h - height) * 0.35 + 0.6;
      add(
        new T.ConeGeometry(width, 4, 9).rotateY(random() * 6).translate(x, height, z),
        tier % 2 ? "#293e37" : "#344d43",
        x,
        z,
      );
    }
    for (let branch = 0; branch < 3; branch++)
      add(
        new T.CylinderGeometry(0.04, 0.09, 2, 5)
          .rotateZ(1.1)
          .rotateY(branch * 2.1)
          .translate(x, 0.5 + branch * 0.9, z),
        "#474839",
        x,
        z,
      );
  }
  for (let i = 0; i < 650; i++) {
    const x = (random() - 0.5) * 150,
      z = (random() - 0.5) * 150;
    if (Math.abs(x) < 24 && z < 4 && z > -54) continue;
    const h = 0.2 + random() * 0.5;
    for (let j = 0; j < 3; j++)
      add(
        new T.ConeGeometry(0.12, h, 3)
          .rotateZ((random() - 0.5) * 0.6)
          .translate(x + j * 0.12, h / 2, z),
        "#586449",
        x,
        z,
      );
  }
  for (let i = 0; i < 85; i++) {
    const x = (random() - 0.5) * 150,
      z = (random() - 0.5) * 150;
    if (Math.abs(x) < 26 && z < 10 && z > -58) continue;
    const r = 0.3 + random() * 0.8;
    add(
      new T.IcosahedronGeometry(r, 0).scale(1, 0.65, 1.3).translate(x, r * 0.35, z),
      "#626b62",
      x,
      z,
    );
  }
  return {
    trunks,
    bytes: geometryGlb(
      sectors.map((parts, i) => ({ name: "Forest sector " + i, geometry: mergeGeometries(parts) })),
    ),
  };
}
export function weaponModel(shotgun: boolean) {
  const parts: T.BufferGeometry[] = [];
  const add = (g: T.BufferGeometry, c: string) => parts.push(colored(g, c));
  add(new T.BoxGeometry(0.105, 0.12, shotgun ? 0.56 : 0.25).translate(0, 0, -0.11), "#444e50");
  add(
    new T.CylinderGeometry(0.027, 0.03, shotgun ? 0.72 : 0.3, 12)
      .rotateX(Math.PI / 2)
      .translate(0, 0.035, shotgun ? -0.3 : -0.16),
    "#1d272b",
  );
  if (shotgun)
    add(
      new T.CylinderGeometry(0.024, 0.024, 0.48, 10)
        .rotateX(Math.PI / 2)
        .translate(0, -0.025, -0.3),
      "#63645a",
    );
  add(new T.BoxGeometry(0.08, 0.2, 0.11).rotateX(-0.23).translate(0, -0.13, 0.02), "#3a3027");
  add(
    new T.BoxGeometry(0.09, 0.07, shotgun ? 0.22 : 0.09).translate(
      0,
      -0.065,
      shotgun ? -0.28 : -0.06,
    ),
    "#725c3c",
  );
  for (let i = 0; i < 7; i++)
    for (const x of [-0.054, 0.054])
      add(new T.BoxGeometry(0.008, 0.045, 0.012).translate(x, 0.012, 0.015 - i * 0.024), "#87918a");
  add(new T.BoxGeometry(0.025, 0.028, 0.055).translate(0.055, -0.01, -0.09), "#a6a58b");
  for (let i = 0; i < 4; i++)
    add(
      new T.BoxGeometry(0.083, 0.008, 0.09).rotateX(-0.23).translate(0, -0.08 - i * 0.03, 0.02),
      "#675944",
    );
  for (const z of [-0.23, 0.025])
    add(new T.BoxGeometry(0.025, 0.035, 0.025).translate(0, 0.085, z), "#a5aaa0");
  add(
    new T.TorusGeometry(0.06, 0.009, 5, 12, Math.PI)
      .rotateY(Math.PI / 2)
      .translate(0, -0.1, -0.055),
    "#333b39",
  );
  add(new T.SphereGeometry(0.065, 8, 6).scale(1, 1.4, 1).translate(0.015, -0.13, 0.07), "#716e57");
  add(
    new T.CylinderGeometry(0.055, 0.075, 0.32, 8).rotateX(-0.65).translate(0.07, -0.25, 0.19),
    "#303e36",
  );
  if (shotgun) {
    add(new T.SphereGeometry(0.065, 8, 6).translate(-0.015, -0.08, -0.25), "#716e57");
    add(
      new T.CylinderGeometry(0.055, 0.075, 0.35, 8).rotateX(1).translate(-0.08, -0.21, -0.16),
      "#303e36",
    );
  }
  return geometryGlb([
    {
      name: shotgun ? "Reliquary pump shotgun" : "Warden service pistol",
      geometry: mergeGeometries(parts),
    },
  ]);
}
