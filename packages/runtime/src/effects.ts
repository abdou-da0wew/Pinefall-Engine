import { ScatteringPass, scatteringBytes } from "./scattering";
import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { assetMemory } from "../../assets/src/budget";
import { parsePost, type PostSettings } from "./graphics-definition";
/** Linear scene -> bloom -> grade -> output conversion/tone mapping -> display-space FXAA.
 * DOM game UI is composited separately and is never sampled by these passes. */
export class Effects {
  private composer: EffectComposer;
  private grade: ShaderPass;
  private render: RenderPass;
  private output: OutputPass;
  private bloom?: UnrealBloomPass;
  private fxaa?: ShaderPass;
  private scattering?: ScatteringPass;
  private width = 1;
  private height = 1;
  private time = 0;
  private settings?: PostSettings;
  private allocation = assetMemory.reserve(0, "post-targets");
  readonly hdr: boolean;
  private canvas: HTMLCanvasElement;
  private resetHistory = () => this.scattering?.resetHistory();
  private targetBytes = 0;
  constructor(
    renderer: T.WebGLRenderer,
    scene: T.Scene,
    private camera: T.Camera,
  ) {
    this.canvas = renderer.domElement;
    this.canvas.addEventListener("webglcontextlost", this.resetHistory);
    this.hdr = renderer.extensions.has("EXT_color_buffer_float");
    this.composer = new EffectComposer(
      renderer,
      new T.WebGLRenderTarget(1, 1, {
        type: this.hdr ? T.HalfFloatType : T.UnsignedByteType,
        stencilBuffer: false,
        depthBuffer: true,
        depthTexture: new T.DepthTexture(1, 1, T.UnsignedIntType),
      }),
    );
    this.composer.setPixelRatio(1);
    this.render = new RenderPass(scene, camera);
    this.grade = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        contrast: { value: 1 },
        saturation: { value: 1 },
        vignette: { value: 0 },
        grain: { value: 0 },
        chromatic: { value: 0 },
        time: { value: 0 },
      },
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `uniform sampler2D tDiffuse;uniform float contrast,saturation,vignette,grain,chromatic,time;varying vec2 vUv;
      void main(){vec2 d=(vUv-.5)*chromatic;vec3 c=texture2D(tDiffuse,vUv).rgb;
      if(chromatic>0.){c.r=texture2D(tDiffuse,clamp(vUv+d,0.,1.)).r;c.b=texture2D(tDiffuse,clamp(vUv-d,0.,1.)).b;}
      float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,saturation);c=max(vec3(0.),(c-.18)*contrast+.18);
      vec2 p=(vUv-.5)*2.;c*=1.-vignette*smoothstep(.2,1.4,length(p));
      float n=fract(sin(dot(gl_FragCoord.xy+time,vec2(12.9898,78.233)))*43758.5453)-.5;
      gl_FragColor=vec4(max(vec3(0.),c+n*grain),1.);}`,
    });
    this.output = new OutputPass();
    this.composer.addPass(this.render);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.output);
  }
  get snapshot() {
    return {
      hdr: this.hdr,
      targetBytes: this.targetBytes,
      passes: this.composer.passes.length,
      bloom: !!this.bloom,
      fxaa: !!this.fxaa,
      scattering: this.scattering?.snapshot,
    };
  }
  private estimate(w: number, h: number, bloom: boolean, scattering = this.settings?.scattering) {
    const color = this.hdr ? 8 : 4;
    // Two composer targets including conservative depth allowance, plus bright/mip pairs.
    let bytes = w * h * 2 * (color + 4);
    if (bloom) {
      let x = Math.max(1, Math.round(w / 2)),
        y = Math.max(1, Math.round(h / 2));
      bytes += x * y * (color + 4);
      for (let i = 0; i < 5; i++) {
        bytes += 2 * x * y * (color + 4);
        x = Math.max(1, Math.round(x / 2));
        y = Math.max(1, Math.round(y / 2));
      }
    }
    bytes += scatteringBytes(w, h, this.hdr, scattering);
    return bytes;
  }
  configure(input: PostSettings) {
    const s = parsePost(input);
    const bytes = this.estimate(this.width, this.height, s.bloom, s.scattering);
    if (bytes > 96 * 1024 * 1024) throw Error("Post-processing target budget exceeds 96 MiB");
    this.allocation.resize(bytes);
    if (s.scattering && !this.scattering) {
      this.scattering = new ScatteringPass(this.camera, this.hdr, this.render.scene as T.Scene);
      this.composer.insertPass(this.scattering, 1);
      this.scattering.setSize(this.width, this.height);
    }
    if (!s.scattering && this.scattering) {
      this.composer.removePass(this.scattering);
      this.scattering.dispose();
      this.scattering = undefined;
    }
    if (s.scattering) this.scattering!.configure(s.scattering);
    if (s.bloom && !this.bloom) {
      this.bloom = new UnrealBloomPass(
        new T.Vector2(this.width, this.height),
        s.strength,
        s.radius,
        s.threshold,
      );
      if (!this.hdr)
        for (const t of [
          this.bloom.renderTargetBright,
          ...this.bloom.renderTargetsHorizontal,
          ...this.bloom.renderTargetsVertical,
        ])
          t.texture.type = T.UnsignedByteType;
      this.composer.insertPass(this.bloom, this.scattering ? 2 : 1);
    }
    if (!s.bloom && this.bloom) {
      this.composer.removePass(this.bloom);
      this.bloom.dispose();
      this.bloom = undefined;
    }
    if (s.fxaa && !this.fxaa) {
      this.fxaa = new ShaderPass(FXAAShader);
      this.composer.addPass(this.fxaa);
    }
    if (!s.fxaa && this.fxaa) {
      this.composer.removePass(this.fxaa);
      this.fxaa.dispose();
      this.fxaa = undefined;
    }
    this.settings = s;
    if (this.bloom) {
      this.bloom.threshold = s.threshold;
      this.bloom.strength = s.strength;
      this.bloom.radius = s.radius;
    }
    for (const key of ["contrast", "saturation", "vignette", "grain"] as const)
      this.grade.uniforms[key].value = s[key];
    this.grade.uniforms.chromatic.value = s.chromaticAberration;
    this.fxaa?.uniforms.resolution.value.set(1 / this.width, 1 / this.height);
    this.targetBytes = this.estimate(this.width, this.height, s.bloom);
  }
  resize(w: number, h: number) {
    const bytes = this.estimate(w, h, !!this.bloom);
    if (bytes > 96 * 1024 * 1024) throw Error("Post-processing target budget exceeds 96 MiB");
    this.allocation.resize(bytes);
    this.width = w;
    this.height = h;
    this.targetBytes = bytes;
    this.composer.setSize(w, h);
    this.fxaa?.uniforms.resolution.value.set(1 / w, 1 / h);
  }
  draw(dt: number) {
    if (!this.settings) return;
    this.time += dt;
    this.grade.uniforms.time.value = this.time;
    this.composer.render(dt);
  }
  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.resetHistory);
    this.scattering?.dispose();
    this.bloom?.dispose();
    this.fxaa?.dispose();
    this.render.dispose();
    this.grade.dispose();
    this.output.dispose();
    this.composer.dispose();
    this.allocation.release();
    this.targetBytes = 0;
  }
}
export function beam(color: string) {
  return new T.Mesh(
    new T.ConeGeometry(1, 1, 16, 1, true),
    new T.ShaderMaterial({
      uniforms: { color: { value: new T.Color(color) }, opacity: { value: 0.09 } },
      vertexShader:
        "varying float height;void main(){height=position.y+.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "uniform vec3 color;uniform float opacity;varying float height;void main(){gl_FragColor=vec4(color,opacity*smoothstep(0.,.8,height));}",
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
    }),
  );
}
