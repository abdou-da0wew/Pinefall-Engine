import * as T from "three";
/** Numeric animation data crosses the worker boundary as typed buffers, including glTF cubic tangents. */
export interface WireClip {
  id: string;
  name: string;
  duration: number;
  blendMode: T.AnimationBlendMode;
  tracks: {
    name: string;
    type: string;
    times: Float32Array;
    values: Float32Array;
    interpolation: T.InterpolationModes | undefined;
    cubic: boolean;
  }[];
}
type Factory = ((this: T.KeyframeTrack, buffer?: T.TypedArray) => T.Interpolant) & {
  isInterpolantFactoryMethodGLTFCubicSpline?: boolean;
};
type RuntimeTrack = T.KeyframeTrack & { createInterpolant: Factory };
export function encodeClip(clip: T.AnimationClip): WireClip {
  return {
    id: clip.uuid,
    name: clip.name,
    duration: clip.duration,
    blendMode: clip.blendMode,
    tracks: clip.tracks.map((track) => {
      if (!["number", "vector", "quaternion", "color"].includes(track.ValueTypeName))
        throw Error("Unsupported model animation track type");
      const factory = (track as RuntimeTrack).createInterpolant;
      return {
        name: track.name,
        type: track.ValueTypeName,
        times: new Float32Array(track.times),
        values: new Float32Array(track.values),
        interpolation: track.getInterpolation(),
        cubic: factory.isInterpolantFactoryMethodGLTFCubicSpline === true,
      };
    }),
  };
}
/** Hermite basis specified by glTF 2.0: each key stores in-tangent/value/out-tangent.
 * Explicit width avoids an incorrect valueSize declaration in the pinned Three type package. */
class CubicInterpolant extends T.Interpolant {
  constructor(
    times: Float32Array,
    values: Float32Array,
    readonly width: number,
    buffer: T.TypedArray | undefined,
    readonly quaternion: boolean,
  ) {
    super(times, values, width, buffer);
  }
  override copySampleValue_(index: number) {
    for (let i = 0; i < this.width; i++)
      this.resultBuffer[i] = this.sampleValues[index * this.width * 3 + this.width + i];
    return this.resultBuffer;
  }
  override interpolate_(i1: number, t0: number, t: number, t1: number) {
    const dt = t1 - t0,
      u = (t - t0) / dt,
      u2 = u * u,
      u3 = u2 * u,
      a = 2 * u3 - 3 * u2 + 1,
      b = u3 - 2 * u2 + u,
      c = -2 * u3 + 3 * u2,
      d = u3 - u2,
      w = this.width,
      p = (i1 - 1) * w * 3,
      q = i1 * w * 3;
    for (let i = 0; i < w; i++)
      this.resultBuffer[i] =
        a * this.sampleValues[p + w + i] +
        b * dt * this.sampleValues[p + 2 * w + i] +
        c * this.sampleValues[q + w + i] +
        d * dt * this.sampleValues[q + i];
    if (this.quaternion)
      new T.Quaternion().fromArray(this.resultBuffer).normalize().toArray(this.resultBuffer);
    return this.resultBuffer;
  }
}
export function decodeTrack(wire: WireClip["tracks"][number]) {
  const TrackConstructor = (
    {
      number: T.NumberKeyframeTrack,
      vector: T.VectorKeyframeTrack,
      quaternion: T.QuaternionKeyframeTrack,
      color: T.ColorKeyframeTrack,
    } as Record<string, typeof T.KeyframeTrack>
  )[wire.type];
  if (!TrackConstructor) throw Error("Unsupported animation wire type");
  const track = new TrackConstructor(
    wire.name,
    wire.times,
    wire.values,
    wire.interpolation,
  ) as RuntimeTrack;
  if (wire.cubic) {
    const factory: Factory = function (this: T.KeyframeTrack, buffer?: T.TypedArray) {
      return new CubicInterpolant(
        this.times as Float32Array,
        this.values as Float32Array,
        this.getValueSize() / 3,
        buffer,
        this.ValueTypeName === "quaternion",
      );
    };
    factory.isInterpolantFactoryMethodGLTFCubicSpline = true;
    track.createInterpolant = factory;
  }
  return track;
}
