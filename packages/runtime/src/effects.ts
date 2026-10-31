import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { RenderSettings } from "./schema";
export class Effects {
  private composer: EffectComposer;
  private grade: ShaderPass;
  private render: RenderPass;
  private output: OutputPass;
  constructor(renderer: T.WebGLRenderer, scene: T.Scene, camera: T.Camera) {
    this.composer = new EffectComposer(
      renderer,
      new T.WebGLRenderTarget(1, 1, { type: T.UnsignedByteType, stencilBuffer: false }),
    );
    this.composer.setPixelRatio(1);
    this.render = new RenderPass(scene, camera);
    this.grade = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        texel: { value: new T.Vector2() },
        threshold: { value: 0.75 },
        strength: { value: 0 },
        exposure: { value: 1 },
      },
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `uniform sampler2D tDiffuse;uniform vec2 texel;uniform float threshold,strength,exposure;varying vec2 vUv;vec3 b(vec2 uv){vec3 c=texture2D(tDiffuse,uv).rgb;return c*smoothstep(threshold,threshold+.2,dot(c,vec3(.2126,.7152,.0722)));}void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;if(strength>0.)c+=(b(vUv)+b(vUv+vec2(texel.x*2.,0.))+b(vUv-vec2(texel.x*2.,0.))+b(vUv+vec2(0.,texel.y*2.))+b(vUv-vec2(0.,texel.y*2.)))*strength/5.;gl_FragColor=vec4(c*exposure,1.);}`,
    });
    this.output = new OutputPass();
    this.composer.addPass(this.render);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.output);
  }
  resize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.grade.uniforms.texel.value.set(1 / w, 1 / h);
  }
  draw(dt: number, s: RenderSettings) {
    this.grade.uniforms.threshold.value = s.threshold;
    this.grade.uniforms.strength.value = s.glow ? s.strength : 0;
    this.grade.uniforms.exposure.value = s.exposure;
    this.composer.render(dt);
  }
  dispose() {
    this.render.dispose();
    this.grade.dispose();
    this.output.dispose();
    this.composer.dispose();
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
