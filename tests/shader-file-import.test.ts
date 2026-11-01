import { expect, test } from "bun:test";
import { readShaderFile } from "../packages/editor/src/shader-file-import";
import { DEFAULT_SHADER, type ShaderSource } from "../packages/runtime/src/shader-definition";
const file = (text: string, name = "test.glsl") => new File([text], name);
test("shader file exchange validates without compiling and preserves the other input", async () => {
  const fragment = "vec4 shade(vec2 uv, vec3 p){ return vec4(uTint,1.0); }";
  const source = await readShaderFile(file(fragment), "fragment", DEFAULT_SHADER);
  expect(source.fragment).toBe(fragment);
  expect(source.uniforms).toEqual(DEFAULT_SHADER.uniforms);
  const uniforms: ShaderSource["uniforms"] = { uTint: { type: "vec3", value: [1, 0, 0] } };
  const next = await readShaderFile(
    file(JSON.stringify(uniforms), "uniforms.json"),
    "uniforms",
    source,
  );
  expect(next.fragment).toBe(fragment);
  expect(next.uniforms).toEqual(uniforms);
  expect(DEFAULT_SHADER.uniforms.uTint.value).toEqual([0.3, 0.7, 0.5]);
  // Driver diagnostics are deliberately deferred until trusted explicit Apply.
  expect((await readShaderFile(file("bad GPU code"), "fragment", source)).fragment).toBe(
    "bad GPU code",
  );
});
test("shader files reject oversized input before reading, invalid encoding, extensions and uniform schema", async () => {
  let read = false;
  await expect(
    readShaderFile(
      {
        name: "large.glsl",
        size: 65537,
        arrayBuffer: async () => {
          read = true;
          return new ArrayBuffer(0);
        },
      },
      "fragment",
      DEFAULT_SHADER,
    ),
  ).rejects.toThrow("byte budget");
  expect(read).toBe(false);
  await expect(readShaderFile(file("x".repeat(16385)), "fragment", DEFAULT_SHADER)).rejects.toThrow(
    "text budget",
  );
  await expect(readShaderFile(file(""), "fragment", DEFAULT_SHADER)).rejects.toThrow();
  await expect(readShaderFile(file("x", "x.txt"), "fragment", DEFAULT_SHADER)).rejects.toThrow(
    ".glsl",
  );
  await expect(
    readShaderFile(new File([new Uint8Array([255])], "bad.glsl"), "fragment", DEFAULT_SHADER),
  ).rejects.toThrow();
  for (const value of [
    "{",
    "[]",
    '{"uTime":{"type":"float","value":1}}',
    '{"uBad":{"type":"vec3","value":[1,2]}}',
    " ".repeat(4097),
  ]) {
    await expect(
      readShaderFile(file(value, "bad.json"), "uniforms", DEFAULT_SHADER),
    ).rejects.toThrow();
  }
});
