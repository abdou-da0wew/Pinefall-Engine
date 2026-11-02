import { parseScene, type SceneDocument } from "../../runtime/src/schema";
import { compileScript } from "../../scripting/src/compiler";
import { parseExportProfile, type ExportProfile } from "./export-profile";
/** Validation only: never execute scripts, copy resources or claim an artifact was built. */
export function preflightExport(input: SceneDocument, profile: ExportProfile) {
  const scene = parseScene(input),
    checked = parseExportProfile(profile);
  for (const script of scene.scripts ?? []) compileScript(script.source);
  return {
    schemaVersion: 1 as const,
    profile: checked,
    project: { name: scene.name, id: scene.project?.id ?? null },
    counts: {
      entities: scene.entities.length,
      models: scene.assets.length,
      scripts: scene.scripts?.length ?? 0,
      images: scene.graphics?.images?.length ?? 0,
      audio: scene.audio?.assets.length ?? 0,
    },
    requiresScriptTrust: !!scene.scripts?.length,
    requiresShaderTrust: !!scene.entities.some((entity) => entity.mesh?.shader),
    status: "preflight-only" as const,
    artifact: null,
    warnings: [
      "Preflight does not prove dynamic include files exist or that the game runs.",
      "Generic profile-driven assembly and desktop packaging are not implemented yet. Use the existing export-web command or a reviewed game-specific recipe.",
      "Physical Windows/CEDAR execution, signing and hardware performance are not inferred from validation.",
    ],
  };
}
