import * as T from "three";
import type { AnimatorDefinition } from "./definition";
import type { MotionInterval } from "./graph";
export interface RootDelta {
  x: number;
  z: number;
  yaw: number;
}
const zero = (): RootDelta => ({ x: 0, z: 0, yaw: 0 });
const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Y-up rigid planar composition; THREE positive yaw rotates +Z toward +X. */
export function composeMotion(a: RootDelta, b: RootDelta): RootDelta {
  const c = Math.cos(a.yaw),
    s = Math.sin(a.yaw);
  return { x: a.x + c * b.x + s * b.z, z: a.z - s * b.x + c * b.z, yaw: angle(a.yaw + b.yaw) };
}
export function inverseMotion(a: RootDelta): RootDelta {
  const c = Math.cos(a.yaw),
    s = Math.sin(a.yaw);
  return { x: -c * a.x + s * a.z, z: -s * a.x - c * a.z, yaw: -a.yaw };
}
export function motionPower(value: RootDelta, count: number) {
  if (!Number.isSafeInteger(count) || Math.abs(count) > 1e9) throw Error("Root cycle budget");
  let result = zero(),
    base = count < 0 ? inverseMotion(value) : value;
  for (let n = Math.abs(count); n > 0; n = Math.floor(n / 2)) {
    if (n % 2) result = composeMotion(result, base);
    base = composeMotion(base, base);
  }
  return result;
}
function relative(a: RootDelta, b: RootDelta) {
  return composeMotion(inverseMotion(a), b);
}
interface Sampler {
  position?: T.Interpolant;
  rotation?: T.Interpolant;
}
function interpolant(track: T.KeyframeTrack) {
  return (track as T.KeyframeTrack & { createInterpolant(): T.Interpolant }).createInterpolant();
}
/** Opt-in profile: a unique node with static uniformly scaled ancestors inside the imported rig.
 * Source interpolation factories are preserved (including glTF cubic quaternion interpolation). */
export class RootMotion {
  readonly node: T.Object3D;
  private parent = new T.Matrix4();
  private parentInverse = new T.Matrix4();
  private parentRotation = new T.Quaternion();
  private restPosition: T.Vector3;
  private restRotation: T.Quaternion;
  private origin: T.Vector3;
  private originYaw: number;
  private samplers = new Map<string, Sampler>();
  private bounds = new Map<string, { start: RootDelta; cycle: RootDelta }>();
  constructor(
    root: T.Object3D,
    private definition: AnimatorDefinition,
    clips: Map<string, T.AnimationClip>,
  ) {
    const matches: T.Object3D[] = [];
    root.traverse((node) => {
      if (node.name === definition.rootMotion!.node) matches.push(node);
    });
    if (matches.length !== 1) throw Error("Root-motion node must have a unique name");
    this.node = matches[0];
    const ancestors: T.Object3D[] = [];
    if (this.node !== root) {
      let node = this.node.parent;
      while (node) {
        ancestors.unshift(node);
        if (node === root) break;
        node = node.parent;
      }
    }
    for (const node of ancestors) {
      node.updateMatrix();
      const s = node.scale;
      if (s.x <= 0 || Math.abs(s.x - s.y) > 1e-6 || Math.abs(s.x - s.z) > 1e-6)
        throw Error("Root-motion ancestors require positive uniform scale");
      this.parent.multiply(node.matrix);
    }
    this.parentInverse.copy(this.parent).invert();
    this.parent.decompose(new T.Vector3(), this.parentRotation, new T.Vector3());
    this.restPosition = this.node.position.clone();
    this.restRotation = this.node.quaternion.clone();
    this.origin = this.restPosition.clone().applyMatrix4(this.parent);
    this.originYaw = this.yaw(this.restRotation);
    for (const [id, clip] of clips) {
      const sampler: Sampler = {};
      for (const track of clip.tracks) {
        const parsed = T.PropertyBinding.parseTrackName(track.name),
          target = T.PropertyBinding.findNode(root, parsed.nodeName);
        if (target && ancestors.some((node) => node === target))
          throw Error("Animated root-motion ancestors are unsupported");
        if (target !== this.node) continue;
        if (parsed.propertyName === "position") sampler.position = interpolant(track);
        if (parsed.propertyName === "quaternion") sampler.rotation = interpolant(track);
      }
      this.samplers.set(id, sampler);
      const start = this.pose(id, 0);
      this.bounds.set(id, { start, cycle: relative(start, this.pose(id, 1)) });
    }
  }
  private yaw(local: T.Quaternion) {
    return new T.Euler().setFromQuaternion(this.parentRotation.clone().multiply(local), "YXZ").y;
  }
  pose(clip: string, phase: number): RootDelta {
    const binding = this.definition.clips[clip],
      sampler = this.samplers.get(clip);
    if (!binding || !sampler) throw Error("Unknown root-motion clip");
    const time = binding.start + phase * (binding.end - binding.start),
      p = this.restPosition.clone(),
      q = this.restRotation.clone();
    if (sampler.position) p.fromArray(sampler.position.evaluate(time));
    if (sampler.rotation) q.fromArray(sampler.rotation.evaluate(time)).normalize();
    p.applyMatrix4(this.parent);
    const result = { x: p.x, z: p.z, yaw: this.yaw(q) };
    if (!Object.values(result).every(Number.isFinite)) throw Error("Nonfinite root-motion sample");
    return result;
  }
  private unwrapped(clip: string, phase: number) {
    const cycle = Math.floor(phase),
      fraction = phase - cycle,
      bounds = this.bounds.get(clip)!;
    return composeMotion(
      motionPower(bounds.cycle, cycle),
      relative(bounds.start, this.pose(clip, fraction)),
    );
  }
  delta(interval: MotionInterval) {
    if (Math.abs(interval.after - interval.before) > 256)
      throw Error("Root-motion loops per tick exceeded");
    const result = zero();
    for (const sample of interval.frame.samples) {
      const d = relative(
        this.unwrapped(sample.clip, interval.before),
        this.unwrapped(sample.clip, interval.after),
      );
      result.x += d.x * sample.weight;
      result.z += d.z * sample.weight;
      result.yaw += d.yaw * sample.weight;
    }
    result.x *= interval.gain;
    result.z *= interval.gain;
    result.yaw *= interval.gain;
    if (!Object.values(result).every(Number.isFinite) || Math.hypot(result.x, result.z) > 50)
      throw Error("Root-motion displacement budget exceeded");
    return result;
  }
  /** Remove horizontal travel/yaw from the rendered rig; vertical bob and swing remain animation-owned. */
  compensate() {
    const p = this.node.position.clone().applyMatrix4(this.parent);
    p.x = this.origin.x;
    p.z = this.origin.z;
    this.node.position.copy(p.applyMatrix4(this.parentInverse));
    const q = this.parentRotation.clone().multiply(this.node.quaternion),
      yaw = new T.Euler().setFromQuaternion(q, "YXZ").y;
    q.premultiply(
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), this.originYaw - yaw),
    );
    this.node.quaternion.copy(this.parentRotation.clone().invert().multiply(q));
  }
  /** Bounded, side-effect-free path in canonical model coordinates for on-demand previews. */
  path(clip: string, segments = 60) {
    if (!Number.isInteger(segments) || segments < 1 || segments > 256)
      throw Error("Root path sample budget");
    return Array.from({ length: segments + 1 }, (_, i) => this.pose(clip, i / segments));
  }
}
