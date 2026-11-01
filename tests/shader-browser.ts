import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5173/tests/runtime.html", { waitUntil: "networkidle" });
  const result = await page.evaluate(async () => {
    const load = (p: string) => import(p);
    const { Engine, entity } = await load("/packages/runtime/src/index.ts");
    const { createGame } = await load("/packages/project/src/index.ts");
    const { DEFAULT_SHADER } = await load("/packages/runtime/src/shader-definition.ts");
    const { emptyGraphics } = await load("/packages/runtime/src/graphics-definition.ts");
    const engine = await Engine.create(document.querySelector("canvas"));
    const scene = createGame("Shader test");
    scene.entities = [];
    const box = entity("Shader cube");
    scene.entities.push(box);
    const check = (ok: boolean, s: string) => {
      if (!ok) throw Error(s);
    };
    try {
      await engine.load(scene);
      let blocked = false;
      try {
        await engine.graphics.compileShader(box.id, DEFAULT_SHADER);
      } catch {
        blocked = true;
      }
      check(blocked, "Shader ran without consent");
      engine.applySettings({ ...engine.settings, allowCustomShaders: true });
      await engine.graphics.compileShader(box.id, DEFAULT_SHADER);
      const mesh = engine.objects.get(box.id).children[0],
        good = mesh.material;
      check(good.isShaderMaterial, "Shader not applied");
      engine.graphics.setUniform(box.id, "uTint", [1, 0, 0]);
      check(
        mesh.material === good && good.uniforms.uTint.value[0] === 1,
        "Uniform rebuilt material",
      );
      let failed = false;
      let lineDiagnostic = false;
      try {
        await engine.graphics.compileShader(box.id, {
          ...DEFAULT_SHADER,
          fragment: "vec4 shade(vec2 uv, vec3 p) { invalid shader code; }",
        });
      } catch (error) {
        failed = true;
        lineDiagnostic = String(error).includes("authored line 1");
      }
      check(lineDiagnostic, "Driver source line was not mapped to the authored shader");
      check(failed && mesh.material === good, "Broken shader replaced last valid material");
      const cancelled = new AbortController();
      cancelled.abort();
      let aborted = false;
      try {
        await engine.graphics.compileShader(box.id, DEFAULT_SHADER, cancelled.signal);
      } catch {
        aborted = true;
      }
      check(aborted && mesh.material === good, "Aborted compile replaced material");
      const pending = engine.graphics.compileShader(box.id, DEFAULT_SHADER);
      engine.applySettings({ ...engine.settings, allowCustomShaders: false });
      let revoked = false;
      try {
        await pending;
      } catch {
        revoked = true;
      }
      check(revoked && !mesh.material.isShaderMaterial, "Queued shader bypassed revoked trust");
      engine.applySettings({ ...engine.settings, allowCustomShaders: true });
      await engine.graphics.compileShader(box.id, DEFAULT_SHADER);
      const baseline = engine.renderer.info.programs.length;
      for (let i = 0; i < 20; i++) {
        await engine.graphics.compileShader(box.id, DEFAULT_SHADER);
        engine.graphics.setUniform(box.id, "uTint", [i / 20, 0.3, 0.2]);
      }
      check(
        engine.renderer.info.programs.length <= baseline + 2,
        "Shader programs leaked across replacements",
      );
      const extension = engine.renderer.getContext().getExtension("WEBGL_lose_context");
      check(!!extension, "Context loss extension unavailable in fixture");
      const lost = new Promise<void>((resolve) =>
        engine.canvas.addEventListener("webglcontextlost", () => resolve(), { once: true }),
      );
      extension.loseContext();
      await lost;
      let contextRejected = false;
      try {
        await engine.graphics.compileShader(box.id, DEFAULT_SHADER);
      } catch {
        contextRejected = true;
      }
      check(contextRejected, "Shader compiled with lost context");
      const restored = new Promise<void>((resolve) =>
        engine.canvas.addEventListener("webglcontextrestored", () => resolve(), { once: true }),
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      extension.restoreContext();
      await Promise.race([
        restored,
        new Promise((_, reject) =>
          setTimeout(() => reject(Error("Context restore deadline")), 10000),
        ),
      ]);
      await engine.graphics.compileShader(box.id, DEFAULT_SHADER);
      check(!engine.paused, "Context restoration spuriously paused the engine");
      const T = await load("/tests/graphics-test-api.ts");
      const { stageShader } = await load("/packages/runtime/src/shader-runtime.ts");
      const geometry = new T.BoxGeometry(1, 1, 1);
      const count = geometry.attributes.position.count;
      geometry.setAttribute(
        "skinIndex",
        new T.Uint16BufferAttribute(new Uint16Array(count * 4), 4),
      );
      const weights = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) weights[i * 4] = 1;
      geometry.setAttribute("skinWeight", new T.Float32BufferAttribute(weights, 4));
      geometry.morphAttributes.position = [geometry.attributes.position.clone()];
      const plain = new T.MeshBasicMaterial();
      const skin = new T.SkinnedMesh(geometry, plain);
      const bone = new T.Bone();
      skin.add(bone);
      const skeleton = new T.Skeleton([bone]);
      skin.bind(skeleton);
      skin.morphTargetInfluences[0] = 0.5;
      skin.position.x = -2;
      const morph = new T.Mesh(geometry, plain);
      morph.morphTargetInfluences[0] = 0.5;
      const instanceGeometry = new T.BoxGeometry(1, 1, 1);
      const instance = new T.InstancedMesh(instanceGeometry, plain, 1);
      instance.setMatrixAt(0, new T.Matrix4().makeTranslation(2, 0, 0));
      const group = new T.Group();
      group.add(skin, morph, instance);
      const fixtureScene = new T.Scene();
      fixtureScene.add(group);
      const camera = new T.OrthographicCamera(-4, 4, 1, -1, 0.1, 20);
      camera.position.z = 5;
      const shader = await stageShader(engine.renderer, group, camera, fixtureScene, {
        version: 1,
        uniforms: {},
        fragment:
          "vec4 shade(vec2 uv, vec3 p) { return p.x > 1.0 ? vec4(0,1,0,1) : vec4(1,0,0,1); }",
      });
      const target = new T.WebGLRenderTarget(128, 32);
      try {
        skin.material = morph.material = instance.material = shader;
        engine.renderer.setRenderTarget(target);
        engine.renderer.render(fixtureScene, camera);
        const pixels = [32, 64, 96].map((x) => {
          const pixel = new Uint8Array(4);
          engine.renderer.readRenderTargetPixels(target, x, 16, 1, 1, pixel);
          return pixel;
        });
        check(pixels[0][0] > 150 && pixels[0][1] < 10, "Skinned/morph shader pixel missing");
        check(pixels[1][0] > 150 && pixels[1][1] < 10, "Morph shader pixel missing");
        check(pixels[2][1] > 150 && pixels[2][0] < 10, "Instanced world position incorrect");
      } finally {
        engine.renderer.setRenderTarget(null);
        shader.dispose();
        target.dispose();
        plain.dispose();
        geometry.dispose();
        instanceGeometry.dispose();
        skeleton.dispose();
        instance.dispose();
      }
      scene.graphics = emptyGraphics();
      scene.graphics.shaders = [
        { ...DEFAULT_SHADER, id: "shader", name: "Shader", draft: "invalid draft" },
      ];
      box.mesh.shader = "shader";
      await engine.load(scene);
      check(
        engine.objects.get(box.id).children[0].material.isShaderMaterial,
        "Authored shader not applied",
      );
      engine.applySettings({ ...engine.settings, allowCustomShaders: false });
      check(
        !engine.objects.get(box.id).children[0].material.isShaderMaterial,
        "Disabling GPU code left it active",
      );
      return {
        blocked,
        failed,
        lineDiagnostic,
        uniformStable: true,
        vertexVariants: ["skin+morph", "morph", "instanced-world-position"],
        contextRestored: true,
        cancelled: aborted,
        revoked,
        cycles: 20,
        programs: engine.renderer.info.programs.length,
      };
    } finally {
      engine.dispose();
    }
  });
  expect(result.blocked).toBe(true);
  console.log("PASS shaders:", JSON.stringify(result));
} finally {
  await browser.close();
}
