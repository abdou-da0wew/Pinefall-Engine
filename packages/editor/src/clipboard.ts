import { cloneScene, parseScene, type SceneDocument } from "../../runtime/src/schema";
import { descendants, duplicateNodes, moveNodes } from "./hierarchy-model";
/** Session clipboard contains definitions/references, never model/source bytes. */
export interface SceneClipboard {
  scene: SceneDocument;
  ids: string[];
  project: string;
}
export function copySceneSelection(scene: SceneDocument, ids: string[]): SceneClipboard {
  const copy = cloneScene(scene);
  moveNodes(copy, ids, null);
  return { scene: copy, ids: [...ids], project: scene.project?.id ?? scene.name };
}
export function pasteSceneSelection(scene: SceneDocument, clipboard: SceneClipboard) {
  if ((scene.project?.id ?? scene.name) !== clipboard.project)
    throw Error(
      "This clipboard belongs to another project. Use prefab export/import across projects.",
    );
  const source = cloneScene(clipboard.scene),
    ids = duplicateNodes(source, clipboard.ids),
    all = descendants(source, ids);
  scene.entities.push(...source.entities.filter((entity) => all.has(entity.id)));
  scene.collections ??= [];
  scene.collections.push(
    ...(source.collections ?? []).filter((collection) => all.has(collection.id)),
  );
  parseScene(scene);
  return ids;
}
