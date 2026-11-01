import { test, expect } from "bun:test";
import * as T from "three";
import { makeLight, applyLight } from "../packages/runtime/src/graphics-material";
import { parseLight } from "../packages/runtime/src/graphics-definition";
import { installDirectionalFit } from "../packages/runtime/src/shadow-fit";
const definition = { type: "directional" as const, color: "#ffffff", intensity: 1, range: 100 };
test("independent manual shadow policies survive light edits while explicit invalidation remains possible", () => {
  const manual = makeLight({ ...definition, shadowUpdate: "manual" });
  const dynamic = makeLight({ ...definition, shadowUpdate: "every-frame" });
  expect(manual.shadow.autoUpdate).toBe(false);
  expect(dynamic.shadow.autoUpdate).toBe(true);
  manual.shadow.map = new T.WebGLRenderTarget(1, 1);
  manual.shadow.needsUpdate = false;
  applyLight(manual, { ...definition, shadowUpdate: "manual", intensity: 2 });
  expect(manual.shadow.needsUpdate).toBe(false);
  manual.shadow.needsUpdate = true;
  expect(manual.shadow.needsUpdate).toBe(true);
  manual.shadow.dispose();
  dynamic.shadow.dispose();
  expect(() => parseLight({ ...definition, shadowUpdate: "unknown" })).toThrow();
});
test("fitted directional frustum contains the scene bounds without moving the authored light", () => {
  const light = makeLight({
    ...definition,
    shadowFrustum: "scene",
    shadowPadding: 1,
  }) as T.DirectionalLight;
  light.position.set(2, 5, 2);
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  const original = light.position.clone(),
    bounds = new T.Box3(new T.Vector3(-10, -2, -8), new T.Vector3(10, 12, 8));
  installDirectionalFit(light, () => bounds);
  light.shadow.updateMatrices(light);
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const clip = new T.Vector3(x, y, z).project(light.shadow.camera);
        expect(Math.abs(clip.x)).toBeLessThanOrEqual(1.001);
        expect(Math.abs(clip.y)).toBeLessThanOrEqual(1.001);
        expect(Math.abs(clip.z)).toBeLessThanOrEqual(1.001);
      }
  expect(light.position.equals(original)).toBe(true);
  expect(light.shadow.camera.near).toBeGreaterThan(0);
  light.shadow.dispose();
});
