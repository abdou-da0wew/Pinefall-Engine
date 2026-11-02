import { test, expect } from "bun:test";
import { defaultExportProfile, parseExportProfile } from "../packages/project/src/export-profile";
import { preflightExport } from "../packages/project/src/export-preflight";
import { createGame } from "../packages/project/src";
test("Generic game export profile roundtrips unrelated games and target intent", () => {
  for (const target of ["web", "linux-appimage", "windows-zip"] as const) {
    const profile = { ...defaultExportProfile("Another Game"), target };
    expect(parseExportProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
    expect(preflightExport(createGame("Another Game"), profile).artifact).toBeNull();
  }
});
test("Export profiles reject unsafe paths, unknown executable/secret fields and invalid dimensions", () => {
  const p = defaultExportProfile("My Game");
  for (const include of [
    ["../secret"],
    ["/etc/passwd"],
    ["C:\\game"],
    ["assets/CON.wav"],
    ["a.png", "A.png"],
    ["assets/.env"],
    ["assets/a%2fb"],
    ["assets/a."],
  ])
    expect(() => parseExportProfile({ ...p, include })).toThrow();
  expect(() => parseExportProfile({ ...p, command: "run code" })).toThrow();
  expect(() => parseExportProfile({ ...p, app: { ...p.app, token: "secret" } })).toThrow();
  expect(() => parseExportProfile({ ...p, window: { ...p.window, width: NaN } })).toThrow();
  expect(() => parseExportProfile({ ...p, schemaVersion: 2 })).toThrow();
});
test("Export preflight compiles but never executes game scripts and does not claim packaging", () => {
  const scene = createGame("No execution");
  scene.scripts = [
    {
      id: "sentinel",
      name: "Sentinel.ts",
      source: 'throw new Error("DO NOT EXECUTE"); export default ()=>({});',
    },
  ];
  const result = preflightExport(scene, defaultExportProfile(scene.name));
  expect(result.requiresScriptTrust).toBe(true);
  expect(result.status).toBe("preflight-only");
  expect(result.artifact).toBeNull();
  expect(result.counts.scripts).toBe(1);
  scene.scripts[0].source = "export default function (";
  expect(() => preflightExport(scene, defaultExportProfile(scene.name))).toThrow();
});
