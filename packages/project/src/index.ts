import { MODEL_BYTES } from "../../assets/src/limits";
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
export { inspectGlb } from "../../assets/src/glb";
import { inspectGlb } from "../../assets/src/glb";
export function validateGlb(bytes: Uint8Array) {
  inspectGlb(bytes);
}
export function importModel(
  scene: SceneDocument,
  name: string,
  bytes: Uint8Array,
): { scene: SceneDocument; asset: Asset } {
  if (bytes.length > MODEL_BYTES) throw Error("Maximum model size is 200 MB");
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
