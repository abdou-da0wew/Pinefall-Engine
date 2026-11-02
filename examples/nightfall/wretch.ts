import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeGlb } from "./glb";
/** Original elongated creature with horns, exposed ribs and talons; in-place skeletal clips. */
export function wretchRig() {
  const joints = [
    { name: "Hips", p: [0, 0, 0], size: [0.34, 0.32, 0.22], offset: 0 },
    { name: "Chest", p: [0, 0.35, 0], size: [0.5, 0.57, 0.23], offset: 0 },
    { name: "Head", p: [0, 0.84, -0.1], size: [0.24, 0.39, 0.26], offset: 0 },
    { name: "LeftArm", p: [-0.34, 0.35, 0], size: [0.13, 0.85, 0.12], offset: -0.42 },
    { name: "RightArm", p: [0.34, 0.35, 0], size: [0.13, 0.85, 0.12], offset: -0.42 },
    { name: "LeftLeg", p: [-0.13, -0.2, 0], size: [0.16, 0.85, 0.17], offset: -0.42 },
    { name: "RightLeg", p: [0.13, -0.2, 0], size: [0.16, 0.85, 0.17], offset: -0.42 },
  ];
  const position: number[] = [],
    normal: number[] = [],
    indices: number[] = [],
    weights: number[] = [],
    colors: number[] = [];
  for (const [i, joint] of joints.entries()) {
    let box = new T.SphereGeometry(0.5, 10, 8)
      .scale(...(joint.size as [number, number, number]))
      .toNonIndexed();
    if (i >= 3) box = new T.CapsuleGeometry(i >= 5 ? 0.07 : 0.055, 0.73, 4, 8).toNonIndexed();
    const extras: T.BufferGeometry[] = [box];
    if (i === 1) {
      extras.push(new T.CapsuleGeometry(0.045, 0.58, 3, 8).rotateZ(Math.PI / 2).toNonIndexed());
      extras.push(
        new T.CylinderGeometry(0.055, 0.075, 0.22, 8).translate(0, 0.33, -0.03).toNonIndexed(),
      );
    }

    if (i === 2) {
      for (const sign of [-1, 1])
        extras.push(
          new T.ConeGeometry(0.045, 0.32, 5)
            .rotateZ(sign * 0.4)
            .translate(sign * 0.12, 0.22, 0)
            .toNonIndexed(),
        );
      for (const sign of [-1, 1])
        extras.push(
          new T.SphereGeometry(0.035, 6, 4).translate(sign * 0.065, 0, -0.135).toNonIndexed(),
        );
    }
    if (i === 3 || i === 4) {
      for (let finger = 0; finger < 4; finger++)
        extras.push(
          new T.ConeGeometry(0.019, 0.3, 5)
            .rotateX(Math.PI)
            .translate((finger - 1.5) * 0.037, -0.5, -0.035)
            .toNonIndexed(),
        );
    }
    if (i === 1) {
      for (let rib = 0; rib < 5; rib++)
        extras.push(
          new T.TorusGeometry(0.19 - rib * 0.015, 0.018, 4, 10, Math.PI)
            .rotateX(-Math.PI / 2)
            .translate(0, 0.15 - rib * 0.065, -0.13)
            .toNonIndexed(),
        );
    }
    box = mergeGeometries(extras);
    const p = box.getAttribute("position"),
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
      const eye =
        i === 2 &&
        p.getZ(v) < -0.125 &&
        Math.abs(p.getX(v)) > 0.025 &&
        Math.abs(p.getX(v)) < 0.1 &&
        Math.abs(p.getY(v)) < 0.045;
      const rib = i === 1 && p.getZ(v) < -0.15;
      const scar = Math.sin(p.getY(v) * 60 + p.getX(v) * 31) > 0.75 && p.getZ(v) < -0.07;
      colors.push(
        ...(eye
          ? [0.7, 0.025, 0.012]
          : rib
            ? [0.5, 0.43, 0.3]
            : scar
              ? [0.16, 0.05, 0.04]
              : i === 2
                ? [0.36, 0.34, 0.25]
                : i >= 5
                  ? [0.09, 0.12, 0.1]
                  : [0.16, 0.2, 0.15]),
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
        values: times.flatMap((_, i) => [0, i % 2 === 0 ? -0.05 : 0, 0]),
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
    animation("Death", [
      { ...idle, times: [0, 0.5] },
      { node: 2, path: "rotation", times: [0, 0.5], values: angles("x", [0, -Math.PI / 2]) },
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
      asset: { version: "2.0", generator: "Nightfall Keep original rigid-weighted Wretch" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        { name: "Wretch", children: [1, 2] },
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
