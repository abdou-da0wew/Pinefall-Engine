import { parseShader, type ShaderSource } from "../../runtime/src/shader-definition";
export type ShaderFileKind = "fragment" | "uniforms";
/** Bounded UTF-8 file ingestion only; never compiles or executes GPU code. */
export async function readShaderFile(
  file: Pick<File, "size" | "name" | "arrayBuffer">,
  kind: ShaderFileKind,
  base: ShaderSource,
): Promise<ShaderSource> {
  const limit = kind === "fragment" ? 16384 : 4096;
  if (!file.name.toLowerCase().endsWith(kind === "fragment" ? ".glsl" : ".json"))
    throw Error("Choose a " + (kind === "fragment" ? ".glsl" : ".json") + " file");
  if (!file.size || file.size > limit * 4) throw Error("Shader file byte budget exceeded");
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size) throw Error("Shader file changed while reading");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.length > limit) throw Error("Shader file text budget exceeded");
  return parseShader({
    ...base,
    ...(kind === "fragment" ? { fragment: text } : { uniforms: JSON.parse(text) }),
  });
}
