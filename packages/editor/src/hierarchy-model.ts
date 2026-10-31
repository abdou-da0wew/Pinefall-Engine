import { Matrix4, Vector3, Quaternion, Euler, MathUtils } from "three";
import { parseScene } from "../../runtime/src/schema";
import type { SceneDocument, Vec3 } from "../../runtime/src/schema";
export function parentOf(scene: SceneDocument, id: string) {
  const c = scene.collections?.find((c) => c.id === id);
  if (c) return c.parent;
  const e = scene.entities.find((e) => e.id === id);
  return e?.parent || e?.collection;
}
export function descendants(scene: SceneDocument, ids: string[]) {
  const result = new Set(ids);
  let added = true;
  while (added) {
    added = false;
    for (const id of [
      ...scene.entities.map((e) => e.id),
      ...(scene.collections || []).map((c) => c.id),
    ]) {
      const parent = parentOf(scene, id);
      if (parent && result.has(parent) && !result.has(id)) {
        result.add(id);
        added = true;
      }
    }
  }
  return result;
}
function worldMatrix(scene: SceneDocument, id: string): Matrix4 {
  const e = scene.entities.find((e) => e.id === id)!;
  const t = e.transform;
  const matrix = new Matrix4().compose(
    new Vector3(...t.position),
    new Quaternion().setFromEuler(new Euler(...(t.rotation.map(MathUtils.degToRad) as Vec3))),
    new Vector3(...t.scale),
  );
  return e.parent ? worldMatrix(scene, e.parent).multiply(matrix) : matrix;
}
/** Preserve world pose; reject sheared transforms rather than silently deforming assets. */
export function moveNodes(scene: SceneDocument, ids: string[], target: string | null) {
  const selected = new Set(ids),
    roots = ids.filter((id) => {
      let p = parentOf(scene, id);
      while (p) {
        if (selected.has(p)) return false;
        p = parentOf(scene, p);
      }
      return true;
    });
  if (target && descendants(scene, roots).has(target))
    throw Error("Cannot parent an item under itself or its descendants");
  const folder = target && scene.collections?.find((c) => c.id === target),
    object = target && scene.entities.find((e) => e.id === target);
  if (target && !folder && !object) throw Error("Drop target no longer exists");
  for (const id of roots) {
    const collection = scene.collections?.find((c) => c.id === id);
    if (collection) {
      if (object) throw Error("Collections can be nested in collections, not transform objects");
      collection.parent = target || undefined;
      continue;
    }
    const e = scene.entities.find((e) => e.id === id);
    if (!e) continue;
    if (object && e.physics)
      throw Error(
        "Physics bodies must stay transform roots. Drop into a collection to organize them instead.",
      );
    if (e.parent !== (object ? object.id : undefined)) {
      const world = worldMatrix(scene, id),
        local = object ? worldMatrix(scene, object.id).invert().multiply(world) : world;
      const pos = new Vector3(),
        q = new Quaternion(),
        scale = new Vector3();
      local.decompose(pos, q, scale);
      const check = new Matrix4().compose(pos, q, scale);
      if (check.elements.some((n, i) => Math.abs(n - local.elements[i]) > 1e-5))
        throw Error(
          "This parent would introduce shear. Use a collection or uniform parent scaling.",
        );
      e.transform = {
        position: pos.toArray() as Vec3,
        rotation: new Euler()
          .setFromQuaternion(q)
          .toArray()
          .slice(0, 3)
          .map((n) => MathUtils.radToDeg(Number(n)) || 0) as Vec3,
        scale: scale.toArray() as Vec3,
      };
    }
    if (object) e.parent = object.id;
    else delete e.parent;
    if (folder) e.collection = folder.id;
    else delete e.collection;
  }
  parseScene(scene);
}
export function deleteNodes(scene: SceneDocument, ids: string[]) {
  const all = descendants(scene, ids);
  scene.entities = scene.entities.filter((e) => !all.has(e.id));
  scene.collections = scene.collections?.filter((c) => !all.has(c.id));
}
export function duplicateNodes(scene: SceneDocument, ids: string[]) {
  const all = descendants(scene, ids),
    map = new Map([...all].map((id) => [id, crypto.randomUUID()]));
  const entities = scene.entities
    .filter((e) => all.has(e.id))
    .map((e) => {
      const copy = structuredClone(e);
      copy.id = map.get(e.id)!;
      copy.name += " copy";
      copy.parent = e.parent ? map.get(e.parent) || e.parent : undefined;
      copy.collection = e.collection ? map.get(e.collection) || e.collection : undefined;
      if (!e.parent || !all.has(e.parent)) copy.transform.position[0] += 2;
      return copy;
    });
  const collections = (scene.collections || [])
    .filter((c) => all.has(c.id))
    .map((c) => ({
      ...c,
      id: map.get(c.id)!,
      name: c.name + " copy",
      parent: c.parent ? map.get(c.parent) || c.parent : undefined,
    }));
  scene.entities.push(...entities);
  scene.collections ??= [];
  scene.collections.push(...collections);
  parseScene(scene);
  return ids.map((id) => map.get(id)!);
}
