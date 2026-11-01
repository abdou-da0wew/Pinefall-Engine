import * as T from "three";
/** Drop renderer disposal listeners/handles while the context is lost, retaining CPU source data.
 * Otherwise a later material/model replacement can ask restored WebGL to delete old-context handles. */
export function invalidateObjectGPU(root: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  root.traverse((object) => {
    const rendered = object as T.Object3D & {
      geometry?: T.BufferGeometry;
      material?: T.Material | T.Material[];
    };
    if (rendered.geometry) geometries.add(rendered.geometry);
    if (rendered.material)
      for (const material of Array.isArray(rendered.material)
        ? rendered.material
        : [rendered.material])
        materials.add(material);
    if (object instanceof T.SkinnedMesh && object.skeleton.boneTexture)
      textures.add(object.skeleton.boneTexture);
    if (object instanceof T.Light && "shadow" in object) {
      const shadow = (object as T.DirectionalLight | T.PointLight | T.SpotLight).shadow;
      shadow.dispose();
      shadow.map = null;
      shadow.mapPass = null;
      shadow.needsUpdate = true;
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material))
      if (value instanceof T.Texture) textures.add(value);
    if (material instanceof T.ShaderMaterial)
      for (const uniform of Object.values(material.uniforms))
        if (uniform.value instanceof T.Texture) textures.add(uniform.value);
    material.dispose();
    material.needsUpdate = true;
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) {
    texture.dispose();
    texture.needsUpdate = true;
  }
}
