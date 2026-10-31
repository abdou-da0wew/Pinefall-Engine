import * as T from "three";
/** Incremental equivalent of SkeletonUtils.clone for imported model trees. Shared geometry,
 * textures and clips stay borrowed; only the new skeletons belong to this instance. */
export async function cloneModel(root: T.Object3D, signal: AbortSignal): Promise<T.Object3D> {
  const map = new Map<T.Object3D, T.Object3D>(),
    skeletons = new Set<T.Skeleton>();
  const stack: { source: T.Object3D; parent?: T.Object3D }[] = [{ source: root }];
  let result: T.Object3D | undefined,
    slice = performance.now();
  const checkpoint = async () => {
    signal.throwIfAborted();
    if (performance.now() - slice >= 2) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      slice = performance.now();
      signal.throwIfAborted();
    }
  };
  try {
    while (stack.length) {
      await checkpoint();
      const { source, parent } = stack.pop()!,
        copy = source.clone(false);
      map.set(source, copy);
      if (parent) parent.add(copy);
      else result = copy;
      for (let i = source.children.length - 1; i >= 0; i--)
        stack.push({ source: source.children[i], parent: copy });
    }
    for (const [source, copy] of map) {
      if (source instanceof T.SkinnedMesh && copy instanceof T.SkinnedMesh) {
        const bones = source.skeleton.bones.map((bone) => {
          const mapped = map.get(bone);
          if (!(mapped instanceof T.Bone))
            throw Error("Skeleton joint outside imported model tree");
          return mapped;
        });
        const skeleton = source.skeleton.clone();
        skeletons.add(skeleton);
        skeleton.bones = bones;
        copy.bindMatrix.copy(source.bindMatrix);
        copy.bind(skeleton, copy.bindMatrix);
      }
      await checkpoint();
    }
    signal.throwIfAborted();
    return result!;
  } catch (error) {
    for (const skeleton of skeletons) skeleton.dispose();
    throw error;
  }
}
