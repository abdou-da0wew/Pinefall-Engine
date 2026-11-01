import * as T from "three";
import { parseShader, type ShaderSource, type UniformValue } from "./shader-definition";
function sourceDiagnostics(fragment: string, compiled: string, log: string): string {
  const start = compiled.indexOf(fragment);
  if (start < 0) return log.slice(0, 8192);
  const prefix = compiled.slice(0, start).split("\n").length - 1;
  const lines = fragment.split("\n").length;
  return log.slice(0, 8192).replace(/(ERROR|WARNING): (\d+):(\d+):/g, (_all, kind, _unit, line) => {
    const authored = Number(line) - prefix;
    return `${kind}: ${authored >= 1 && authored <= lines ? "authored line " + authored : "engine line " + line}:`;
  });
}
/** Unlit, fixed engine vertex interface. User GPU code is opt-in, not sandboxed. */
export async function stageShader(
  renderer: T.WebGLRenderer,
  root: T.Object3D,
  camera: T.Camera,
  scene: T.Scene,
  input: ShaderSource,
  signal?: AbortSignal,
): Promise<T.ShaderMaterial> {
  const source = parseShader(input);
  if (renderer.getContext().isContextLost()) throw Error("Shader context unavailable");
  signal?.throwIfAborted();
  const uniforms: Record<string, T.IUniform> = { uTime: { value: 0 } };
  for (const [name, u] of Object.entries(source.uniforms))
    uniforms[name] = { value: Array.isArray(u.value) ? [...u.value] : u.value };
  const declarations = Object.entries(source.uniforms)
    .map(([name, u]) => `uniform ${u.type} ${name};`)
    .join("\n");
  const header = `varying vec2 pfUv;varying vec3 pfWorldPosition;uniform float uTime;\n${declarations}\n`;
  const material = new T.ShaderMaterial({
    uniforms,
    vertexShader: T.ShaderLib.basic.vertexShader
      .replace("void main() {", "varying vec2 pfUv;varying vec3 pfWorldPosition;\nvoid main() {")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\npfUv=uv;vec4 pfWorldVertex=vec4(transformed,1.);\n#ifdef USE_BATCHING\npfWorldVertex=batchingMatrix*pfWorldVertex;\n#endif\n#ifdef USE_INSTANCING\npfWorldVertex=instanceMatrix*pfWorldVertex;\n#endif\npfWorldPosition=(modelMatrix*pfWorldVertex).xyz;",
      ),
    fragmentShader:
      header +
      source.fragment +
      "\nvoid main(){gl_FragColor=shade(pfUv,pfWorldPosition);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
    toneMapped: true,
  });
  material.name = "PinefallShader_" + crypto.randomUUID().replaceAll("-", "");
  material.fragmentShader = "// " + material.name + "\n" + material.fragmentShader;
  material.userData.source = source;
  const staged = root.clone(true);
  let meshes = 0;
  const excluded: T.Object3D[] = [];
  staged.traverse((o) => {
    if (
      o instanceof T.Mesh &&
      (o.userData.volume ||
        (root.userData.entityId !== undefined && o.userData.entityId !== root.userData.entityId))
    ) {
      excluded.push(o);
    } else if (o instanceof T.Mesh) {
      o.material = material;
      o.castShadow = false;
      meshes++;
    }
  });
  for (const object of excluded) object.removeFromParent();
  if (!meshes) {
    material.dispose();
    throw Error("Shader target has no meshes");
  }
  const errors: string[] = [];
  const previous = renderer.debug.onShaderError;
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    if (gl.getShaderSource(fragment)?.includes(source.fragment)) {
      const compiled = gl.getShaderSource(fragment) ?? "";
      const log =
        gl.getShaderInfoLog(fragment) || gl.getProgramInfoLog(program) || "Shader link failed";
      errors.push(sourceDiagnostics(source.fragment, compiled, log));
    } else previous?.(gl, program, vertex, fragment);
  };
  try {
    // Compile current framebuffer variant, then a linear offscreen variant used by post.
    const target = new T.WebGLRenderTarget(1, 1);
    try {
      for (const destination of [null, target]) {
        const old = renderer.getRenderTarget();
        try {
          renderer.setRenderTarget(destination);
          renderer.compile(staged, camera, scene);
        } finally {
          renderer.setRenderTarget(old);
        }
        const gl = renderer.getContext(),
          parallel = gl.getExtension("KHR_parallel_shader_compile");
        const started = performance.now();
        while (
          parallel &&
          (renderer.info.programs ?? []).some(
            (p) =>
              p.name === material.name &&
              !gl.getProgramParameter(p.program as WebGLProgram, parallel.COMPLETION_STATUS_KHR),
          )
        ) {
          signal?.throwIfAborted();
          if (gl.isContextLost()) throw Error("Shader compilation interrupted by context loss");
          if (performance.now() - started > 30000)
            throw Error("Shader compilation timed out; previous material retained");
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        signal?.throwIfAborted();
      }
    } finally {
      target.dispose();
    }
    const programs = (renderer.info.programs ?? []).filter((p) => p.name === material.name);
    if (programs.length > 16) throw Error("Shader variant budget exceeded");
    if (!programs.length) throw Error("No staged shader program was produced");
    const gl = renderer.getContext();
    for (const program of programs) {
      if (!gl.getProgramParameter(program.program as WebGLProgram, gl.LINK_STATUS)) {
        const linked = program.program as WebGLProgram;
        for (const shader of gl.getAttachedShaders(linked) ?? []) {
          const log = gl.getShaderInfoLog(shader);
          if (log)
            errors.push(sourceDiagnostics(source.fragment, gl.getShaderSource(shader) ?? "", log));
        }
        errors.push(gl.getProgramInfoLog(linked) || "Shader failed to link");
      }
    }
    if (errors.length)
      throw Error(
        "Shader was not applied; previous material retained. Driver diagnostics (authored lines where available):\n" +
          errors.join("\n"),
      );
    return material;
  } catch (error) {
    material.dispose();
    throw error;
  } finally {
    renderer.debug.onShaderError = previous;
    staged.clear();
  }
}
export function setShaderUniform(material: T.ShaderMaterial, name: string, value: UniformValue) {
  const source = material.userData.source as ShaderSource;
  if (!source?.uniforms[name]) throw Error("Unknown user shader uniform");
  const parsed = parseShader({
    ...source,
    uniforms: { ...source.uniforms, [name]: { ...source.uniforms[name], value } },
  });
  material.uniforms[name].value = structuredClone(parsed.uniforms[name].value);
  material.userData.source = parsed;
}
export class ShaderCompiler {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private renderer: T.WebGLRenderer) {}
  compile(
    root: T.Object3D,
    camera: T.Camera,
    scene: T.Scene,
    source: ShaderSource,
    signal?: AbortSignal,
  ) {
    const task = this.tail
      .catch(() => {})
      .then(() => stageShader(this.renderer, root, camera, scene, source, signal));
    this.tail = task;
    return task;
  }
}
