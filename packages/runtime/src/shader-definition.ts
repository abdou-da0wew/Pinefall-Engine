export type UniformValue =
  | number
  | [number, number]
  | [number, number, number]
  | [number, number, number, number];
export interface ShaderUniform {
  type: "float" | "vec2" | "vec3" | "vec4";
  value: UniformValue;
}
export interface ShaderSource {
  version: 1;
  fragment: string;
  uniforms: Record<string, ShaderUniform>;
}
export interface ShaderAsset extends ShaderSource {
  id: string;
  name: string;
  draft?: string;
  draftUniforms?: string;
}
export const DEFAULT_SHADER: ShaderSource = {
  version: 1,
  fragment: "vec4 shade(vec2 uv, vec3 worldPosition) {\n  return vec4(uTint, 1.0);\n}",
  uniforms: { uTint: { type: "vec3", value: [0.3, 0.7, 0.5] } },
};
export function parseShader(value: unknown): ShaderSource {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid shader source");
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) =>
        !["version", "fragment", "uniforms", "id", "name", "draft", "draftUniforms"].includes(k),
    )
  )
    throw Error("Unsupported shader field");
  if (
    v.version !== 1 ||
    typeof v.fragment !== "string" ||
    !v.fragment.length ||
    v.fragment.length > 16384 ||
    !v.uniforms ||
    typeof v.uniforms !== "object" ||
    Array.isArray(v.uniforms)
  )
    throw Error("Shader version/source/uniform budget");
  if (Object.keys(v.uniforms).length > 16) throw Error("Shader uniform limit is 16");
  const uniforms: Record<string, ShaderUniform> = {};
  for (const [name, raw] of Object.entries(v.uniforms)) {
    if (
      !/^u[A-Z][A-Za-z0-9_]{0,47}$/.test(name) ||
      name === "uTime" ||
      !raw ||
      typeof raw !== "object"
    )
      throw Error("Invalid/reserved shader uniform name");
    if (Array.isArray(raw) || Object.keys(raw).some((k) => !["type", "value"].includes(k)))
      throw Error("Unsupported uniform field");
    const r = raw as ShaderUniform;
    const n = { float: 1, vec2: 2, vec3: 3, vec4: 4 }[r.type];
    const values = Array.isArray(r.value) ? r.value : [r.value];
    if (
      !n ||
      values.length !== n ||
      (n === 1 && Array.isArray(r.value)) ||
      (n !== 1 && !Array.isArray(r.value)) ||
      values.some((x) => typeof x !== "number" || !Number.isFinite(x) || Math.abs(x) > 1e6)
    )
      throw Error("Shader uniform type/value mismatch");
    uniforms[name] = { type: r.type, value: structuredClone(r.value) };
  }
  return { version: 1, fragment: v.fragment, uniforms };
}
export function parseShaderAsset(value: unknown): ShaderAsset {
  const s = parseShader(value),
    v = value as ShaderAsset;
  for (const text of [v.id, v.name])
    if (typeof text !== "string" || !text.length || text.length > 100)
      throw Error("Invalid shader ID/name");
  if (v.draft !== undefined && (typeof v.draft !== "string" || v.draft.length > 16384))
    throw Error("Shader draft budget");
  if (
    v.draftUniforms !== undefined &&
    (typeof v.draftUniforms !== "string" || v.draftUniforms.length > 4096)
  )
    throw Error("Shader uniform draft budget");
  return {
    ...s,
    id: v.id,
    name: v.name,
    ...(v.draft === undefined ? {} : { draft: v.draft }),
    ...(v.draftUniforms === undefined ? {} : { draftUniforms: v.draftUniforms }),
  };
}
