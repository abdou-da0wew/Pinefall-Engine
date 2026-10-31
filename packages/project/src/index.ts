import { entity, parseScene, cloneScene } from "../../runtime/src/schema";
import type { SceneDocument, Asset } from "../../runtime/src/schema";
export function createGame(name: string): SceneDocument {
  const floor = entity("Ground", "box", [0, -0.5, 0], [40, 1, 40], "#667c60");
  floor.physics = {
    type: "fixed",
    shape: "box",
    mass: 1,
    friction: 0.7,
    restitution: 0,
    sensor: false,
  };
  const player = entity("Player", "capsule", [0, 1, 6], [1, 1, 1], "#b9d9be");
  player.tag = "player";
  player.behavior = "character";
  player.physics = {
    type: "kinematic",
    shape: "capsule",
    mass: 75,
    friction: 0.5,
    restitution: 0,
    sensor: false,
  };
  return parseScene({
    version: 1,
    name,
    template: "adventure",
    entities: [floor, player],
    assets: [],
    environment: {
      background: "#263c44",
      fog: "#263c44",
      fogNear: 30,
      fogFar: 100,
      sun: 2,
      gravity: -9.81,
    },
  });
}
/** Validate a self-contained GLB before it reaches a browser or the project database. */
export function validateGlb(bytes: Uint8Array) {
  if (bytes.byteLength < 20) throw Error("GLB is truncated");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    v.getUint32(0, true) !== 0x46546c67 ||
    v.getUint32(4, true) !== 2 ||
    v.getUint32(8, true) !== bytes.byteLength
  )
    throw Error("Expected a complete GLB 2.0 file");
  const length = v.getUint32(12, true);
  if (v.getUint32(16, true) !== 0x4e4f534a || length % 4 || length + 20 > bytes.byteLength)
    throw Error("Invalid GLB JSON chunk");
  const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  if (!doc || doc.asset?.version !== "2.0") throw Error("Missing glTF 2.0 asset metadata");
  for (const key of ["buffers", "images"])
    for (const item of doc[key] || [])
      if (item.uri !== undefined && !(typeof item.uri === "string" && item.uri.startsWith("data:")))
        throw Error("External resources are unsupported: embed textures and buffers in GLB");
  if (
    doc.extensionsRequired?.some((name: string) =>
      ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"].includes(
        name,
      ),
    )
  )
    throw Error("Compressed GLB requires a decoder; export without Draco, Meshopt or KTX2");
  let offset = 20 + length;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw Error("Truncated GLB chunk");
    const n = v.getUint32(offset, true);
    if (n % 4 || offset + 8 + n > bytes.length) throw Error("Invalid GLB chunk length");
    offset += 8 + n;
  }
}
export function importModel(
  scene: SceneDocument,
  name: string,
  bytes: Uint8Array,
): { scene: SceneDocument; asset: Asset } {
  if (bytes.length > 2_000_000) throw Error("Maximum model size is 2 MB");
  validateGlb(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const data = "data:model/gltf-binary;base64," + btoa(binary),
    next = cloneScene(scene);
  const existing = next.assets.find((a) => a.data === data);
  if (existing) return { scene: next, asset: existing };
  const asset = { id: crypto.randomUUID(), name, data };
  next.assets.push(asset);
  return { scene: parseScene(next), asset };
}
export function placeModel(scene: SceneDocument, assetId: string, name?: string) {
  const next = cloneScene(scene),
    asset = next.assets.find((a) => a.id === assetId);
  if (!asset) throw Error("Asset not found");
  const item = entity(name || asset.name, "asset");
  item.mesh!.asset = assetId;
  next.entities.push(item);
  return { scene: parseScene(next), entity: item };
}
