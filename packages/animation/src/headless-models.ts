import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import * as T from "three";
import { inspectGlb, fromDataURI } from "../../assets/src/glb";
import { encodeModel, disposeModel } from "../../assets/src/wire";
import { assetMemory, type Reservation } from "../../assets/src/budget";
/** Keep the exact glTF node/skin/morph/animation mathematical path, omitting presentation-only textures.
 * This is not a second converter: BIN/accessors/tracks remain unchanged and GLTFLoader still interprets them. */
function poseGlb(bytes: Uint8Array) {
  inspectGlb(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    length = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  delete json.images;
  delete json.textures;
  delete json.materials;
  for (const mesh of json.meshes || [])
    for (const primitive of mesh.primitives || []) delete primitive.material;
  const text = new TextEncoder().encode(JSON.stringify(json)),
    padded = Math.ceil(text.length / 4) * 4,
    tail = bytes.subarray(20 + length),
    result = new Uint8Array(20 + padded + tail.length),
    header = new DataView(result.buffer);
  result.set(bytes.subarray(0, 12));
  header.setUint32(8, result.length, true);
  header.setUint32(12, padded, true);
  header.setUint32(16, 0x4e4f534a, true);
  result.fill(32, 20, 20 + padded);
  result.set(text, 20);
  result.set(tail, 20 + padded);
  return result.buffer;
}
export class HeadlessModels {
  private instances = new Map<T.Object3D, Reservation>();
  private roots = new Map<
    string,
    { root: T.Object3D; reservation: Reservation; instanceBytes: number }
  >();
  async prepare(id: string, data: string) {
    if (this.roots.has(id)) return;
    const reservation = assetMemory.reserve(160 * 1024 * 1024, "headless-model");
    let root: T.Object3D | undefined;
    try {
      const gltf = await new GLTFLoader().parseAsync(poseGlb(fromDataURI(data)), "");
      root = gltf.scene;
      root.animations = gltf.animations;
      const wire = encodeModel(root);
      let instanceBytes = 0;
      root.traverse((o) => {
        instanceBytes += 2048 + JSON.stringify(o.userData).length * 2;
        if (o instanceof T.SkinnedMesh) instanceBytes += o.skeleton.bones.length * 256;
      });
      reservation.resize(wire.bytes * 2 + instanceBytes);
      this.roots.set(id, { root, reservation, instanceBytes });
    } catch (error) {
      if (root) disposeModel(root);
      reservation.release();
      throw error;
    }
  }
  acquire(id: string) {
    const entry = this.roots.get(id);
    if (!entry) throw Error("Headless animation model was not prepared");
    const reservation = assetMemory.reserve(entry.instanceBytes, "headless-instance");
    try {
      const root = clone(entry.root);
      this.instances.set(root, reservation);
      return root;
    } catch (error) {
      reservation.release();
      throw error;
    }
  }
  release(root: T.Object3D) {
    const reservation = this.instances.get(root);
    if (!reservation) return;
    this.instances.delete(root);
    reservation.release();
    const skeletons = new Set<T.Skeleton>();
    root.traverse((o) => {
      if (o instanceof T.SkinnedMesh) skeletons.add(o.skeleton);
    });
    for (const skeleton of skeletons) skeleton.dispose();
    root.removeFromParent();
  }
  dispose() {
    for (const root of [...this.instances.keys()]) this.release(root);
    for (const entry of this.roots.values()) {
      disposeModel(entry.root);
      entry.reservation.release();
    }
    this.roots.clear();
  }
}
