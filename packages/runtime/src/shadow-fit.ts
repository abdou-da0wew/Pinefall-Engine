import * as T from "three";
import type { LightDefinition } from "./graphics-definition";
const bias = new T.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
/** Fits the directional shadow camera without modifying authored light transforms.
 * Bounds must conservatively include deforming casters; padding covers modest motion. */
export function fitDirectionalShadow(light: T.DirectionalLight, bounds: T.Box3, padding = 1) {
  if (bounds.isEmpty()) return;
  const camera = light.shadow.camera;
  camera.updateMatrixWorld(true);
  const points: T.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z])
        points.push(new T.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
  const local = new T.Box3().setFromPoints(points);
  if (local.max.z >= -0.1) {
    camera.translateZ(local.max.z + padding + 0.1);
    camera.updateMatrixWorld(true);
    const shift = local.max.z + padding + 0.1;
    local.min.z -= shift;
    local.max.z -= shift;
  }
  const width = Math.max(0.1, local.max.x - local.min.x) + padding * 2,
    height = Math.max(0.1, local.max.y - local.min.y) + padding * 2;
  const texelX = width / light.shadow.mapSize.x,
    texelY = height / light.shadow.mapSize.y;
  const centerX = Math.round(((local.min.x + local.max.x) * 0.5) / texelX) * texelX,
    centerY = Math.round(((local.min.y + local.max.y) * 0.5) / texelY) * texelY;
  camera.left = centerX - width * 0.5 - texelX;
  camera.right = centerX + width * 0.5 + texelX;
  camera.bottom = centerY - height * 0.5 - texelY;
  camera.top = centerY + height * 0.5 + texelY;
  camera.near = Math.max(0.01, -local.max.z - padding);
  camera.far = Math.max(camera.near + 1, -local.min.z + padding);
  camera.updateProjectionMatrix();
  const viewProjection = new T.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  light.shadow.getFrustum().setFromProjectionMatrix(viewProjection);
  light.shadow.matrix.copy(bias).multiply(viewProjection);
}
export function installDirectionalFit(light: T.DirectionalLight, bounds: () => T.Box3) {
  if (light.userData.pinefallFitInstalled) return;
  light.userData.pinefallFitInstalled = true;
  const update = light.shadow.updateMatrices.bind(light.shadow);
  light.shadow.updateMatrices = (target: T.Light) => {
    update(target);
    const definition = light.userData.pinefallLight as LightDefinition | undefined;
    if (definition?.shadowFrustum === "scene")
      fitDirectionalShadow(light, bounds(), definition.shadowPadding ?? 1);
  };
}
