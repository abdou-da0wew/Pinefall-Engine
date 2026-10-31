export function makeGlb(doc: Record<string, unknown>, bin?: Uint8Array) {
  const text = new TextEncoder().encode(JSON.stringify(doc)),
    jsonSize = Math.ceil(text.length / 4) * 4,
    binSize = bin ? Math.ceil(bin.length / 4) * 4 : 0;
  const bytes = new Uint8Array(20 + jsonSize + (bin ? 8 + binSize : 0)),
    v = new DataView(bytes.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, bytes.length, true);
  v.setUint32(12, jsonSize, true);
  v.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonSize);
  bytes.set(text, 20);
  if (bin) {
    v.setUint32(20 + jsonSize, binSize, true);
    v.setUint32(24 + jsonSize, 0x004e4942, true);
    bytes.set(bin, 28 + jsonSize);
  }
  return bytes;
}
export function triangle(offset = 0) {
  const points = new Float32Array([offset, 0, 0, 1 + offset, 0, 0, offset, 1, 0]);
  return makeGlb(
    {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: "Triangle" }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      materials: [{ name: "Paint", pbrMetallicRoughness: { baseColorFactor: [0.4, 0.8, 0.5, 1] } }],
      buffers: [{ byteLength: points.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: points.byteLength }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: "VEC3",
          min: [offset, 0, 0],
          max: [offset + 1, 1, 0],
        },
      ],
    },
    new Uint8Array(points.buffer),
  );
}
export const simpleFbx =
  ";".repeat(512) +
  "\n" +
  `; FBX 7.4.0 project file
FBXHeaderExtension:  {
  FBXHeaderVersion: 1003
  FBXVersion: 7400
}
GlobalSettings:  {
  Version: 1000
  Properties70:  {
    P: "UpAxis", "int", "Integer", "",1
    P: "UpAxisSign", "int", "Integer", "",1
    P: "UnitScaleFactor", "double", "Number", "",1
  }
}
Objects:  {
  Geometry: 1, "Geometry::Triangle", "Mesh" {
    Vertices: *9 {
      a: 0,0,0,1,0,0,0,1,0
    }
    PolygonVertexIndex: *3 {
      a: 0,1,-3
    }
  }
  Model: 2, "Model::Triangle", "Mesh" {
    Version: 232
    Properties70:  {
      P: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
      P: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0
      P: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
    }
    Shading: T
    Culling: "CullingOff"
  }
}
Connections:  {
  C: "OO",1,2
  C: "OO",2,0
}
`.replace(/^( +)/gm, (spaces) => "\t".repeat(spaces.length / 2));
export function skinnedTriangle() {
  const bin = new Uint8Array(204);
  bin.set(new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer), 0);
  bin.set(new Uint8Array(new Uint16Array(12).buffer), 36);
  bin.set(new Uint8Array(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]).buffer), 60);
  bin.set(
    new Uint8Array(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]).buffer),
    108,
  );
  bin.set(new Uint8Array(new Float32Array([0, 1]).buffer), 172);
  bin.set(new Uint8Array(new Float32Array([0, 0, 0, 0, 1, 0]).buffer), 180);
  return makeGlb(
    {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        { name: "Rig", children: [1, 2] },
        { name: "Body", mesh: 0, skin: 0 },
        { name: "Bone" },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 } }] }],
      skins: [{ joints: [2], inverseBindMatrices: 3, skeleton: 2 }],
      animations: [
        {
          name: "Lift",
          samplers: [{ input: 4, output: 5 }],
          channels: [{ sampler: 0, target: { node: 2, path: "translation" } }],
        },
      ],
      buffers: [{ byteLength: 204 }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 24 },
        { buffer: 0, byteOffset: 60, byteLength: 48 },
        { buffer: 0, byteOffset: 108, byteLength: 64 },
        { buffer: 0, byteOffset: 172, byteLength: 8 },
        { buffer: 0, byteOffset: 180, byteLength: 24 },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: "VEC3",
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
        { bufferView: 1, componentType: 5123, count: 3, type: "VEC4" },
        { bufferView: 2, componentType: 5126, count: 3, type: "VEC4" },
        { bufferView: 3, componentType: 5126, count: 1, type: "MAT4" },
        { bufferView: 4, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
        { bufferView: 5, componentType: 5126, count: 2, type: "VEC3" },
      ],
    },
    bin,
  );
}
export function texturedTriangle(png: Uint8Array) {
  const bin = new Uint8Array(60 + png.length);
  bin.set(new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer));
  bin.set(new Uint8Array(new Float32Array([0, 0, 1, 0, 0, 1]).buffer), 36);
  bin.set(png, 60);
  return makeGlb(
    {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      textures: [{ source: 0 }],
      images: [{ bufferView: 2, mimeType: "image/png" }],
      buffers: [{ byteLength: bin.length }],
      bufferViews: [
        { buffer: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 24 },
        { buffer: 0, byteOffset: 60, byteLength: png.length },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: "VEC3",
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
        { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
      ],
    },
    bin,
  );
}
/** Tiny authored binary FBX fixture; no third-party asset/licensing dependency. */
export function binaryFbx() {
  const scalar = (type: string, value: number | string) => {
    const text = typeof value === "string" ? new TextEncoder().encode(value) : undefined;
    const out = new Uint8Array(text ? 5 + text.length : type === "L" ? 9 : 5),
      v = new DataView(out.buffer);
    out[0] = type.charCodeAt(0);
    if (text) {
      v.setUint32(1, text.length, true);
      out.set(text, 5);
    } else if (type === "L") v.setBigInt64(1, BigInt(value), true);
    else v.setInt32(1, Number(value), true);
    return out;
  };
  const array = (type: string, values: number[]) => {
    const size = type === "d" ? 8 : 4,
      out = new Uint8Array(13 + values.length * size),
      v = new DataView(out.buffer);
    out[0] = type.charCodeAt(0);
    v.setUint32(1, values.length, true);
    v.setUint32(5, 0, true);
    v.setUint32(9, values.length * size, true);
    values.forEach((n, i) => {
      if (type === "d") v.setFloat64(13 + i * size, n, true);
      else v.setInt32(13 + i * size, n, true);
    });
    return out;
  };
  interface Node {
    name: string;
    props: Uint8Array[];
    children: Node[];
  }
  const n = (name: string, props: Uint8Array[] = [], children: Node[] = []): Node => ({
    name,
    props,
    children,
  });
  const roots = [
    n(
      "FBXHeaderExtension",
      [],
      [n("FBXHeaderVersion", [scalar("I", 1003)]), n("FBXVersion", [scalar("I", 7400)])],
    ),
    n(
      "Objects",
      [],
      [
        n(
          "Geometry",
          [scalar("L", 1), scalar("S", "Geometry::Triangle"), scalar("S", "Mesh")],
          [
            n("Vertices", [array("d", [0, 0, 0, 1, 0, 0, 0, 1, 0])]),
            n("PolygonVertexIndex", [array("i", [0, 1, -3])]),
          ],
        ),
        n(
          "Model",
          [scalar("L", 2), scalar("S", "Model::Triangle"), scalar("S", "Mesh")],
          [n("Version", [scalar("I", 232)])],
        ),
      ],
    ),
    n(
      "Connections",
      [],
      [
        n("C", [scalar("S", "OO"), scalar("L", 1), scalar("L", 2)]),
        n("C", [scalar("S", "OO"), scalar("L", 2), scalar("L", 0)]),
      ],
    ),
  ];
  const encode = (node: Node, start: number): Uint8Array => {
    const name = new TextEncoder().encode(node.name),
      size = node.props.reduce((s, p) => s + p.length, 0),
      parts: Uint8Array[] = [];
    let at = start + 13 + name.length + size;
    for (const child of node.children) {
      const p = encode(child, at);
      parts.push(p);
      at += p.length;
    }
    if (node.children.length) at += 13;
    const out = new Uint8Array(at - start),
      v = new DataView(out.buffer);
    v.setUint32(0, at, true);
    v.setUint32(4, node.props.length, true);
    v.setUint32(8, size, true);
    out[12] = name.length;
    out.set(name, 13);
    let offset = 13 + name.length;
    for (const p of [...node.props, ...parts]) {
      out.set(p, offset);
      offset += p.length;
    }
    return out;
  };
  let at = 27;
  const parts = roots.map((root) => {
    const data = encode(root, at);
    at += data.length;
    return data;
  });
  const out = new Uint8Array(at + 13 + 176);
  out.set(new TextEncoder().encode("Kaydara FBX Binary  \0\x1a\0"));
  new DataView(out.buffer).setUint32(23, 7400, true);
  at = 27;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
export const texturedFbx = simpleFbx
  .replace(
    "\t\tPolygonVertexIndex:",
    `\t\tLayerElementUV: 0 {
\t\t\tVersion: 101
\t\t\tName: "UVMap"
\t\t\tMappingInformationType: "ByPolygonVertex"
\t\t\tReferenceInformationType: "IndexToDirect"
\t\t\tUV: *6 {
\t\t\t\ta: 0,0,1,0,0,1
\t\t\t}
\t\t\tUVIndex: *3 {
\t\t\t\ta: 0,1,2
\t\t\t}
\t\t}
\t\tPolygonVertexIndex:`,
  )
  .replace(
    "\n}\nConnections:",
    `
\tMaterial: 5, "Material::Paint", "" {
\t\tVersion: 102
\t\tShadingModel: "phong"
\t\tProperties70:  {
\t\t\tP: "DiffuseColor", "Color", "", "A",1,1,1
\t\t}
\t}
\tVideo: 3, "Video::Albedo", "Clip" {
\t\tType: "Clip"
\t\tFilename: "albedo.png"
\t\tRelativeFilename: "albedo.png"
\t}
\tTexture: 4, "Texture::Albedo", "" {
\t\tType: "TextureVideoClip"
\t\tFileName: "albedo.png"
\t\tRelativeFilename: "albedo.png"
\t}
}
Connections:`,
  )
  .replace(
    '\tC: "OO",2,0',
    `\tC: "OO",2,0
\tC: "OO",5,2
\tC: "OP",4,5,"DiffuseColor"
\tC: "OO",3,4`,
  );
