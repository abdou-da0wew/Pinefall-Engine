import { MAP_ROLES, textureBinding, type GraphicsImage } from "../../runtime/src/image-definition";
import type { Surface } from "../../runtime/src/graphics-definition";
import { Input, Select } from "./ui";
export function TextureMaps({
  value,
  images,
  onChange,
}: {
  value: Surface;
  images: GraphicsImage[];
  onChange: (value: Surface) => void;
}) {
  return (
    <details>
      <summary>Texture maps and UV transforms</summary>
      <p>
        Color/emissive use sRGB. Scalar, normal and displacement maps use linear data. AO=R,
        roughness=G, metalness=B, alpha=G, displacement=R. UV channels are validated on actual
        geometry before Apply; this tool does not unwrap or generate UVs.
      </p>
      {MAP_ROLES.filter((role) => value.family === "pbr" || ["color", "alpha"].includes(role)).map(
        (role) => {
          const binding = value.maps?.[role];
          const patch = (change: Partial<NonNullable<typeof binding>>) =>
            onChange({ ...value, maps: { ...value.maps, [role]: { ...binding!, ...change } } });
          return (
            <fieldset key={role}>
              <legend>{role}</legend>
              <Select
                aria-label={"Texture " + role}
                value={binding?.image ?? ""}
                onChange={(event) => {
                  const maps = { ...value.maps };
                  if (event.target.value) maps[role] = textureBinding(event.target.value);
                  else delete maps[role];
                  onChange({ ...value, maps });
                }}
              >
                <option value="">None</option>
                {images
                  .filter((image) => image.format !== "hdr")
                  .map((image) => (
                    <option key={image.id} value={image.id}>
                      {image.name}
                    </option>
                  ))}
              </Select>
              {binding && (
                <>
                  <label>
                    UV set
                    <Select
                      aria-label={role + " UV set"}
                      value={binding.uv}
                      onChange={(event) => patch({ uv: Number(event.target.value) as 0 | 1 })}
                    >
                      <option value="0">UV0</option>
                      <option value="1">UV1 (must exist)</option>
                    </Select>
                  </label>
                  {(["offset", "repeat"] as const).flatMap((field) =>
                    ([0, 1] as const).map((axis) => (
                      <label key={field + axis}>
                        {field} {axis === 0 ? "U" : "V"}
                        <Input
                          aria-label={`${role} ${field} ${axis}`}
                          type="number"
                          min={-1024}
                          max={1024}
                          step={0.1}
                          value={binding[field][axis]}
                          onChange={(event) => {
                            const n = Number(event.target.value);
                            if (Number.isFinite(n) && Math.abs(n) <= 1024) {
                              const pair: [number, number] = [...binding[field]];
                              pair[axis] = n;
                              patch({ [field]: pair });
                            }
                          }}
                        />
                      </label>
                    )),
                  )}
                  <label>
                    Rotation (degrees)
                    <Input
                      aria-label={role + " UV rotation"}
                      type="number"
                      min={-5760}
                      max={5760}
                      value={(binding.rotation * 180) / Math.PI}
                      onChange={(event) => {
                        const n = Number(event.target.value);
                        if (Number.isFinite(n) && Math.abs(n) <= 5760)
                          patch({ rotation: (n * Math.PI) / 180 });
                      }}
                    />
                  </label>
                  <label>
                    Wrap
                    <Select
                      aria-label={role + " UV wrap"}
                      value={binding.wrap}
                      onChange={(event) =>
                        patch({ wrap: event.target.value as "repeat" | "clamp" })
                      }
                    >
                      <option value="repeat">Repeat</option>
                      <option value="clamp">Clamp to edge</option>
                    </Select>
                  </label>
                </>
              )}
            </fieldset>
          );
        },
      )}
      {value.family === "pbr" && (
        <>
          <p>
            Displacement moves existing vertices; add mesh subdivisions in your DCC tool for detail.
            Negative normal Y strength flips normal-map handedness. These settings also feed
            standard shadow/depth variants.
          </p>
          {([0, 1] as const).map((axis) => (
            <label key={axis}>
              Normal strength {axis === 0 ? "X" : "Y"}
              <Input
                aria-label={"Normal strength " + axis}
                type="number"
                min={-8}
                max={8}
                step={0.1}
                value={(value.normalScale ?? [1, 1])[axis]}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  if (Number.isFinite(n) && Math.abs(n) <= 8) {
                    const pair: [number, number] = [...(value.normalScale ?? [1, 1])];
                    pair[axis] = n;
                    onChange({ ...value, normalScale: pair });
                  }
                }}
              />
            </label>
          ))}
          {(["displacementScale", "displacementBias", "aoIntensity"] as const).map((field) => (
            <label key={field}>
              {field}
              <Input
                aria-label={field}
                type="number"
                min={field === "aoIntensity" ? 0 : -20}
                max={field === "aoIntensity" ? 8 : 20}
                step={0.05}
                value={value[field] ?? (field === "displacementBias" ? 0 : 1)}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  if (Number.isFinite(n)) onChange({ ...value, [field]: n });
                }}
              />
            </label>
          ))}
        </>
      )}
    </details>
  );
}
