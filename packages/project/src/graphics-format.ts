const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
/** PIF8 belongs to raw-folder transport; portable graphics extensions require reader9. */
export function needsPIF9(input: unknown) {
  const scene = record(input),
    graphics = record(scene.graphics),
    post = record(graphics.post),
    scattering = record(post.scattering);
  const surface = (v: unknown) =>
    ["maps", "normalScale", "displacementScale", "displacementBias", "aoIntensity"].some(
      (key) => record(v)[key] !== undefined,
    );
  return (
    graphics.images !== undefined ||
    ["resolution", "lighting", "transparentDepth", "temporal", "historyWeight"].some(
      (key) => scattering[key] !== undefined,
    ) ||
    (Array.isArray(graphics.materials) && graphics.materials.some(surface)) ||
    (Array.isArray(scene.entities) &&
      scene.entities.some((value) => {
        const mesh = record(record(value).mesh);
        return mesh.slots !== undefined || surface(mesh.surface);
      }))
  );
}
