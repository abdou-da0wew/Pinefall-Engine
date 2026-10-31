import { RootMotion } from "./root-motion";
import { assetMemory, type Reservation } from "../../assets/src/budget";
import * as T from "three";
import { AnimationGraph, type GraphFrame } from "./graph";
import { bindAnimationClips } from "./bindings";
import type { AnimatorDefinition } from "./definition";
import type { AssetImport } from "../../assets/src/record";
interface Pose {
  node: T.Object3D;
  position: T.Vector3;
  quaternion: T.Quaternion;
  scale: T.Vector3;
  morph?: number[];
}
/** Interrupted fades freeze the actually evaluated source pose, not the old state's nominal clip. */
export class AnimationGraphPlayer {
  readonly graph: AnimationGraph;
  rootMotion?: RootMotion;
  private mixer: T.AnimationMixer;
  private clips: Map<string, T.AnimationClip>;
  private rest: Pose[];
  private frozen: Pose[] = [];
  private token = -1;
  private dead = false;
  private reservation: Reservation;
  constructor(
    readonly root: T.Object3D,
    definition: AnimatorDefinition,
    metadata: AssetImport,
  ) {
    this.graph = new AnimationGraph(definition);
    this.clips = bindAnimationClips(this.graph.definition, metadata, root.animations, root);
    let nodes = 0;
    root.traverse(() => nodes++);
    this.reservation = assetMemory.reserve(
      nodes * 512 + [...this.clips.values()].reduce((n, c) => n + c.tracks.length * 512 + 1024, 0),
      "animation-instance",
    );
    this.mixer = new T.AnimationMixer(root);
    this.rest = [];
    try {
      this.rest = this.capture();
      if (this.graph.definition.rootMotion)
        this.rootMotion = new RootMotion(root, this.graph.definition, this.clips);
      this.sample();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  private capture() {
    const poses: Pose[] = [];
    this.root.traverse((node) =>
      poses.push({
        node,
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
        ...(node instanceof T.Mesh && node.morphTargetInfluences
          ? { morph: [...node.morphTargetInfluences] }
          : {}),
      }),
    );
    return poses;
  }
  private restore(poses: Pose[]) {
    for (const pose of poses) {
      pose.node.position.copy(pose.position);
      pose.node.quaternion.copy(pose.quaternion);
      pose.node.scale.copy(pose.scale);
      if (pose.morph && pose.node instanceof T.Mesh)
        pose.node.morphTargetInfluences!.splice(0, pose.morph.length, ...pose.morph);
    }
  }
  get stats() {
    return { bindings: this.mixer.stats.bindings.inUse, actions: this.mixer.stats.actions.inUse };
  }
  sample(frame: GraphFrame = this.graph.frame()) {
    if (this.dead) throw Error("Animator disposed");
    if (frame.fadeToken !== this.token) {
      this.frozen = frame.alpha < 1 ? this.capture() : [];
      this.token = frame.fadeToken;
    }
    this.mixer.stopAllAction();
    this.restore(this.rest);
    for (const sample of frame.samples) {
      if (sample.weight <= 0) continue;
      const clip = this.clips.get(sample.clip);
      if (!clip) throw Error("Missing bound clip");
      const action = this.mixer.clipAction(clip);
      action.reset().setLoop(T.LoopOnce, 1).setEffectiveWeight(sample.weight).play();
      action.clampWhenFinished = true;
      action.paused = true;
      action.time = sample.time;
    }
    this.mixer.update(0);
    if (frame.alpha < 1)
      for (const pose of this.frozen) {
        pose.node.position.lerp(pose.position, 1 - frame.alpha);
        pose.node.quaternion.slerp(pose.quaternion, 1 - frame.alpha);
        pose.node.scale.lerp(pose.scale, 1 - frame.alpha);
        if (pose.morph && pose.node instanceof T.Mesh) {
          const values = pose.node.morphTargetInfluences!;
          for (let i = 0; i < values.length; i++)
            values[i] = pose.morph[i] * (1 - frame.alpha) + values[i] * frame.alpha;
        }
      }
    else this.frozen = [];
    this.rootMotion?.compensate();
    this.root.updateMatrixWorld(true);
  }
  advance(dt: number) {
    const result = this.graph.advance(dt);
    const rootDelta =
      this.rootMotion && result.motion ? this.rootMotion.delta(result.motion) : undefined;
    this.sample();
    return { ...result, rootDelta };
  }
  seek(normalized: number) {
    this.graph.seek(normalized);
    this.sample();
  }
  dispose() {
    if (this.dead) return;
    this.mixer.stopAllAction();
    this.restore(this.rest);
    this.mixer.uncacheRoot(this.root);
    this.rest = [];
    this.frozen = [];
    this.clips.clear();
    this.rootMotion = undefined;
    this.reservation.release();
    this.dead = true;
  }
}
