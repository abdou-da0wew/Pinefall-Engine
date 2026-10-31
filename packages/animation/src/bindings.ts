import * as T from "three";
import type { AssetImport } from "../../assets/src/record";
import type { AnimatorDefinition } from "./definition";
/** Resolve persisted Plan01 identities against this artifact; names are not persisted graph identities. */
export function bindAnimationClips(
  definition: AnimatorDefinition,
  metadata: AssetImport,
  clips: readonly T.AnimationClip[],
  root?: T.Object3D,
) {
  const result = new Map<string, T.AnimationClip>();
  let tracks = 0;
  for (const [id, binding] of Object.entries(definition.clips)) {
    const subasset = metadata.subassets.find((s) => s.kind === "clip" && s.id === binding.subasset);
    if (!subasset) throw Error("Missing animation clip subasset: " + binding.subasset);
    let source: T.AnimationClip | undefined;
    if (subasset.key.startsWith("name:")) {
      const matches = clips.filter((c) => c.name === subasset.key.slice(5));
      if (matches.length === 1) source = matches[0];
    } else {
      const match = /^ambiguous:(\d+):/.exec(subasset.key);
      if (match) source = clips[Number(match[1])];
    }
    if (!source || binding.end > source.duration + 1e-6 || binding.start >= source.duration)
      throw Error("Animation binding/trim no longer matches artifact: " + id);
    tracks += source.tracks.length;
    if (tracks > 8192) throw Error("Animator track budget");
    for (const track of source.tracks) {
      const parsed = T.PropertyBinding.parseTrackName(track.name);
      if (
        parsed.objectName ||
        !["position", "quaternion", "scale", "morphTargetInfluences"].includes(parsed.propertyName)
      )
        throw Error("Unsupported animation channel: " + track.name);
      if (root && !T.PropertyBinding.findNode(root, parsed.nodeName))
        throw Error("Missing animation target: " + track.name);
    }
    // Share immutable track data. Separate action identities permit two recipes of the same source clip.
    result.set(id, new T.AnimationClip(id, source.duration, source.tracks, source.blendMode));
  }
  return result;
}
