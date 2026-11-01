import * as T from "three";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import type { ScatteringSettings } from "./graphics-definition";
const vertex = "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}";
const depthFunctions = `uniform sampler2D depthMap;uniform mat4 inverseProjection;varying vec2 vUv;
vec3 viewPosition(vec2 uv){float d=texture2D(depthMap,clamp(uv,0.,1.)).r;vec4 p=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}`;
/** Half-resolution height-density integration; opaque scene depth terminates rays.
 * Transparent surfaces do not terminate the volume. No temporal history or light-shadow sampling. */
export class ScatteringPass extends Pass {
  private target: T.WebGLRenderTarget;
  private march: T.ShaderMaterial;
  private composite: T.ShaderMaterial;
  private quad: FullScreenQuad;
  constructor(
    private camera: T.Camera,
    hdr: boolean,
  ) {
    super();
    this.target = new T.WebGLRenderTarget(1, 1, {
      type: hdr ? T.HalfFloatType : T.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: T.NearestFilter,
      magFilter: T.NearestFilter,
    });
    this.march = new T.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        depthMap: { value: null },
        inverseProjection: { value: new T.Matrix4() },
        cameraWorld: { value: new T.Matrix4() },
        density: { value: 0.03 },
        falloff: { value: 0.1 },
        baseHeight: { value: 0 },
        maxDistance: { value: 100 },
        steps: { value: 16 },
        radiance: { value: new T.Color() },
        anisotropy: { value: 0 },
        lightDirection: { value: new T.Vector3(0.3, 0.8, 0.2).normalize() },
      },
      vertexShader: vertex,
      fragmentShader:
        depthFunctions +
        `
uniform mat4 cameraWorld;uniform float density,falloff,baseHeight,maxDistance,anisotropy;uniform int steps;uniform vec3 radiance,lightDirection;
void main(){vec3 p=viewPosition(vUv);float distance=min(length(p),maxDistance);vec3 direction=normalize(mat3(cameraWorld)*p);vec3 origin=cameraWorld[3].xyz;
float ds=distance/float(steps),transmittance=1.;vec3 scattering=vec3(0.);float g=anisotropy;float cosine=dot(-direction,normalize(lightDirection));
float phase=(1.-g*g)/pow(max(.01,1.+g*g-2.*g*cosine),1.5);
for(int i=0;i<32;i++){if(i>=steps)break;vec3 samplePosition=origin+direction*((float(i)+.5)*ds);float extinction=density*exp(-max(0.,samplePosition.y-baseHeight)*falloff);float attenuation=exp(-extinction*ds);scattering+=transmittance*(1.-attenuation)*radiance*phase;transmittance*=attenuation;}
gl_FragColor=vec4(scattering,transmittance);}`,
    });
    this.composite = new T.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        depthMap: { value: null },
        inverseProjection: { value: new T.Matrix4() },
        tDiffuse: { value: null },
        volume: { value: this.target.texture },
        volumeSize: { value: new T.Vector2(1, 1) },
      },
      vertexShader: vertex,
      fragmentShader:
        depthFunctions +
        `
uniform sampler2D tDiffuse,volume;uniform vec2 volumeSize;
void main(){vec2 pixel=vUv*volumeSize-.5,base=floor(pixel),fraction=fract(pixel);float center=length(viewPosition(vUv));vec4 sum=vec4(0.);float total=0.;
for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec2 corner=vec2(float(x),float(y));vec2 uv=clamp((base+corner+.5)/volumeSize,0.,1.);vec2 bilinear=mix(1.-fraction,fraction,corner);float other=length(viewPosition(uv));float weight=bilinear.x*bilinear.y*exp(-abs(center-other)/max(.1,center*.02));sum+=texture2D(volume,uv)*weight;total+=weight;}
vec4 integrated=total>.00001 ? sum/total : texture2D(volume,vUv);vec4 scene=texture2D(tDiffuse,vUv);gl_FragColor=vec4(scene.rgb*integrated.a+integrated.rgb,scene.a);}`,
    });
    this.quad = new FullScreenQuad(this.march);
  }
  configure(settings: ScatteringSettings) {
    const uniforms = this.march.uniforms;
    uniforms.density.value = settings.density;
    uniforms.falloff.value = settings.heightFalloff;
    uniforms.baseHeight.value = settings.baseHeight;
    uniforms.maxDistance.value = settings.maxDistance;
    uniforms.steps.value = settings.steps;
    uniforms.radiance.value.set(settings.color).multiplyScalar(settings.intensity);
    uniforms.anisotropy.value = settings.anisotropy;
  }
  override setSize(width: number, height: number) {
    const w = Math.max(1, Math.ceil(width / 2)),
      h = Math.max(1, Math.ceil(height / 2));
    this.target.setSize(w, h);
    this.composite.uniforms.volumeSize.value.set(w, h);
  }
  override render(
    renderer: T.WebGLRenderer,
    write: T.WebGLRenderTarget,
    read: T.WebGLRenderTarget,
  ) {
    if (!read.depthTexture) throw Error("Scattering requires opaque scene depth");
    this.camera.updateMatrixWorld();
    for (const material of [this.march, this.composite]) {
      material.uniforms.depthMap.value = read.depthTexture;
      material.uniforms.inverseProjection.value.copy(this.camera.projectionMatrixInverse);
    }
    this.march.uniforms.cameraWorld.value.copy(this.camera.matrixWorld);
    this.quad.material = this.march;
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    this.composite.uniforms.tDiffuse.value = read.texture;
    this.quad.material = this.composite;
    renderer.setRenderTarget(this.renderToScreen ? null : write);
    this.quad.render(renderer);
  }
  override dispose() {
    this.target.dispose();
    this.march.dispose();
    this.composite.dispose();
    this.quad.dispose();
  }
}
