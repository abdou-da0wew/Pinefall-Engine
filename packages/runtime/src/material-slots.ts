import * as T from "three";
import type { Surface } from "./graphics-definition";
export interface MaterialSlotBinding {
  key: string;
  source: string;
  material?: string;
  surface?: Surface;
}
export interface MaterialSlotInfo {
  key: string;
  name: string;
  uv0: boolean;
  uv1: boolean;
  vertices: number;
}
export function materialSlots(root: T.Object3D, entityId: string) {
  const slots: Array<MaterialSlotInfo & { mesh: T.Mesh; index: number }> = [];
  const visit = (object: T.Object3D, path: string) => {
    if (
      object instanceof T.Mesh &&
      !object.userData.volume &&
      object.userData.entityId === entityId
    ) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      object.userData.pinefallSlotNames ??= materials.map((m) => m.name || "Material");
      object.userData.pinefallSlotCount ??= materials.length;
      for (let index = 0; index < object.userData.pinefallSlotCount; index++)
        slots.push({
          key: path + ":" + index,
          name: `${object.name || "Mesh"} / ${object.userData.pinefallSlotNames[index]} (${index})`,
          uv0: !!object.geometry.getAttribute("uv"),
          uv1: !!object.geometry.getAttribute("uv1"),
          vertices: object.geometry.getAttribute("position")?.count ?? 0,
          mesh: object,
          index,
        });
    }
    object.children.forEach((child, index) => {
      visit(child, path ? path + "/" + index : String(index));
    });
  };
  visit(root, "");
  return slots;
}

export interface UVInspection {
  triangles: Float32Array;
  totalTriangles: number;
  truncated: boolean;
  bounds: [number, number, number, number];
}
/** Explicit editor inspection: at most 4096 triangles, never a copy of the full model inventory. */
export function inspectSlotUV(
  root: T.Object3D,
  entityId: string,
  key: string,
  channel: 0 | 1,
): UVInspection {
  const slot = materialSlots(root, entityId).find((slot) => slot.key === key);
  if (!slot) throw Error("Choose an existing material slot to inspect");
  const geometry = slot.mesh.geometry,
    uv = geometry.getAttribute(channel === 0 ? "uv" : "uv1");
  if (!uv) throw Error("UV" + channel + " does not exist on this material slot");
  const index = geometry.index,
    count = index?.count ?? uv.count;
  const ranges =
    slot.mesh.userData.pinefallSlotCount > 1 && geometry.groups.length
      ? geometry.groups.filter((group) => group.materialIndex === slot.index)
      : [{ start: 0, count }];
  const totalTriangles = ranges.reduce((sum, range) => sum + Math.floor(range.count / 3), 0),
    triangles: number[] = [];
  let minU = Infinity,
    minV = Infinity,
    maxU = -Infinity,
    maxV = -Infinity;
  for (const range of ranges) {
    for (
      let offset = range.start;
      offset + 2 < Math.min(count, range.start + range.count) && triangles.length < 4096 * 6;
      offset += 3
    ) {
      for (let vertex = 0; vertex < 3; vertex++) {
        const at = index ? index.getX(offset + vertex) : offset + vertex,
          u = uv.getX(at),
          v = uv.getY(at);
        if (!Number.isFinite(u) || !Number.isFinite(v) || Math.abs(u) > 1e9 || Math.abs(v) > 1e9)
          throw Error("Invalid/extreme UV coordinates");
        triangles.push(u, v);
        minU = Math.min(minU, u);
        minV = Math.min(minV, v);
        maxU = Math.max(maxU, u);
        maxV = Math.max(maxV, v);
      }
    }
  }
  return {
    triangles: new Float32Array(triangles),
    totalTriangles,
    truncated: triangles.length / 6 < totalTriangles,
    bounds: triangles.length ? [minU, minV, maxU, maxV] : [0, 0, 1, 1],
  };
}
