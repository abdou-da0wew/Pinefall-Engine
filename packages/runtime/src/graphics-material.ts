import * as T from "three";
import {
  parseSurface,
  type Surface,
  parseLight,
  type LightDefinition,
} from "./graphics-definition";
export function surfaceMaterial(input: Surface): T.MeshStandardMaterial | T.MeshBasicMaterial {
  const s = parseSurface(input);
  const common = {
    color: s.color,
    opacity: s.opacity,
    transparent: s.alphaMode === "blend",
    alphaTest: s.alphaMode === "mask" ? s.alphaCutoff : 0,
    side: s.doubleSided ? T.DoubleSide : T.FrontSide,
    depthWrite: s.alphaMode !== "blend",
  };
  return s.family === "unlit"
    ? new T.MeshBasicMaterial(common)
    : new T.MeshStandardMaterial({
        ...common,
        roughness: s.roughness,
        metalness: s.metalness,
        emissive: s.emissive,
        emissiveIntensity: s.emissiveIntensity,
      });
}
export type SceneLight = T.PointLight | T.SpotLight | T.DirectionalLight;
export function makeLight(input: LightDefinition): SceneLight {
  const s = parseLight(input);
  const light =
    s.type === "directional"
      ? new T.DirectionalLight()
      : s.type === "spot"
        ? new T.SpotLight()
        : new T.PointLight();
  light.position.set(0, 0, 0);
  applyLight(light, s);
  return light;
}
export function applyLight(light: SceneLight, input: LightDefinition) {
  const s = parseLight(input);
  light.color.set(s.color);
  light.intensity = s.intensity;
  if (light instanceof T.PointLight || light instanceof T.SpotLight) {
    light.distance = s.range;
    light.decay = s.decay ?? 2;
  }
  if (light instanceof T.SpotLight) {
    light.angle = T.MathUtils.degToRad(s.angle ?? 28.65);
    light.penumbra = s.penumbra ?? 0.6;
  }
  light.shadow.bias = s.bias ?? -0.0005;
  light.shadow.normalBias = s.normalBias ?? 0.02;
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = s.range;
  if (light instanceof T.DirectionalLight)
    Object.assign(light.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.autoUpdate = (s.shadowUpdate ?? "every-frame") === "every-frame";
  if (s.shadowUpdate !== "manual" || !light.shadow.map) light.shadow.needsUpdate = true;
  light.userData.pinefallLight = s;
}
/** Update only a privately owned instance material. Scalar edits keep the program identity. */
export function updateSurface(
  material: T.MeshStandardMaterial | T.MeshBasicMaterial,
  input: Surface,
) {
  const s = parseSurface(input);
  const transparent = s.alphaMode === "blend",
    alphaTest = s.alphaMode === "mask" ? s.alphaCutoff : 0,
    side = s.doubleSided ? T.DoubleSide : T.FrontSide;
  const variant =
    material.transparent !== transparent ||
    material.alphaTest > 0 !== alphaTest > 0 ||
    material.side !== side;
  material.color.set(s.color);
  material.opacity = s.opacity;
  material.transparent = transparent;
  material.alphaTest = alphaTest;
  material.side = side;
  material.depthWrite = !transparent;
  if (material instanceof T.MeshStandardMaterial) {
    material.roughness = s.roughness;
    material.metalness = s.metalness;
    material.emissive.set(s.emissive);
    material.emissiveIntensity = s.emissiveIntensity;
  }
  if (variant) material.needsUpdate = true;
}
