import * as T from "three";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import type { ScatteringSettings } from "./graphics-definition";
const vertex = "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}";
const depthFunctions = `uniform sampler2D depthMap;uniform mat4 inverseProjection;varying vec2 vUv;
vec3 viewPosition(vec2 uv){float d=texture2D(depthMap,clamp(uv,0.,1.)).r;vec4 p=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}`;
const integration = `
#include <packing>
uniform mat4 cameraWorld,shadowMatrix;uniform vec2 shadowTexel;
#ifdef VOLUME_COMPARE_SHADOW
uniform sampler2DShadow lightShadow;
#else
uniform sampler2D lightShadow;
#endif
uniform float density,falloff,baseHeight,maxDistance,anisotropy,shadowBias,jitter;
uniform int steps;uniform bool shadowEnabled;uniform vec3 radiance,lightDirection;
float visibility(vec3 point){if(!shadowEnabled)return 1.;vec4 projected=shadowMatrix*vec4(point,1.);vec3 uv=projected.xyz/projected.w;
if(any(lessThan(uv,vec3(0.)))||any(greaterThan(uv,vec3(1.))))return 1.;float sum=0.;
for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec2 offset=(vec2(float(x),float(y))-.5)*shadowTexel;
#ifdef VOLUME_COMPARE_SHADOW
sum+=texture(lightShadow,vec3(uv.xy+offset,uv.z+shadowBias));
#else
sum+=step(uv.z+shadowBias,texture2D(lightShadow,uv.xy+offset).r);
#endif
}return sum*.25;}
vec4 integrate(vec2 uv){vec3 p=viewPosition(uv);float distance=min(length(p),maxDistance);vec3 direction=normalize(mat3(cameraWorld)*p);vec3 origin=cameraWorld[3].xyz;
float ds=distance/float(steps),transmittance=1.;vec3 scattering=vec3(0.);float g=anisotropy;float cosine=dot(-direction,normalize(lightDirection));
float phase=(1.-g*g)/pow(max(.01,1.+g*g-2.*g*cosine),1.5);
float offset=mix(.5,fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+jitter)*43758.5453),step(.01,jitter));
for(int i=0;i<32;i++){if(i>=steps)break;vec3 samplePosition=origin+direction*((float(i)+offset)*ds);float extinction=density*exp(-max(0.,samplePosition.y-baseHeight)*falloff);float attenuation=exp(-extinction*ds);scattering+=transmittance*(1.-attenuation)*radiance*phase*visibility(samplePosition);transmittance*=attenuation;}
return vec4(scattering,transmittance);}`;
export function scatteringBytes(
  width: number,
  height: number,
  hdr: boolean,
  settings?: ScatteringSettings,
) {
  if (!settings) return 0;
  const divisor = settings.resolution === "full" ? 1 : 2,
    w = Math.max(1, Math.ceil(width / divisor)),
    h = Math.max(1, Math.ceil(height / divisor)),
    color = hdr ? 8 : 4;
  return (
    w * h * (color + (settings.temporal ? color * 2 + 4 : 0)) +
    (settings.transparentDepth === "nearest" ? width * height * 8 : 0)
  );
}
/** Bounded integration with optional directional PCF shadows, nearest transparent interface depth,
 * adaptive full-resolution edge integration, and depth-rejected temporal reprojection. */
