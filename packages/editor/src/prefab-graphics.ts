import { emptyGraphics, type Surface } from "../../runtime/src/graphics-definition";
import type { SceneDocument, Entity } from "../../runtime/src/schema";
export function mergePrefabGraphics(destination: SceneDocument, source: SceneDocument) {
  const images = new Map<string, string>(),
    materials = new Map<string, string>(),
    shaders = new Map<string, string>();
  if (source.graphics) {
    destination.graphics ??= emptyGraphics();
    for (const image of source.graphics.images ?? []) {
      destination.graphics.images ??= [];
      const existing = destination.graphics.images.find(
        (candidate) =>
          candidate.data === image.data &&
          candidate.format === image.format &&
          candidate.width === image.width &&
          candidate.height === image.height,
      );
      const id = existing?.id ?? crypto.randomUUID();
      images.set(image.id, id);
      if (!existing) destination.graphics.images.push({ ...image, id });
    }
  }
  const surface = (value: Surface) => {
    const copy = structuredClone(value);
    for (const binding of Object.values(copy.maps ?? {})) {
      const id = images.get(binding.image);
      if (!id) throw Error("Prefab image binding missing");
      binding.image = id;
    }
    return copy;
  };
  for (const material of source.graphics?.materials ?? []) {
    const id = crypto.randomUUID();
    materials.set(material.id, id);
    destination.graphics!.materials.push({ ...surface(material), id, name: material.name });
  }
  for (const shader of source.graphics?.shaders ?? []) {
    destination.graphics!.shaders ??= [];
    const id = crypto.randomUUID();
    shaders.set(shader.id, id);
    destination.graphics!.shaders.push({ ...structuredClone(shader), id });
  }
  return (entity: Entity) => {
    const mesh = entity.mesh;
    if (!mesh) return;
    if (mesh.material) mesh.material = materials.get(mesh.material)!;
    if (mesh.shader) mesh.shader = shaders.get(mesh.shader)!;
    if (mesh.surface) mesh.surface = surface(mesh.surface);
    for (const slot of mesh.slots ?? []) {
      if (slot.material) slot.material = materials.get(slot.material)!;
      if (slot.surface) slot.surface = surface(slot.surface);
    }
  };
}