export class ScatteringPass extends Pass {
  private target: T.WebGLRenderTarget;
  private march: T.ShaderMaterial;
  private composite: T.ShaderMaterial;
  private quad: FullScreenQuad;
  private settings?: ScatteringSettings;
  private width = 1;
  private height = 1;
  private frame = 0;
  private history?: {
    volume: T.WebGLRenderTarget;
    depth: T.WebGLRenderTarget;
    resolved: T.WebGLRenderTarget;
    material: T.ShaderMaterial;
    copy: T.ShaderMaterial;
    depthCopy: T.ShaderMaterial;
  };
  private transparentTarget?: T.WebGLRenderTarget;
  private historyValid = false;
  private historyWeightUsed = 0;
  resetHistory() {
    this.historyValid = false;
    this.historyWeightUsed = 0;
  }
  private previousViewProjection = new T.Matrix4();
  private previousView = new T.Matrix4();
  private previousInverseProjection = new T.Matrix4();
  private previousPosition = new T.Vector3();
  private previousQuaternion = new T.Quaternion();
  private lightKey = "";
  private shadowed = false;
  private lightFound = false;
  constructor(
    private camera: T.Camera,
    private hdr: boolean,
    private scene?: T.Scene,
  ) {
    super();
    this.target = this.makeTarget();
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
        shadowMatrix: { value: new T.Matrix4() },
        lightShadow: { value: null },
        shadowTexel: { value: new T.Vector2(1, 1) },
        shadowBias: { value: 0 },
        shadowEnabled: { value: false },
        jitter: { value: 0 },
      },
      vertexShader: vertex,
      fragmentShader: depthFunctions + integration + "void main(){gl_FragColor=integrate(vUv);}",
    });
    this.composite = new T.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        ...this.march.uniforms,
        tDiffuse: { value: null },
        volume: { value: this.target.texture },
        volumeSize: { value: new T.Vector2(1, 1) },
      },
      vertexShader: vertex,
      fragmentShader:
        depthFunctions +
        integration +
        `
uniform sampler2D tDiffuse,volume;uniform vec2 volumeSize;
void main(){vec2 pixel=vUv*volumeSize-.5,base=floor(pixel),fraction=fract(pixel);float center=length(viewPosition(vUv));vec4 sum=vec4(0.);float total=0.;
for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec2 corner=vec2(float(x),float(y));vec2 uv=clamp((base+corner+.5)/volumeSize,0.,1.);vec2 bilinear=mix(1.-fraction,fraction,corner);float other=length(viewPosition(uv));float weight=bilinear.x*bilinear.y*exp(-abs(center-other)/max(.1,center*.02));sum+=texture2D(volume,uv)*weight;total+=weight;}
vec4 integrated=total>.001 ? sum/total : integrate(vUv);vec4 sceneColor=texture2D(tDiffuse,vUv);gl_FragColor=vec4(sceneColor.rgb*integrated.a+integrated.rgb,sceneColor.a);}`,
    });
    this.quad = new FullScreenQuad(this.march);
  }
  private makeTarget(depth = false) {
    return new T.WebGLRenderTarget(1, 1, {
      type: depth ? T.UnsignedByteType : this.hdr ? T.HalfFloatType : T.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: T.NearestFilter,
      magFilter: T.NearestFilter,
    });
  }
  get snapshot() {
    return {
      resolution: this.settings?.resolution ?? "half",
      transparentDepth: this.settings?.transparentDepth ?? "opaque",
      temporal: !!this.history,
      historyValid: this.historyValid,
      historyWeightUsed: this.historyWeightUsed,
      shadowed: this.shadowed,
      reasons:
        this.settings?.lighting === "directional-shadow" && !this.shadowed
          ? [
              this.lightFound
                ? "Directional volume is unshadowed: enable supported directional shadow maps."
                : "No visible directional light: artistic scattering fallback.",
            ]
          : [],
    };
  }
  configure(settings: ScatteringSettings) {
    if (JSON.stringify(settings) !== JSON.stringify(this.settings)) this.historyValid = false;
    this.settings = structuredClone(settings);
    const u = this.march.uniforms;
    u.density.value = settings.density;
    u.falloff.value = settings.heightFalloff;
    u.baseHeight.value = settings.baseHeight;
    u.maxDistance.value = settings.maxDistance;
    u.steps.value = settings.steps;
    u.anisotropy.value = settings.anisotropy;
    if (settings.temporal && !this.history) this.createHistory();
    if (!settings.temporal && this.history) this.disposeHistory();
    if (settings.transparentDepth === "nearest" && !this.transparentTarget)
      this.transparentTarget = new T.WebGLRenderTarget(1, 1, {
        depthBuffer: true,
        depthTexture: new T.DepthTexture(1, 1, T.UnsignedIntType),
        stencilBuffer: false,
      });
    if (settings.transparentDepth !== "nearest" && this.transparentTarget) {
      this.transparentTarget.dispose();
      this.transparentTarget = undefined;
    }
    this.setSize(this.width, this.height);
  }
  private createHistory() {
    const volume = this.makeTarget(),
      depth = this.makeTarget(true),
      resolved = this.makeTarget();
    const material = new T.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        depthMap: { value: null },
        inverseProjection: { value: new T.Matrix4() },
        cameraWorld: { value: new T.Matrix4() },
        previousViewProjection: { value: this.previousViewProjection },
        previousView: { value: this.previousView },
        previousInverseProjection: { value: this.previousInverseProjection },
        currentVolume: { value: this.target.texture },
        historyVolume: { value: volume.texture },
        historyDepth: { value: depth.texture },
        size: { value: new T.Vector2(1, 1) },
        weight: { value: 0 },
        maxDistance: { value: 100 },
      },
      vertexShader: vertex,
      fragmentShader:
        depthFunctions +
        `
#include <packing>
uniform sampler2D currentVolume,historyVolume,historyDepth;uniform mat4 cameraWorld,previousViewProjection,previousView,previousInverseProjection;uniform vec2 size;uniform float weight,maxDistance;
void main(){vec4 current=texture2D(currentVolume,vUv);vec3 point=viewPosition(vUv);vec4 world=cameraWorld*vec4(normalize(point)*min(length(point),maxDistance),1.);vec4 previousClip=previousViewProjection*world;vec2 uv=previousClip.xy/previousClip.w*.5+.5;
float blend=weight;if(previousClip.w<=0.||any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))blend=0.;
float oldDepth=unpackRGBAToDepth(texture2D(historyDepth,clamp(uv,0.,1.)));vec4 oldPoint=previousInverseProjection*vec4(uv*2.-1.,oldDepth*2.-1.,1.);vec4 expected=previousView*(cameraWorld*vec4(point,1.));
if(abs(oldPoint.z/oldPoint.w-expected.z)>max(.05,abs(expected.z)*.01))blend=0.;
vec4 low=current,high=current;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec4 sampleValue=texture2D(currentVolume,clamp(vUv+vec2(float(x),float(y))/size,0.,1.));low=min(low,sampleValue);high=max(high,sampleValue);}
vec4 history=clamp(texture2D(historyVolume,clamp(uv,0.,1.)),low,high);gl_FragColor=mix(current,history,blend);}`,
    });
    const copy = new T.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: { source: { value: resolved.texture } },
      vertexShader: vertex,
      fragmentShader:
        "varying vec2 vUv;uniform sampler2D source;void main(){gl_FragColor=texture2D(source,vUv);}",
    });
    const depthCopy = new T.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: { source: { value: null } },
      vertexShader: vertex,
      fragmentShader:
        "#include <packing>\nvarying vec2 vUv;uniform sampler2D source;void main(){gl_FragColor=packDepthToRGBA(texture2D(source,vUv).r);}",
    });
    this.history = { volume, depth, resolved, material, copy, depthCopy };
    this.historyValid = false;
  }
  private disposeHistory() {
    const h = this.history;
    if (!h) return;
    h.volume.dispose();
    h.depth.dispose();
    h.resolved.dispose();
    h.material.dispose();
    h.copy.dispose();
    h.depthCopy.dispose();
    this.history = undefined;
    this.historyValid = false;
  }
  override setSize(width: number, height: number) {
    const divisor = this.settings?.resolution === "full" ? 1 : 2,
      w = Math.max(1, Math.ceil(width / divisor)),
      h = Math.max(1, Math.ceil(height / divisor));
    if (
      this.width !== width ||
      this.height !== height ||
      this.target.width !== w ||
      this.target.height !== h
    )
      this.historyValid = false;
    this.width = width;
    this.height = height;
    this.target.setSize(w, h);
    this.composite.uniforms.volumeSize.value.set(w, h);
    if (this.history) {
      this.history.volume.setSize(w, h);
      this.history.depth.setSize(w, h);
      this.history.resolved.setSize(w, h);
      this.history.material.uniforms.size.value.set(w, h);
    }
    this.transparentTarget?.setSize(width, height);
  }
  private nearestDepth(renderer: T.WebGLRenderer) {
    if (!this.scene || !this.transparentTarget) return undefined;
    const changed = new Map<
        T.Material,
        { colorWrite: boolean; depthWrite: boolean; alphaTest: number }
      >(),
      hidden: T.Object3D[] = [];
    const auto = renderer.shadowMap.autoUpdate,
      needs = renderer.shadowMap.needsUpdate;
    try {
      this.scene.traverse((object) => {
        if (object.userData.volume && object.visible) {
          hidden.push(object);
          object.visible = false;
        }
        if (object instanceof T.Mesh)
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            if (!changed.has(material)) {
              changed.set(material, {
                colorWrite: material.colorWrite,
                depthWrite: material.depthWrite,
                alphaTest: material.alphaTest,
              });
              material.colorWrite = false;
              material.depthWrite = material.opacity > 0.001;
              if (material.transparent && material.alphaTest < 0.01) {
                material.alphaTest = 0.01;
                material.needsUpdate = true;
              }
            }
      });
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      renderer.setRenderTarget(this.transparentTarget);
      renderer.clear();
      renderer.render(this.scene, this.camera);
      return this.transparentTarget.depthTexture;
    } finally {
      for (const [material, before] of changed) {
        const variant = material.alphaTest !== before.alphaTest;
        Object.assign(material, before);
        if (variant) material.needsUpdate = true;
      }
      for (const object of hidden) object.visible = true;
      renderer.shadowMap.autoUpdate = auto;
      renderer.shadowMap.needsUpdate = needs;
    }
  }
  private lighting(renderer: T.WebGLRenderer) {
    const u = this.march.uniforms,
      s = this.settings!;
    u.radiance.value.set(s.color).multiplyScalar(s.intensity);
    u.lightDirection.value.set(0.3, 0.8, 0.2).normalize();
    u.shadowEnabled.value = false;
    u.lightShadow.value = null;
    this.shadowed = false;
    this.lightFound = false;
    let primary: T.DirectionalLight | undefined;
    if (s.lighting === "directional-shadow")
      this.scene?.traverseVisible((object) => {
        if (
          object instanceof T.DirectionalLight &&
          object.intensity > 0 &&
          (!primary || object.intensity > primary.intensity)
        )
          primary = object;
      });
    if (primary) {
      const target = new T.Vector3();
      primary.getWorldPosition(u.lightDirection.value);
      primary.target.getWorldPosition(target);
      u.lightDirection.value.sub(target).normalize();
      u.radiance.value.multiply(primary.color).multiplyScalar(primary.intensity);
      this.lightFound = true;
      if (
        primary.castShadow &&
        primary.shadow.map &&
        renderer.shadowMap.enabled &&
        renderer.shadowMap.type !== T.VSMShadowMap
      ) {
        u.shadowEnabled.value = true;
        u.lightShadow.value = primary.shadow.map.depthTexture;
        u.shadowMatrix.value.copy(primary.shadow.matrix);
        u.shadowBias.value = primary.shadow.bias;
        u.shadowTexel.value.set(1 / primary.shadow.map.width, 1 / primary.shadow.map.height);
        this.shadowed = true;
      }
    }
    const compare = !!u.lightShadow.value?.compareFunction;
    for (const material of [this.march, this.composite])
      if (!!material.defines.VOLUME_COMPARE_SHADOW !== compare) {
        material.defines = compare ? { VOLUME_COMPARE_SHADOW: 1 } : {};
        material.needsUpdate = true;
      }
    const key = JSON.stringify([
      u.lightDirection.value.toArray(),
      u.radiance.value.toArray(),
      u.shadowEnabled.value,
      ...(u.shadowEnabled.value ? u.shadowMatrix.value.elements : []),
    ]);
    if (key !== this.lightKey) {
      this.historyValid = false;
      this.lightKey = key;
    }
  }
  private draw(
    renderer: T.WebGLRenderer,
    target: T.WebGLRenderTarget | null,
    material: T.ShaderMaterial,
  ) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }
  override render(
    renderer: T.WebGLRenderer,
    write: T.WebGLRenderTarget,
    read: T.WebGLRenderTarget,
  ) {
    if (!read.depthTexture || !this.settings)
      throw Error("Scattering requires scene depth/settings");
    this.camera.updateMatrixWorld();
    const depth = this.nearestDepth(renderer) ?? read.depthTexture,
      u = this.march.uniforms;
    u.depthMap.value = depth;
    u.inverseProjection.value.copy(this.camera.projectionMatrixInverse);
    u.cameraWorld.value.copy(this.camera.matrixWorld);
    u.jitter.value = this.history ? (++this.frame % 4096) + 1 : 0;
    this.lighting(renderer);
    this.draw(renderer, this.target, this.march);
    let volume = this.target.texture;
    if (this.history) {
      const h = this.history,
        position = new T.Vector3(),
        quaternion = new T.Quaternion();
      this.camera.getWorldPosition(position);
      this.camera.getWorldQuaternion(quaternion);
      if (
        position.distanceTo(this.previousPosition) > Math.max(1, this.settings.maxDistance * 0.1) ||
        Math.abs(quaternion.dot(this.previousQuaternion)) < 0.95
      )
        this.historyValid = false;
      if (!this.previousInverseProjection.equals(this.camera.projectionMatrixInverse))
        this.historyValid = false;
      h.material.uniforms.depthMap.value = depth;
      h.material.uniforms.inverseProjection.value.copy(this.camera.projectionMatrixInverse);
      h.material.uniforms.cameraWorld.value.copy(this.camera.matrixWorld);
      h.material.uniforms.weight.value = this.historyValid
        ? (this.settings.historyWeight ?? 0.85)
        : 0;
      this.historyWeightUsed = h.material.uniforms.weight.value;
      h.material.uniforms.maxDistance.value = this.settings.maxDistance;
      this.draw(renderer, h.resolved, h.material);
      volume = h.resolved.texture;
      this.draw(renderer, h.volume, h.copy);
      h.depthCopy.uniforms.source.value = depth;
      this.draw(renderer, h.depth, h.depthCopy);
      this.previousViewProjection.multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      );
      this.previousView.copy(this.camera.matrixWorldInverse);
      this.previousInverseProjection.copy(this.camera.projectionMatrixInverse);
      this.previousPosition.copy(position);
      this.previousQuaternion.copy(quaternion);
      this.historyValid = true;
    }
    this.composite.uniforms.tDiffuse.value = read.texture;
    this.composite.uniforms.volume.value = volume;
    this.draw(renderer, this.renderToScreen ? null : write, this.composite);
  }
  override dispose() {
    this.disposeHistory();
    this.transparentTarget?.dispose();
    this.target.dispose();
    this.march.dispose();
    this.composite.dispose();
    this.quad.dispose();
  }
}
