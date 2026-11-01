import { ProjectFilesDialog } from "./project-files-dialog";
import { FolderSession, type FolderSnapshot } from "../../project/src/folder-session";
import {
  DEFAULT_SHADER,
  parseShader,
  type ShaderSource,
} from "../../runtime/src/shader-definition";
import { SCRIPT_TEMPLATE, uniqueScriptName } from "../../scripting/src/template";
import { PreviewRendering, previewPost, SurfaceDialog } from "./render-controls";
import { DEFAULT_SURFACE, emptyGraphics } from "../../runtime/src/graphics-definition";
import { ARCHIVE_BYTES } from "../../assets/src/limits";
import { openLocalSnapshot } from "../../project/src/local-snapshot";
import { CommandPalette } from "./command-palette";
import { dispatchShortcut, type EditorCommand } from "./commands";
import { Home, SettingsDialog } from "./home";
import { rememberProject } from "./recent-projects";
import { readPreferences, applyPreferences, panelDefinitions } from "./preferences";
import { Dialog, ActionMenu, MenuItem, Panel, ConfirmationProvider, useConfirm } from "./ui";
import { Button, Input, Select } from "./ui";
import { AudioDialog } from "./audio-dialog";
import { AnimationPanel } from "./animation-panel";
import {
  rememberMissing,
  missingCompanion,
  repairFiles,
  type PendingImport,
} from "../../assets/src/pending";
import { version as engineVersion } from "../../../package.json";
import { prepareReimports } from "../../assets/src/reimport";
import { defaultRecipe, type ImportRecipe } from "../../assets/src/recipe";
import { sceneDependencyGraph } from "../../assets/src/dependencies";
import { ReimportReview } from "./ReimportReview";
import { assetDatabase } from "../../assets/src/database";
import { referenceScene, sceneReferences } from "../../assets/src/documents";
import { blobs } from "../../assets/src/blobs";
import { prepareImport, adoptImport, reimportInputs } from "../../assets/src/import";
import { newProjectMetadata } from "../../project/src/metadata";
import { projectJob } from "../../project/src/pif-client";
import { UIEditor, type UIEditorActions, type UIClipboard } from "./ui-editor";
import { ColorPicker } from "./color-picker";
import { descendants } from "./hierarchy-model";
import { Hierarchy, type HierarchyActions } from "./hierarchy";
import { Icon } from "./icons";
import { useWorkspaceLayout } from "./layout";
import { ScriptPanel, ScriptAttachments } from "./scripting";
import { hasSceneScripts } from "../../scripting/src/runtime";
import { createGame, placeModel } from "../../project/src";
/* oxlint-disable react/refs -- Event-handler closures access runtime refs; no React Compiler is used. History is revision-driven. */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/space-grotesk/500.css";
import "./style.css";
import "./ui.css";
import {
  Engine,
  LOW,
  HIGH,
  entity,
  cloneScene,
  parseScene,
  serializeSceneAsync,
} from "../../runtime/src";
import type { Entity, SceneDocument, RenderSettings, Template, Stats } from "../../runtime/src";
import type { EngineEvent } from "../../runtime/src/events";
import { createTemplate } from "../../../examples/templates";
import { History } from "./history";
const templateNames: Record<Template, string> = {
  adventure: "Third-person adventure",
  "first-person": "First-person exploration",
  driving: "Arcade driving",
  sandbox: "Physics sandbox",
};
let bootScene: SceneDocument | undefined;
let bootNotice = "";
let recoveryBlocked = false;
let hasRecovery = false;
let startInEditor = false;
function initialScene() {
  if (bootScene) return bootScene;
  try {
    const saved = localStorage.getItem("pinefall-engine.scene.v1");
    if (saved) {
      const scene = parseScene(JSON.parse(saved));
      hasRecovery = true;
      return scene;
    }
  } catch {}
  return createTemplate("adventure");
}
async function download(name: string, text: string) {
  if (window.engineDesktop) {
    await window.engineDesktop.save(name, text);
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function App({
  onHome,
  initialFolder,
}: {
  initialFolder?: FolderSession;
  onHome: (
    scene: SceneDocument,
    skipSnapshot?: boolean,
    isCurrent?: () => boolean,
  ) => Promise<void>;
}) {
  const confirm = useConfirm();
  const [paletteOpen, setPaletteOpen] = useState(false),
    [selectionDomain, setSelectionDomain] = useState<"scene" | "ui">("scene");
  const [uiClipboard, setUIClipboard] = useState<UIClipboard>();
  const hierarchyActions = useRef<HierarchyActions | null>(null),
    uiActions = useRef<UIEditorActions | null>(null);
  const [newGameError, setNewGameError] = useState("");
  const [homeError, setHomeError] = useState("");
  const [assetActionsOpen, setAssetActionsOpen] = useState(false);
  const [homeBusy, setHomeBusy] = useState(false),
    [preferencesOpen, setPreferencesOpen] = useState(false),
    [importSettingsOpen, setImportSettingsOpen] = useState(false);
  useLayoutEffect(() => {
    if (!homeBusy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [homeBusy]);
  const [recipe, setRecipe] = useState<ImportRecipe>(defaultRecipe);
  const [overrideRecipe, setOverrideRecipe] = useState(false);
  const [review, setReview] = useState<React.ComponentProps<typeof ReimportReview> | null>(null);
  const checkpointRevision = useRef(0);
  const [loadBusy, setLoadBusy] = useState(false);
  const [pendingImports, setPendingImports] = useState<
    { id: string; missing: string; name: string }[]
  >([]);
  const pendingRepair = useRef<string | null>(null);
  const [loadedScene, setLoadedScene] = useState<SceneDocument | null>(null);
  const [failedScene, setFailedScene] = useState<SceneDocument | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [importBusy, setImportBusy] = useState(false);
  const [importOnly, setImportOnly] = useState(false);
  const importAbort = useRef<AbortController | null>(null);
  const reimportTarget = useRef<{ id: string; data: string; revision: number } | undefined>(
    undefined,
  );
  const [projectBusy, setProjectBusy] = useState(false);
  const projectAbort = useRef<AbortController | null>(null);
  const projectCommands = useRef<(event: KeyboardEvent) => void>(() => {});
  const [uiSelected, setUISelected] = useState("");
  const [trustedSignature, setTrustedSignature] = useState<string | null>(null),
    [scriptId, setScriptId] = useState("");
  const [audioOpen, setAudioOpen] = useState(false);
  const [materialEditor, setMaterialEditor] = useState(false);
  const [shaderEditor, setShaderEditor] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [folderSession, setFolderSession] = useState<FolderSession | null>(initialFolder ?? null);
  const [repackShortcut, setRepackShortcut] = useState("Mod+Shift+S");
  useEffect(() => {
    if (!folderSession) return;
    void folderSession.api
      .repackStatus(folderSession.grant.id)
      .then((v) => setRepackShortcut(v.settings.shortcut))
      .catch(() => {});
  }, [folderSession, filesOpen]);
  const [folderPending, setFolderPending] = useState<FolderSnapshot | null>(null);
  const folderAbort = useRef<AbortController | null>(null);
  const folderApplyAbort = useRef<AbortController | null>(null);
  const folderSaveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const preloadedScene = useRef<SceneDocument | null>(null);
  const [newGameOpen, setNewGameOpen] = useState(false),
    [gameName, setGameName] = useState("My New Game"),
    [gameStarter, setGameStarter] = useState("blank");
  const [scene, setScene] = useState(() => {
      const scene = initialScene();
      scene.project ??= newProjectMetadata(scene.name);
      return scene;
    }),
    [selected, setSelected] = useState<string | null>(null),
    [playing, setPlaying] = useState(false),
    [paused, setPaused] = useState(false),
    [settings, setSettings] = useState<RenderSettings>(() => ({
      ...(readPreferences().quality === "high" ? HIGH : LOW),
    })),
    [tab, setTab] = useState<"assets" | "console" | "guide" | "scripts" | "ui">("assets"),
    [inspector, setInspector] = useState<"entity" | "render">("entity"),
    [logs, setLogs] = useState<EngineEvent[]>([]),
    [error, setError] = useState(""),
    [status, setStatus] = useState(bootNotice || "Initializing physics and renderer…"),
    [ready, setReady] = useState(false),
    [stats, setStats] = useState<Stats | null>(null),
    [score, setScore] = useState({ collected: 0, total: 5, won: false, speed: 0 }),
    [revision, setRevision] = useState(0),
    [tool, setTool] = useState<"translate" | "rotate" | "scale">("translate");
  const workspace = useWorkspaceLayout(tab === "scripts" || tab === "ui");
  const canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<Engine | null>(null),
    history = useRef(new History()),
    current = useRef(scene),
    file = useRef<HTMLInputElement>(null),
    glb = useRef<HTMLInputElement>(null),
    prefabFile = useRef<HTMLInputElement>(null);
  async function refreshPending(projectId = current.current.project?.id) {
    if (!projectId) return;
    try {
      const rows = await assetDatabase.pendingSummaries(projectId);
      if (current.current.project?.id === projectId) setPendingImports(rows);
    } catch {
      setStatus("Pending import storage unavailable; keep your source files.");
    }
  }
  useEffect(() => {
    void refreshPending(scene.project?.id);
  }, [scene.project?.id]);
  const applyRef = useRef<(fn: (scene: SceneDocument) => void) => void>(() => {});
  useEffect(() => {
    const handler = (e: KeyboardEvent) => projectCommands.current(e);
    window.addEventListener("keydown", handler);
    const importInput = glb.current;
    const cancelImportChoice = () => {
      pendingRepair.current = null;
      reimportTarget.current = undefined;
      setStatus("Import selection cancelled");
    };
    importInput?.addEventListener("cancel", cancelImportChoice);
    return () => {
      window.removeEventListener("keydown", handler);
      importInput?.removeEventListener("cancel", cancelImportChoice);
      projectAbort.current?.abort();
      importAbort.current?.abort();
    };
  }, []);
  projectCommands.current = (event) => dispatchShortcut(event, getCommands(), setStatus);
  async function saveProject() {
    if (projectAbort.current) return;
    const controller = new AbortController();
    projectAbort.current = controller;
    setProjectBusy(true);
    setStatus("Compressing PIF project in worker…");
    try {
      if (folderSession) {
        await folderSaveQueue.current.catch(() => {});
        const cancel = () => void folderSession.api.cancelArchive();
        controller.signal.addEventListener("abort", cancel, { once: true });
        try {
          controller.signal.throwIfAborted();
          const result = await folderSession.api.repack(folderSession.grant.id);
          setStatus(
            result.archive ? "Raw folder PIF backup saved: " + result.archive : "Backup cancelled",
          );
        } finally {
          controller.signal.removeEventListener("abort", cancel);
        }
        return;
      }
      const name = current.current.name;
      const snapshot = cloneScene(current.current);
      if (snapshot.project) {
        snapshot.project.editor.activeTool = tool;
        snapshot.project.editor.layout = workspace.dock;
      }
      const bytes = await projectJob("pack", snapshot, controller.signal);
      if (controller.signal.aborted) return;
      if (window.engineDesktop) {
        const saved = await window.engineDesktop.save(name + ".pif", bytes);
        setStatus(saved ? "PIF project saved" : "Save cancelled");
        if (saved)
          try {
            await rememberProject(snapshot, bytes);
          } catch (error) {
            setStatus("PIF saved; recent snapshot failed: " + String(error));
          }
      } else {
        const url = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: "application/x-xz" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = name + ".pif";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus("PIF project exported");
        try {
          await rememberProject(snapshot, bytes);
        } catch (error) {
          setStatus("PIF exported; recent snapshot failed: " + String(error));
        }
      }
    } catch (error) {
      setStatus(String(error));
    } finally {
      if (projectAbort.current === controller) projectAbort.current = null;
      setProjectBusy(false);
    }
  }

  async function launchPlayer() {
    if (projectAbort.current || playing || homeBusy || importBusy || loadBusy) return;
    const controller = new AbortController(),
      before = current.current;
    projectAbort.current = controller;
    setProjectBusy(true);
    setStatus("Saving verified snapshot for standalone preview…");
    try {
      await rememberProject(before, undefined, controller.signal);
      controller.signal.throwIfAborted();
      if (current.current !== before)
        throw Error("Project changed while preparing preview; retry after finishing edits.");
      const url = new URL("./game.html", location.href);
      url.searchParams.set("recent", before.project!.id);
      location.assign(url.href);
    } catch (error) {
      setStatus(String(error) + ". Editor kept open.");
    } finally {
      if (projectAbort.current === controller) projectAbort.current = null;
      setProjectBusy(false);
    }
  }
  async function createNewGame() {
    if (projectAbort.current || playing) return;
    const controller = new AbortController(),
      before = current.current;
    projectAbort.current = controller;
    setProjectBusy(true);
    setNewGameError("");
    recoveryBlocked = false;
    importAbort.current?.abort();
    try {
      await rememberProject(before, undefined, controller.signal);
      if (controller.signal.aborted || current.current !== before || engine.current?.playing)
        throw Error("Project changed or operation cancelled; no replacement was made.");
      const next =
        gameStarter === "blank" ? createGame(gameName) : createTemplate(gameStarter as Template);
      next.name = gameName;
      const checked = parseScene(next);
      checked.project ??= newProjectMetadata(checked.name);
      if (JSON.stringify(checked) === JSON.stringify(current.current)) return;
      history.current.commit(current.current);
      current.current = checked;
      setScene(checked);
      setSelected(null);
      setRevision((r) => r + 1);
      setNewGameOpen(false);
    } catch (e) {
      setStatus(String(e));
      setNewGameError(String(e));
    } finally {
      if (projectAbort.current === controller) projectAbort.current = null;
      setProjectBusy(false);
    }
  }

  async function openExternalSource(kind: "script" | "shader" | "scene", id = "") {
    if (!folderSession || folderSession.boundProjectId !== current.current.project?.id) {
      setFilesOpen(true);
      return;
    }
    try {
      await folderSaveQueue.current.catch(() => {});
      await folderSession.save(current.current);
      const path =
        kind === "scene"
          ? "scene.json"
          : kind === "script"
            ? folderSession.layout?.scripts[id]
            : folderSession.layout?.shaders[id]?.source;
      if (!path) {
        setFilesOpen(true);
        return;
      }
      await folderSession.api.openExternal(folderSession.grant.id, path);
    } catch (error) {
      setStatus(String(error));
      setFilesOpen(true);
    }
  }
  async function validateFolder() {
    if (!folderSession) throw Error("Choose a working project folder first");
    folderAbort.current?.abort();
    const controller = new AbortController();
    folderAbort.current = controller;
    setFolderPending(null);
    const snapshot = await folderSession.read(controller.signal);
    controller.signal.throwIfAborted();
    setFolderPending(snapshot);
    setStatus(
      snapshot.diagnostics.length
        ? "External files have diagnostics; running code unchanged."
        : "Disk changes validated; open Project files to Apply explicitly.",
    );
  }
  async function applyBrowserShader(source: ShaderSource, signal: AbortSignal) {
    if (
      window.engineDesktop ||
      !chosen?.mesh ||
      playing ||
      loadBusy ||
      projectBusy ||
      !engine.current
    )
      throw Error("Select a mesh, stop Play and wait for the renderer before importing shaders");
    if (!engine.current.settings.allowCustomShaders)
      throw Error("Enable trusted custom shader preview in Rendering first");
    const before = current.current;
    const next = cloneScene(before);
    const target = next.entities.find((entity) => entity.id === chosen.id);
    if (!target?.mesh) throw Error("Shader target changed");
    next.graphics ??= emptyGraphics();
    next.graphics.shaders ??= [];
    const id = target.mesh.shader ?? crypto.randomUUID();
    const previous = next.graphics.shaders.find((shader) => shader.id === id);
    const replacement = { ...parseShader(source), id, name: previous?.name ?? "Imported shader" };
    next.graphics.shaders = [
      ...next.graphics.shaders.filter((shader) => shader.id !== id),
      replacement,
    ];
    target.mesh.shader = id;
    const checked = parseScene(next);
    const controller = new AbortController();
    folderApplyAbort.current = controller;
    setProjectBusy(true);
    try {
      // Strict staged loading keeps the prior world/materials alive on any compile failure.
      await engine.current.load(checked, {
        preserveView: true,
        strictShaders: true,
        signal: AbortSignal.any([signal, controller.signal]),
      });
      signal.throwIfAborted();
      controller.signal.throwIfAborted();
      if (current.current !== before) throw Error("Project changed during shader application");
      preloadedScene.current = checked;
      history.current.commit(before);
      current.current = checked;
      setScene(checked);
      setRevision((revision) => revision + 1);
      setStatus("Imported shader applied; source is stored in the project, not watched on disk.");
    } finally {
      if (folderApplyAbort.current === controller) folderApplyAbort.current = null;
      setProjectBusy(false);
    }
  }
  async function applyFolder(snapshot: FolderSnapshot) {
    if (!folderSession || playing || loadBusy || !engine.current)
      throw Error("Stop and wait for the renderer before applying disk changes");
    const before = current.current;
    const controller = new AbortController();
    folderApplyAbort.current = controller;
    setProjectBusy(true);
    try {
      await folderSaveQueue.current.catch(() => {});
      const layout = await folderSession.accept(snapshot, controller.signal);
      if (current.current !== before) throw Error("Editor changed during validation; retry Apply");
      if (snapshot.scene.project?.id !== before.project?.id) {
        const nextSettings = { ...settings, allowCustomShaders: false };
        engine.current.applySettings(nextSettings);
        setSettings(nextSettings);
      }
      await engine.current.load(snapshot.scene, {
        preserveView: true,
        strictShaders: true,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      if (current.current !== before) throw Error("Editor changed during file application");
      folderSession.adopt(snapshot, layout);
      preloadedScene.current = snapshot.scene;
      history.current.commit(before);
      current.current = snapshot.scene;
      setScene(snapshot.scene);
      setSelected(null);
      setTrustedSignature(null);
      setFolderPending(null);
      setRevision((r) => r + 1);
      setStatus("Disk changes applied; scripts require explicit trust before Play.");
    } finally {
      if (folderApplyAbort.current === controller) folderApplyAbort.current = null;
      setProjectBusy(false);
    }
  }
  useEffect(() => {
    if (!folderSession) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changedPaths = new Set<string>();
    let needsRescan = false;
    const off = folderSession.api.onChanged((event) => {
      if (event.id !== folderSession.grant.id) return;
      if (timer) clearTimeout(timer);
      for (const path of event.paths) {
        if (changedPaths.size < 128) changedPaths.add(path);
        else needsRescan = true;
      }
      needsRescan ||= event.rescan;
      // Every event invalidates older validation, including while the dialog is closed.
      folderAbort.current?.abort();
      folderApplyAbort.current?.abort();
      setFolderPending(null);
      timer = setTimeout(() => {
        void (async () => {
          const relevant = [...changedPaths].filter((p) => !p.endsWith(".pif"));
          const rescan = needsRescan;
          changedPaths.clear();
          needsRescan = false;
          if (!rescan && !relevant.length) return;
          let external = rescan;
          for (const path of relevant) {
            try {
              if (
                (await folderSession.api.hash(folderSession.grant.id, path)) !==
                folderSession.hashes.get(path)
              )
                external = true;
            } catch {
              external = true;
            }
          }
          if (!external || !active) return;
          folderSession.grant.entries = await folderSession.api.inventory(folderSession.grant.id);
          const controller = new AbortController();
          folderAbort.current = controller;
          const snapshot = await folderSession.read(
            controller.signal,
            rescan ? undefined : relevant,
          );
          if (!active || controller.signal.aborted) return;
          setFolderPending(snapshot);
          setStatus(
            snapshot.diagnostics.length
              ? "External code has errors; previous runtime retained."
              : "External files changed. Validate/apply in Project files; nothing executed automatically.",
          );
        })().catch((error) => {
          if (active && !folderAbort.current?.signal.aborted)
            setStatus("Disk validation: " + String(error));
        });
      }, 300);
    });
    return () => {
      active = false;
      off();
      clearTimeout(timer);
      folderAbort.current?.abort();
      folderApplyAbort.current?.abort();
      folderSession.dispose();
    };
  }, [folderSession]);
  useEffect(() => {
    if (!folderSession || folderSession.boundProjectId !== scene.project?.id || playing) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      folderSaveQueue.current = folderSaveQueue.current
        .catch(() => {})
        .then(async () => {
          controller.signal.throwIfAborted();
          await folderSession.save(scene, controller.signal);
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setStatus(
              "Disk save failed; previous files retained where not committed: " + String(error),
            );
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [scene, folderSession, playing]);
  useEffect(() => {
    engine.current?.selectUI(uiSelected);
  }, [uiSelected, revision]);
  function commit(fn: (scene: SceneDocument) => void) {
    if (playing || folderApplyAbort.current) return;
    try {
      const next = cloneScene(current.current);
      fn(next);
      const checked = parseScene(next);
      checked.project ??= newProjectMetadata(checked.name);
      if (JSON.stringify(checked) === JSON.stringify(current.current)) return;
      history.current.commit(current.current);
      current.current = checked;
      setScene(checked);
      setRevision((r) => r + 1);
    } catch (e) {
      setStatus(String(e));
    }
  }
  useEffect(() => {
    applyRef.current = commit;
  });
  useEffect(() => {
    let disposed = false,
      unsubscribe: (() => void) | undefined;
    const node = canvas.current;
    if (!node) return;
    void Engine.create(node, {
      onUITransform: (id, patch) =>
        applyRef.current((s) => {
          const e = s.ui?.elements.find((e) => e.id === id);
          if (e) Object.assign(e, patch);
        }),
      onUISelect: (id) => {
        setUISelected(id);
        setSelectionDomain("ui");
        setTab("ui");
      },
      onSelect: (id) => {
        setSelected(id);
        setInspector("entity");
      },
      onTransform: (id, transform) =>
        applyRef.current((d) => {
          const e = d.entities.find((e) => e.id === id);
          if (e) e.transform = transform;
        }),
      onStats: (value) => {
        setStats(value);
        const e = engine.current;
        if (e) {
          setPaused(e.paused);
          setScore({ collected: e.collected.size, total: e.goalCount, won: e.won, speed: e.speed });
        }
      },
    })
      .then((instance) => {
        if (disposed) {
          instance.dispose();
          return;
        }
        engine.current = instance;
        unsubscribe = instance.events.subscribe((event) => {
          setLogs((old) => [...old.slice(-199), event]);
          if (event.type === "error") setStatus(event.message);
        });
        if (!disposed) {
          setReady(true);
          setStatus(bootNotice || "Ready · reference-only recovery in local asset database");
        }
      })
      .catch((e) => {
        if (!disposed) {
          setError(String(e));
          setStatus("Renderer unavailable. Scene editing/export still available.");
        }
      });
    return () => {
      disposed = true;
      unsubscribe?.();
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    current.current = scene;
    let active = true;
    if (engine.current && ready && preloadedScene.current === scene) {
      preloadedScene.current = null;
      setLoadedScene(scene);
      setFailedScene(null);
      setLoadBusy(false);
    } else if (engine.current && ready) {
      setLoadBusy(true);
      void engine.current
        .load(scene, { preserveView: engine.current.document?.name === scene.name })
        .then(() => {
          if (active) {
            setLoadedScene(scene);
            setFailedScene(null);
          }
        })
        .catch((e) => {
          if (active) {
            setLoadedScene(null);
            setFailedScene(scene);
            setStatus(
              "Scene load failed; previous world retained. Retry after freeing resources: " +
                String(e),
            );
          }
        })
        .finally(() => {
          if (active) setLoadBusy(false);
        });
    }
    const revision = ++checkpointRevision.current;
    const timer = setTimeout(() => {
      if (recoveryBlocked) return;
      void assetDatabase
        .saveCheckpoint(scene, revision)
        .then(() => {
          // The previous legacy backup is removed only after a committed database checkpoint.
          try {
            localStorage.removeItem("pinefall-engine.scene.v1");
          } catch {
            /* local preferences unavailable */
          }
        })
        .catch(() => {
          if (active)
            setStatus(
              "Recovery storage unavailable/full. Save a PIF backup now; the previous checkpoint was preserved.",
            );
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [scene, ready, loadAttempt]);
  useEffect(() => {
    engine.current?.select(selected);
  }, [selected, scene, ready]);
  useEffect(() => {
    engine.current?.applySettings(settings);
  }, [settings, ready]);
  const scriptSignature = JSON.stringify(scene.scripts || []) + scene.name;
  const scriptsTrusted = trustedSignature === scriptSignature;
  function patchEntity(patch: (entity: Entity) => void) {
    if (!selected) return;
    commit((d) => {
      const e = d.entities.find((e) => e.id === selected);
      if (e) patch(e);
    });
  }
  function add(primitive: "box" | "sphere" | "capsule" | "cylinder" | "cone") {
    const e = entity(
      primitive === "capsule"
        ? "Character capsule"
        : primitive[0].toUpperCase() + primitive.slice(1),
      primitive,
      [0, 2, 0],
    );
    commit((d) => d.entities.push(e));
    setSelected(e.id);
  }
  function undo(redo = false) {
    if (playing) return;
    const restored = redo
      ? history.current.redo(current.current)
      : history.current.undo(current.current);
    if (restored) {
      current.current = restored;
      setScene(restored);
      setRevision((r) => r + 1);
    }
  }
  async function newScene(template: Template) {
    if (playing || projectAbort.current) return;
    const controller = new AbortController(),
      before = current.current;
    projectAbort.current = controller;
    setProjectBusy(true);
    importAbort.current?.abort();
    try {
      await rememberProject(before, undefined, controller.signal);
      if (controller.signal.aborted || current.current !== before || engine.current?.playing)
        throw Error("Project changed or operation cancelled; no replacement was made.");
      recoveryBlocked = false;
      history.current.commit(before);
      const next = createTemplate(template);
      next.project = newProjectMetadata(next.name);
      current.current = next;
      setScene(next);
      setSelected(null);
      setRevision((r) => r + 1);
    } catch (error) {
      setStatus(String(error) + ". Current project kept open; save a PIF backup.");
    } finally {
      if (projectAbort.current === controller) projectAbort.current = null;
      setProjectBusy(false);
    }
  }

  async function run() {
    if (!engine.current || !ready || loadedScene !== scene) return;
    if (playing) {
      await engine.current.stop();
      setPlaying(false);
      setPaused(false);
    } else {
      if (hasSceneScripts(scene) && !scriptsTrusted) {
        setStatus("Scripts blocked. Review the code and check Allow trusted scripts before Play.");
        setTab("scripts");
        return;
      }
      engine.current.allowSceneScripts = scriptsTrusted;
      try {
        if (scene.audio?.assets.length) await engine.current.audio.unlock();
        engine.current.play();
        setPlaying(true);
      } catch (e) {
        setStatus(String(e));
      }
    }
  }
  async function loadScene(event: React.ChangeEvent<HTMLInputElement>) {
    importAbort.current?.abort();
    const f = event.target.files?.[0];
    event.target.value = "";
    if (!f || projectAbort.current) return;
    const before = current.current;
    try {
      const isPif = f.name.toLowerCase().endsWith(".pif");
      if (f.size > (isPif ? ARCHIVE_BYTES : 9_000_000))
        throw Error("Project exceeds file size limit");
      const controller = new AbortController();
      projectAbort.current = controller;
      setProjectBusy(true);
      setStatus("Saving current project snapshot…");
      await rememberProject(before, undefined, controller.signal);
      if (controller.signal.aborted) throw Error("Project operation cancelled");
      setStatus(isPif ? "Opening PIF in worker…" : "Opening legacy JSON…");
      const next = isPif
        ? await projectJob("unpack", new Uint8Array(await f.arrayBuffer()), controller.signal)
        : await referenceScene(parseScene(JSON.parse(await f.text())), controller.signal);
      if (controller.signal.aborted) throw Error("Project operation cancelled");
      if (current.current !== before)
        throw Error("Project changed while opening. Retry after finishing your edits.");
      if (engine.current?.playing) throw Error("Stop gameplay before replacing the project");
      next.project ??= newProjectMetadata(next.name);
      if (isPif && window.engineDesktop?.workspace) {
        setStatus("Choose an empty working folder for the unpacked PIF project…");
        const grant = await window.engineDesktop.workspace.choose();
        if (!grant) throw Error("Working-folder selection cancelled; previous project retained");
        setFolderSession(null);
        if (grant.entries.length)
          throw Error("PIF extraction requires an empty working folder; nothing was overwritten");
        const session = new FolderSession(window.engineDesktop.workspace, grant);
        await session.save(next, controller.signal);
        controller.signal.throwIfAborted();
        setFolderSession(session);
        setFolderPending(null);
      }
      const safeSettings = { ...settings, allowCustomShaders: false };
      engine.current?.applySettings(safeSettings);
      setSettings(safeSettings);
      recoveryBlocked = false;
      setTrustedSignature(null);
      setStatus("Project opened; executable scripts require approval");
      history.current.commit(scene);
      current.current = next;
      setScene(next);
      setSelected(null);
      setRevision((r) => r + 1);
    } catch (e) {
      setStatus(String(e));
    } finally {
      projectAbort.current = null;
      setProjectBusy(false);
    }
  }
  async function importFiles(files: File[], recovery?: PendingImport) {
    const target = recovery?.target || reimportTarget.current;
    reimportTarget.current = undefined;
    if (engine.current?.playing || importAbort.current || !files.length) return;
    const controller = new AbortController();
    importAbort.current = controller;
    setImportBusy(true);
    const projectId = current.current.project?.id;
    let attemptedFiles = files,
      attemptedRecipe = recovery?.recipe || recipe;
    try {
      if (recovery && recovery.projectId !== projectId)
        throw Error("Recovery belongs to another project");
      if (target) {
        const asset = current.current.assets.find((a) => a.id === target.id);
        if (
          !asset ||
          asset.data !== target.data ||
          (asset.import?.revision || 0) !== target.revision
        )
          throw Error("Recovery/reimport target changed; start a new reimport");
      }
      const previousAsset = target
        ? current.current.assets.find((a) => a.id === target.id)
        : undefined;
      const inputs = previousAsset ? await reimportInputs(previousAsset, files) : files;
      const selectedRecipe =
        recovery?.recipe ||
        (target && !overrideRecipe ? previousAsset?.import?.recipe || recipe : recipe);
      attemptedFiles = inputs;
      attemptedRecipe = selectedRecipe;
      const progress = (u: import("../../assets/src/jobs").JobUpdate) =>
        setStatus(`Import ${u.stage} · ${Math.round(u.elapsedMs)} ms · ${u.id.slice(0, 8)}`);
      const result = previousAsset?.import
        ? (
            await prepareReimports(
              current.current,
              [{ assetId: previousAsset.id, files, recipe: selectedRecipe }],
              controller.signal,
              progress,
            )
          ).prepared.get(previousAsset.id)!
        : await prepareImport(inputs, controller.signal, progress, selectedRecipe);
      // Library-only imports stay on disk. Decode only when placing or replacing a live instance.
      if (
        (!target && !importOnly) ||
        (target && current.current.entities.some((entity) => entity.mesh?.asset === target.id))
      )
        await engine.current?.assetCache.prepare(result.data, controller.signal, (u) =>
          setStatus(`Preparing model: ${u.stage}`),
        );
      controller.signal.throwIfAborted();
      if (current.current.project?.id !== projectId || engine.current?.playing)
        throw Error("Project/Play changed during import; no changes applied");
      let mapping: Record<string, string> | undefined;
      if (target) {
        mapping = await new Promise<Record<string, string> | undefined>((resolve) => {
          const abort = () => finish(undefined);
          const finish = (value: Record<string, string> | undefined) => {
            controller.signal.removeEventListener("abort", abort);
            setReview(null);
            resolve(value);
          };
          controller.signal.addEventListener("abort", abort, { once: true });
          const affected = sceneDependencyGraph(current.current).changed("model:" + target.id, {
            sourceHash: JSON.stringify(result.metadata.sources.map((s) => [s.name, s.sha256])),
            artifactHash: result.metadata.artifactHash,
          });
          setReview({
            previous: current.current.assets.find((a) => a.id === target.id)?.import,
            incoming: result.metadata,
            affected: affected.length,
            finish,
          });
        });
        if (!mapping) {
          engine.current?.assetCache.pruneUnused();
          return;
        }
      }
      controller.signal.throwIfAborted();
      if (current.current.project?.id !== projectId || engine.current?.playing)
        throw Error("Project/Play changed during reimport review");
      const adopted = adoptImport(current.current, result, target, mapping);
      const placed =
        !target && !importOnly ? placeModel(adopted.scene, adopted.asset.id) : undefined;
      const next = placed?.scene || adopted.scene;
      history.current.commit(current.current);
      current.current = next;
      setScene(next);
      setRevision((r) => r + 1);
      if (placed) setSelected(placed.entity.id);
      if (recovery) {
        await assetDatabase.deletePending(recovery.id);
        await refreshPending(projectId);
      }
      setStatus(
        `${target ? "Reimported" : "Imported"} ${result.name} · ${result.metadata.report.vertices} vertices · ${(result.metadata.report.decodedBytes / 1048576).toFixed(1)} MiB decoded. ${result.metadata.report.warnings.join(" ")}`,
      );
    } catch (e) {
      let message = String(e);
      let missing: string | undefined;
      try {
        missing = missingCompanion(e);
      } catch {
        /* Invalid names cannot become persisted recovery requests. */
      }
      if (missing && projectId && !controller.signal.aborted) {
        try {
          await rememberMissing(
            attemptedFiles,
            {
              id: recovery?.id || crypto.randomUUID(),
              projectId,
              target,
              recipe: attemptedRecipe,
              missing,
            },
            controller.signal,
          );
          await refreshPending(projectId);
          message += " · Sources retained locally. Use Repair to supply the missing companion.";
        } catch (storageError) {
          message += " · Could not retain recovery sources: " + String(storageError);
        }
      }
      setStatus(message);
    } finally {
      if (importAbort.current === controller) importAbort.current = null;
      setImportBusy(false);
    }
  }
  async function importGlb(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const id = pendingRepair.current;
    pendingRepair.current = null;
    if (!id) {
      await importFiles(files);
      return;
    }
    if (!files.length) return;
    try {
      const attempt = await assetDatabase.getPending(id);
      if (!attempt) throw Error("Pending import no longer exists");
      const combined = await repairFiles(
        attempt,
        files,
        current.current.project?.id || "",
        new AbortController().signal,
      );
      await importFiles(combined, attempt);
    } catch (error) {
      setStatus(String(error));
    }
  }
  async function exportPrefab() {
    const e = scene.entities.find((e) => e.id === selected);
    if (!e) return;
    const ids = new Set([e.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of scene.entities)
        if (item.parent && ids.has(item.parent) && !ids.has(item.id)) {
          ids.add(item.id);
          changed = true;
        }
    }
    const items = structuredClone(scene.entities.filter((e) => ids.has(e.id)));
    for (const item of items) if (item.id === e.id) delete item.parent;
    await download(
      e.name + ".prefab.json",
      await serializeSceneAsync({ ...scene, name: e.name, entities: items }),
    );
  }
  async function importPrefab(event: React.ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0];
    event.target.value = "";
    if (!f) return;
    try {
      if (f.size > 9_000_000) throw new Error("Prefab too large");
      const prefab = await referenceScene(parseScene(JSON.parse(await f.text())));
      const mapping = new Map(prefab.entities.map((e) => [e.id, crypto.randomUUID()]));
      const collectionMap = new Map(
        (prefab.collections || []).map((c) => [c.id, crypto.randomUUID()]),
      );
      commit((d) => {
        d.version = d.version === 3 || prefab.version === 3 ? 3 : 2;
        const materialMap = new Map<string, string>();
        const shaderMap = new Map<string, string>();
        if (prefab.graphics?.shaders?.length) {
          d.graphics ??= emptyGraphics();
          d.graphics.shaders ??= [];
          for (const shader of prefab.graphics.shaders) {
            const id = crypto.randomUUID();
            shaderMap.set(shader.id, id);
            d.graphics.shaders.push({ ...shader, id });
          }
        }
        if (prefab.graphics?.materials.length) {
          d.graphics ??= emptyGraphics();
          for (const material of prefab.graphics.materials) {
            const id = crypto.randomUUID();
            materialMap.set(material.id, id);
            d.graphics.materials.push({ ...material, id });
          }
        }
        if (prefab.collections?.length) {
          d.collections ??= [];
          d.collections.push(
            ...prefab.collections.map((c) => ({
              ...c,
              id: collectionMap.get(c.id)!,
              parent: c.parent ? collectionMap.get(c.parent) : undefined,
            })),
          );
        }
        for (const script of prefab.scripts || []) {
          d.scripts ??= [];
          if (!d.scripts.some((s) => s.id === script.id)) d.scripts.push(script);
        }
        for (const asset of prefab.assets)
          if (!d.assets.some((a) => a.id === asset.id)) d.assets.push(asset);
        for (const e of prefab.entities) {
          const item = structuredClone(e);
          item.id = mapping.get(e.id)!;
          if (item.mesh?.shader) item.mesh.shader = shaderMap.get(item.mesh.shader)!;
          if (item.mesh?.material) item.mesh.material = materialMap.get(item.mesh.material)!;
          item.parent = e.parent ? mapping.get(e.parent) : undefined;
          item.collection = e.collection ? collectionMap.get(e.collection) : undefined;
          d.entities.push(item);
        }
      });
    } catch (e) {
      setStatus(String(e));
    }
  }
  const selectedCollection = scene.collections?.find((c) => c.id === selected);
  const chosen = scene.entities.find((e) => e.id === selected);

  function changeTool(mode: "translate" | "rotate" | "scale") {
    setTool(mode);
    engine.current?.transformMode(mode);
  }
  function togglePause() {
    if (engine.current && playing) {
      engine.current.paused = !engine.current.paused;
      setPaused(engine.current.paused);
    }
  }
  function returnHome() {
    setHomeBusy(true);
    const before = current.current;
    return onHome(
      before,
      false,
      () => current.current === before && !engine.current?.playing,
    ).catch((error) => {
      setHomeError(String(error));
      setStatus(String(error) + ". Project kept open; export a PIF backup.");
      setHomeBusy(false);
    });
  }
  function placeAsset(id: string) {
    const asset = current.current.assets.find((asset) => asset.id === id);
    if (!asset) throw Error("Model no longer exists");
    const object = entity(asset.name, "asset");
    object.mesh!.asset = asset.id;
    commit((scene) => scene.entities.push(object));
    setSelected(object.id);
  }
  function chooseModelImport() {
    pendingRepair.current = null;
    reimportTarget.current = undefined;
    const input = glb.current;
    if (input?.showPicker) input.showPicker();
    else input?.click();
  }
  function reimportAsset(id: string) {
    const asset = current.current.assets.find((asset) => asset.id === id);
    if (!asset) throw Error("Model no longer exists");
    pendingRepair.current = null;
    reimportTarget.current = {
      id: asset.id,
      data: asset.data,
      revision: asset.import?.revision || 0,
    };
    const input = glb.current;
    if (input?.showPicker) input.showPicker();
    else input?.click();
  }
  function getCommands(): EditorCommand[] {
    const busy = projectBusy || homeBusy || importBusy || loadBusy;
    const editReason = playing
      ? "Stop gameplay to edit"
      : busy
        ? "Wait for the current operation"
        : undefined;
    const hasSelection = selectionDomain === "ui" ? !!uiActions.current?.selected : !!selected;
    const selectionReason = editReason ?? (!hasSelection ? "Select an item first" : undefined);
    const addCommand = (
      id: string,
      label: string,
      keys: string[],
      run: () => unknown,
      disabled?: string,
      extra: Partial<EditorCommand> = {},
    ): EditorCommand => ({ id, label, keys, run, disabled, ...extra });
    return [
      addCommand("commands", "Commands and shortcuts", ["Mod+Shift+P", "F1"], () =>
        setPaletteOpen(true),
      ),
      addCommand(
        "project.new",
        "New game",
        ["Mod+N"],
        () => {
          setNewGameError("");
          setNewGameOpen(true);
        },
        editReason,
      ),
      addCommand(
        "project.open",
        "Open project",
        ["Mod+O"],
        () => {
          const input = file.current;
          if (input?.showPicker) input.showPicker();
          else input?.click();
        },
        editReason,
      ),
      addCommand(
        "folder.repack",
        "Repack raw working folder",
        folderSession ? [repackShortcut] : [],
        saveProject,
        !folderSession || projectBusy
          ? "Working folder unavailable or operation in progress"
          : undefined,
        { allowTyping: true },
      ),
      addCommand(
        "project.save",
        "Save PIF project",
        ["Mod+S", "Mod+Shift+S"],
        saveProject,
        projectBusy || homeBusy ? "Project operation in progress" : undefined,
        { allowTyping: true },
      ),
      addCommand(
        "project.home",
        "Save snapshot and return Home",
        ["Mod+Shift+H"],
        returnHome,
        editReason,
      ),
      addCommand(
        "asset.import",
        "Import models and textures",
        ["Mod+I"],
        chooseModelImport,
        editReason,
      ),
      addCommand(
        "asset.actions",
        "Asset actions and repair",
        [],
        () => setAssetActionsOpen(true),
        editReason,
      ),
      addCommand(
        "asset.settings",
        "Import settings",
        [],
        () => setImportSettingsOpen(true),
        editReason,
      ),
      addCommand(
        "edit.undo",
        "Undo",
        ["Mod+Z"],
        () => undo(),
        editReason ?? (!history.current.canUndo ? "Nothing to undo" : undefined),
      ),
      addCommand(
        "edit.redo",
        "Redo",
        ["Mod+Shift+Z", "Mod+Y"],
        () => undo(true),
        editReason ?? (!history.current.canRedo ? "Nothing to redo" : undefined),
      ),
      addCommand(
        "selection.copy",
        "Copy selection",
        ["Mod+C"],
        () =>
          selectionDomain === "ui" ? uiActions.current?.copy() : hierarchyActions.current?.copy(),
        selectionReason,
        { sceneOnly: true },
      ),
      addCommand(
        "selection.cut",
        "Cut selection",
        ["Mod+X"],
        () =>
          selectionDomain === "ui" ? uiActions.current?.cut() : hierarchyActions.current?.cut(),
        selectionReason,
        { sceneOnly: true },
      ),
      addCommand(
        "selection.paste",
        "Paste selection",
        ["Mod+V"],
        () =>
          selectionDomain === "ui" ? uiActions.current?.paste() : hierarchyActions.current?.paste(),
        editReason ??
          (!(selectionDomain === "ui"
            ? uiActions.current?.canPaste
            : hierarchyActions.current?.canPaste)
            ? "Copy items from this project first"
            : undefined),
        { sceneOnly: true },
      ),
      addCommand(
        "selection.duplicate",
        "Duplicate selection",
        ["Mod+D"],
        () =>
          selectionDomain === "ui"
            ? uiActions.current?.duplicate()
            : hierarchyActions.current?.duplicate(),
        selectionReason,
        { sceneOnly: true },
      ),
      addCommand(
        "selection.delete",
        "Delete selection",
        ["Delete", "Backspace"],
        () =>
          selectionDomain === "ui"
            ? uiActions.current?.remove()
            : hierarchyActions.current?.remove(),
        selectionReason,
        { sceneOnly: true },
      ),
      addCommand(
        "selection.group",
        "Group scene selection",
        ["Mod+G"],
        () => hierarchyActions.current?.group(),
        editReason ??
          (!selected || selectionDomain !== "scene" ? "Select scene objects first" : undefined),
        { sceneOnly: true },
      ),
      addCommand(
        "selection.rename",
        "Rename selection",
        ["F2"],
        () =>
          selectionDomain === "ui"
            ? uiActions.current?.rename()
            : hierarchyActions.current?.rename(),
        selectionReason,
        { sceneOnly: true },
      ),
      addCommand(
        "selection.all",
        "Select all visible scene objects",
        ["Mod+A"],
        () => hierarchyActions.current?.selectAll(),
        editReason ?? (selectionDomain !== "scene" ? "Focus the scene hierarchy first" : undefined),
        { sceneOnly: true },
      ),
      addCommand(
        "selection.frame",
        "Frame scene selection",
        ["F"],
        () => hierarchyActions.current?.frame(),
        !selected || playing ? "Select a scene object while stopped" : undefined,
        { sceneOnly: true },
      ),
      ...(["translate", "rotate", "scale"] as const).map((mode, i) =>
        addCommand(
          "tool." + mode,
          mode[0].toUpperCase() + mode.slice(1) + " tool",
          [["W", "E", "R"][i]],
          () => changeTool(mode),
          editReason,
          { sceneOnly: true },
        ),
      ),
      addCommand(
        "play.preview",
        "Preview current project in standalone player",
        ["Mod+F5"],
        launchPlayer,
        editReason,
      ),
      addCommand(
        "play.toggle",
        playing ? "Stop scene" : "Play scene",
        ["F5"],
        run,
        busy || !ready || loadedScene !== scene ? "Wait for a ready scene" : undefined,
      ),
      addCommand(
        "play.stop",
        "Stop scene",
        ["Shift+F5"],
        run,
        !playing ? "Scene is already stopped" : busy ? "Operation in progress" : undefined,
      ),
      addCommand(
        "play.pause",
        paused ? "Resume simulation" : "Pause simulation",
        ["F6"],
        togglePause,
        !playing ? "Start gameplay first" : undefined,
      ),
      addCommand(
        "view.focus",
        "Maximize / restore viewport",
        ["Shift+Space"],
        workspace.toggleFocus,
      ),
      addCommand("settings", "Editor settings", ["Mod+,"], () => setPreferencesOpen(true)),
      addCommand(
        "audio",
        "Audio studio",
        ["Mod+Shift+A"],
        () => setAudioOpen(true),
        editReason ?? (!engine.current ? "Renderer unavailable" : undefined),
      ),
      ...(["assets", "console", "ui", "scripts", "guide"] as const).map((panel, i) =>
        addCommand(
          "panel." + panel,
          "Show " +
            {
              assets: "asset library",
              console: "console",
              ui: "UI designer",
              scripts: "script editor",
              guide: "quick start",
            }[panel],
          ["Mod+" + (i + 1)],
          () => setTab(panel),
        ),
      ),
      ...scene.assets.flatMap((asset) => [
        addCommand(
          "asset.place." + asset.id,
          "Place model: " + asset.name,
          [],
          () => placeAsset(asset.id),
          editReason,
        ),
        addCommand(
          "asset.reimport." + asset.id,
          "Reimport model: " + asset.name,
          [],
          () => reimportAsset(asset.id),
          editReason,
        ),
      ]),
      ...(["box", "sphere", "capsule", "cylinder", "cone"] as const).map((primitive) =>
        addCommand("add." + primitive, "Add " + primitive, [], () => add(primitive), editReason),
      ),
    ].map((command) => ({
      ...command,
      keys:
        playing && command.sceneOnly
          ? command.keys.filter((key) => key.startsWith("Mod+"))
          : command.keys,
      allowTyping:
        command.allowTyping ||
        command.id === "commands" ||
        command.id === "play.pause" ||
        command.id === "play.stop" ||
        (command.id === "play.toggle" && playing),
    }));
  }

  function num(
    label: string,
    value: number,
    onCommit: (v: number) => void,
    min = -1000,
    max = 1000,
    step = 0.1,
  ) {
    return (
      <label className="number-field" key={label}>
        <span>{label}</span>
        <Input
          aria-label={label}
          key={selected + label + revision}
          type="number"
          defaultValue={Number(value.toFixed(3))}
          min={min}
          max={max}
          step={step}
          disabled={playing}
          onBlur={(event) => {
            const n = Number(event.currentTarget.value);
            if (Number.isFinite(n) && n >= min && n <= max && n !== value) onCommit(n);
            else event.currentTarget.value = String(value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </label>
    );
  }
  function vector(label: "position" | "rotation" | "scale") {
    if (!chosen) return null;
    return (
      <div className="vector">
        <small>{label}</small>
        <div>
          {(["X", "Y", "Z"] as const).map((axis, i) =>
            num(
              label + " " + axis,
              chosen.transform[label][i],
              (value) =>
                patchEntity((e) => {
                  e.transform[label][i] = value;
                }),
              label === "scale" ? 0.05 : -1000,
              label === "scale" ? 100 : 1000,
            ),
          )}
        </div>
      </div>
    );
  }
  return (
    <div
      onFocusCapture={(event) => {
        const target = event.target;
        if (target instanceof Element) {
          if (target.closest(".ui-editor,[data-pinefall-ui]")) setSelectionDomain("ui");
          else if (target.closest(".hierarchy,.inspector,.viewport")) setSelectionDomain("scene");
        }
      }}
      onPointerDownCapture={(event) => {
        const target = event.target;
        if (target instanceof Element) {
          if (target.closest(".ui-editor,[data-pinefall-ui]")) setSelectionDomain("ui");
          else if (target.closest(".hierarchy,.inspector,.viewport")) setSelectionDomain("scene");
        }
      }}
      style={workspace.style}
      className={"workbench " + workspace.className + (tab === "scripts" ? " scripting-open" : "")}
    >
      {paletteOpen && (
        <CommandPalette
          commands={getCommands().filter((command) => command.id !== "commands")}
          onClose={() => setPaletteOpen(false)}
          onError={setStatus}
        />
      )}
      {homeError && (
        <Dialog
          title="Project stayed open"
          description="The recent snapshot could not be saved. Keep editing, or export a PIF backup before leaving. Returning without a snapshot keeps this session in memory but does not back it up."
          onClose={() => setHomeError("")}
        >
          <p role="alert">{homeError}</p>
          <footer>
            <Button autoFocus onClick={() => setHomeError("")}>
              Keep editing
            </Button>
            <Button disabled={projectBusy} onClick={() => void saveProject()}>
              Save PIF backup
            </Button>
            <Button
              variant="danger"
              disabled={projectBusy}
              onClick={() => void onHome(current.current, true)}
            >
              Return without snapshot
            </Button>
          </footer>
        </Dialog>
      )}
      {assetActionsOpen && (
        <Dialog
          title="Asset actions"
          description="Import resources or manage the local conversion cache."
          onClose={() => setAssetActionsOpen(false)}
        >
          <div className="pf-asset-actions">
            {" "}
            <>
              <Button
                disabled={playing || importBusy}
                onClick={() => {
                  setAssetActionsOpen(false);
                  pendingRepair.current = null;
                  reimportTarget.current = undefined;
                  glb.current?.click();
                }}
              >
                <Icon name="upload" /> Import model
              </Button>
              {pendingImports.map((attempt) => (
                <React.Fragment key={attempt.id}>
                  <Button
                    disabled={importBusy || playing}
                    onClick={() => {
                      setAssetActionsOpen(false);
                      pendingRepair.current = attempt.id;
                      glb.current?.click();
                    }}
                  >
                    Repair {attempt.name}: missing {attempt.missing}
                  </Button>
                  <Button
                    disabled={importBusy}
                    onClick={() =>
                      void assetDatabase
                        .deletePending(attempt.id)
                        .then(() => refreshPending())
                        .catch((e) => setStatus(String(e)))
                    }
                  >
                    Discard failed import {attempt.name}
                  </Button>
                </React.Fragment>
              ))}
              <label>
                <Input
                  type="checkbox"
                  checked={importOnly}
                  onChange={(e) => setImportOnly(e.target.checked)}
                />{" "}
                Import only
              </label>
              {importBusy && (
                <Button onClick={() => importAbort.current?.abort()}>Cancel import</Button>
              )}
              <Button
                disabled={playing}
                onClick={() => {
                  setAssetActionsOpen(false);
                  prefabFile.current?.click();
                }}
              >
                <Icon name="upload" /> Import prefab
              </Button>
              <Button
                disabled={playing || importBusy || loadBusy || projectBusy}
                onClick={async () => {
                  if (
                    !(await confirm(
                      "Clear undo history and regenerable conversion cache? The active project and recovery checkpoints stay intact.",
                    ))
                  )
                    return;
                  history.current.reset();
                  const refs = new Set(sceneReferences(current.current));
                  if (engine.current?.document)
                    for (const ref of sceneReferences(engine.current.document)) refs.add(ref);
                  blobs.retain(refs);
                  void assetDatabase
                    .clearArtifacts()
                    .then(() =>
                      setStatus("Conversion cache and undo cleared; active project retained."),
                    )
                    .catch((e) => setStatus(String(e)));
                  setRevision((r) => r + 1);
                }}
              >
                Clear cache / undo
              </Button>
            </>
          </div>
        </Dialog>
      )}
      {(filesOpen || shaderEditor) && (
        <ProjectFilesDialog
          scene={scene}
          session={folderSession}
          pending={folderPending}
          onPending={setFolderPending}
          onSession={setFolderSession}
          onRepackShortcut={setRepackShortcut}
          onValidate={validateFolder}
          onApply={applyFolder}
          browserShader={
            chosen?.mesh
              ? {
                  id: chosen.id,
                  initial: scene.graphics?.shaders?.find(
                    (shader) => shader.id === chosen.mesh?.shader,
                  ),
                  trusted: !!settings.allowCustomShaders,
                  onApply: applyBrowserShader,
                  onExport: download,
                }
              : undefined
          }
          preferredFile={
            shaderEditor && chosen?.mesh?.shader
              ? folderSession?.layout?.shaders[chosen.mesh.shader]?.source
              : folderSession?.layout?.scripts[scriptId]
          }
          onClose={() => {
            folderApplyAbort.current?.abort();
            setFilesOpen(false);
            setShaderEditor(false);
          }}
          onCreateScript={() => {
            const id = crypto.randomUUID();
            commit((d) => {
              d.scripts ??= [];
              d.scripts.push({
                id,
                name: uniqueScriptName(d.scripts.map((s) => s.name)),
                source: SCRIPT_TEMPLATE,
              });
            });
            setScriptId(id);
          }}
          onCreateShader={
            chosen?.mesh
              ? () => {
                  commit((d) => {
                    const e = d.entities.find((e) => e.id === chosen.id);
                    if (!e?.mesh || e.mesh.shader) return;
                    d.graphics ??= emptyGraphics();
                    d.graphics.shaders ??= [];
                    const id = crypto.randomUUID();
                    d.graphics.shaders.push({
                      ...DEFAULT_SHADER,
                      id,
                      name: chosen.name + " shader",
                    });
                    e.mesh.shader = id;
                  });
                }
              : undefined
          }
        />
      )}
      {materialEditor && chosen?.mesh && (
        <SurfaceDialog
          key={chosen.id}
          initial={
            chosen.mesh.surface ??
            scene.graphics?.materials.find((m) => m.id === chosen.mesh?.material) ?? {
              ...DEFAULT_SURFACE,
              color: chosen.mesh.color,
            }
          }
          onClose={() => setMaterialEditor(false)}
          onApply={(surface, reusable) => {
            commit((d) => {
              const e = d.entities.find((e) => e.id === chosen.id);
              if (!e?.mesh) return;
              if (reusable) {
                d.graphics ??= emptyGraphics();
                const id = crypto.randomUUID();
                d.graphics.materials.push({ ...surface, id, name: chosen.name + " material" });
                e.mesh.material = id;
                delete e.mesh.surface;
              } else e.mesh.surface = surface;
            });
            setMaterialEditor(false);
          }}
        />
      )}
      {preferencesOpen && <SettingsDialog onClose={() => setPreferencesOpen(false)} />}
      {importSettingsOpen && (
        <Dialog
          title="Import settings"
          description="Normalization for the next import. Saved recipes remain unchanged unless explicitly overridden."
          onClose={() => setImportSettingsOpen(false)}
        >
          <Panel style={{ gridColumn: "1 / -1", padding: 12 }}>
            <strong>Import normalization</strong>
            <label>
              {" "}
              Unit multiplier{" "}
              <Input
                aria-label="Import unit multiplier"
                type="number"
                min="0.000001"
                max="1000000"
                step="any"
                value={recipe.settings!.unitScale}
                onChange={(e) =>
                  setRecipe({
                    ...recipe,
                    settings: { ...recipe.settings!, unitScale: Number(e.target.value) },
                  })
                }
              />
            </label>
            <label>
              {" "}
              Converter output up axis{" "}
              <Select
                aria-label="Converter output up axis"
                value={recipe.settings!.outputUp}
                onChange={(e) =>
                  setRecipe({
                    ...recipe,
                    settings: {
                      ...recipe.settings!,
                      outputUp: e.target.value as "X" | "Y" | "Z",
                    },
                  })
                }
              >
                <option>Y</option>
                <option>Z</option>
                <option>X</option>
              </Select>
            </label>
            <label>
              <Input
                type="checkbox"
                checked={overrideRecipe}
                onChange={(e) => setOverrideRecipe(e.target.checked)}
              />{" "}
              Override saved recipe on reimport
            </label>
            <small>
              1 preserves units; 0.01 converts centimeters to meters. FBXLoader already corrects
              Z-up: normally leave output axis Y. Original source bytes are retained.
            </small>
          </Panel>
        </Dialog>
      )}
      {audioOpen && engine.current && (
        <AudioDialog
          loading={loadBusy || projectBusy || loadedScene !== scene}
          scene={scene}
          engine={engine.current}
          disabled={playing || loadBusy || projectBusy}
          commit={commit}
          onClose={() => setAudioOpen(false)}
        />
      )}
      {workspace.handles}
      {workspace.dockTargets}
      {newGameOpen && (
        <Dialog
          title="New game"
          onClose={() => {
            projectAbort.current?.abort();
            setNewGameOpen(false);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createNewGame();
            }}
          >
            {newGameError && <p role="alert">{newGameError}</p>}
            <small>PINEFALL / CREATE</small>
            <h2>Your next game starts here.</h2>
            <label>
              Game name
              <Input
                aria-label="Game name"
                disabled={projectBusy}
                required
                maxLength={100}
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
              />
            </label>
            <label>
              Starting scene
              <Select
                aria-label="Starting scene"
                disabled={projectBusy}
                value={gameStarter}
                onChange={(e) => setGameStarter(e.target.value)}
              >
                <option value="blank">Blank world + playable character</option>
                {Object.entries(templateNames).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </Select>
            </label>
            <p>
              Import your GLB models, place them, add colliders and press Play. Export your current
              scene for a portable backup. The current project is saved to Recent projects before
              creating another game. Undo also restores it during this session.
            </p>
            <footer>
              <Button
                type="button"
                onClick={() => {
                  projectAbort.current?.abort();
                  setNewGameOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={projectBusy}>
                {projectBusy ? "Creating…" : "Create game"}
              </Button>
            </footer>
          </form>
        </Dialog>
      )}

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <img src="./pinefall-logo.svg" width="32" height="32" alt="Pinefall" />
          </span>
          <div>
            PINEFALL <b>ENGINE</b>
            <small>WORKSHOP / {engineVersion}</small>
          </div>
        </div>
        <div className="project-path">
          Projects <span>/</span> {scene.name} <i>LOCAL</i>
        </div>
        <div className="top-actions">
          <Button
            aria-label="Back to home"
            disabled={playing || projectBusy || loadBusy || importBusy || homeBusy}
            onClick={() => void returnHome()}
          >
            <Icon name="home" />
            {homeBusy ? "Saving…" : "Home"}
          </Button>
          {workspace.toolbar}
          <ActionMenu label="Project">
            <MenuItem disabled={playing || projectBusy} onSelect={() => setFilesOpen(true)}>
              Project files & external tools…
            </MenuItem>
            <MenuItem
              disabled={playing || projectBusy || homeBusy}
              onSelect={() => {
                setNewGameError("");
                setNewGameOpen(true);
              }}
            >
              New game
            </MenuItem>
            <MenuItem
              disabled={playing || projectBusy || homeBusy}
              onSelect={() => file.current?.click()}
            >
              Open project…
            </MenuItem>
            <MenuItem
              onSelect={() =>
                void serializeSceneAsync(scene)
                  .then((text) => download(scene.name + ".scene.json", text))
                  .catch((error) => setStatus(String(error)))
              }
            >
              Export scene JSON
            </MenuItem>
            <MenuItem onSelect={() => setPreferencesOpen(true)}>Editor settings</MenuItem>
            <MenuItem onSelect={() => setPaletteOpen(true)}>Commands and shortcuts</MenuItem>
          </ActionMenu>
          <Button
            disabled={projectBusy}
            title="Save PIF project · Ctrl/⌘+S"
            onClick={() => void saveProject()}
          >
            <Icon name="save" />
            Save project
          </Button>
          {projectBusy && (
            <Button onClick={() => projectAbort.current?.abort()}>Cancel project operation</Button>
          )}
          <Button
            variant="ghost"
            disabled={playing || projectBusy || loadBusy || importBusy || homeBusy}
            title="Preview current project · Ctrl/⌘+F5"
            onClick={() => void launchPlayer()}
          >
            <Icon name="external" /> Player
          </Button>
        </div>
      </header>
      <div className="commandbar">
        <div className="document-name">
          <span className="dot" /> {scene.name}.scene <span className="dim">3D ONLY</span>
        </div>
        <div className="play-controls">
          {scene.scripts?.length ? (
            <label
              className="script-trust"
              title="Trusted code runs with host privileges. Not a sandbox."
            >
              <Input
                type="checkbox"
                aria-label="Allow trusted scripts"
                checked={scriptsTrusted}
                disabled={playing}
                onChange={(e) => setTrustedSignature(e.target.checked ? scriptSignature : null)}
              />
              Allow trusted scripts
            </label>
          ) : null}
          <Button
            aria-label={playing ? "Stop scene" : "Play scene"}
            className={playing ? "stop" : "play"}
            disabled={
              !ready || importBusy || loadBusy || projectBusy || homeBusy || loadedScene !== scene
            }
            onClick={() => void run()}
          >
            {playing ? (
              <>
                <Icon name="stop" /> Stop
              </>
            ) : (
              <>
                <Icon name="play" /> Play
              </>
            )}
          </Button>
          {ready && failedScene === scene && !loadBusy ? (
            <Button onClick={() => setLoadAttempt((n) => n + 1)}>Retry scene load</Button>
          ) : null}
          <Button
            aria-label="Pause simulation"
            disabled={!playing}
            className={paused ? "active" : ""}
            onClick={togglePause}
          >
            <Icon name="pause" />
          </Button>
        </div>
        <div className="history-controls">
          <Button disabled={playing || !history.current.canUndo} onClick={() => undo()}>
            <Icon name="undo" /> Undo
          </Button>
          <Button disabled={playing || !history.current.canRedo} onClick={() => undo(true)}>
            <Icon name="redo" /> Redo
          </Button>
          <span className="saved-dot" /> {playing ? "Runtime isolated" : "Local autosave"}
        </div>
      </div>
      <Hierarchy
        actions={hierarchyActions}
        key={scene.name}
        scene={scene}
        selected={selected}
        onSelect={(id) => {
          setSelected(id);
          setInspector("entity");
        }}
        commit={commit}
        disabled={playing}
        focus={(id) => engine.current?.focus([...descendants(scene, [id])])}
        add={() => add("box")}
        notify={setStatus}
      />
      <main className="viewport">
        <div className="viewport-toolbar">
          <div>
            <span className="tab-active">{playing ? "Game" : "Scene"}</span>
            <span className="dim">{playing ? templateNames[scene.template] : "Perspective"}</span>
          </div>
          <div className="tools">
            <Button
              aria-label="Toggle viewport focus"
              title="Maximize / restore viewport"
              onClick={workspace.toggleFocus}
            >
              <Icon name="maximize" />
            </Button>
            {(["translate", "rotate", "scale"] as const).map((t, i) => (
              <Button
                key={t}
                disabled={playing}
                title={t + " (" + ["W", "E", "R"][i] + ")"}
                className={tool === t ? "active" : ""}
                onClick={() => {
                  changeTool(t);
                }}
              >
                <Icon name={(["move", "rotate", "scale"] as const)[i]} />
              </Button>
            ))}
            <Button
              disabled={!chosen || playing}
              onClick={() => selected && engine.current?.focus(selected)}
            >
              Frame
            </Button>
            <Button onClick={() => setInspector("render")}>
              <Icon name="settings" /> Render
            </Button>
          </div>
        </div>
        <div
          className="canvas-wrap"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pendingRepair.current = null;
            reimportTarget.current = undefined;
            void importFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <canvas ref={canvas} tabIndex={0} aria-label="3D scene viewport" />
          {!ready && !error && (
            <div className="viewport-message">
              Preparing the world…<small>Initializing local WASM physics</small>
            </div>
          )}
          {error && (
            <div className="viewport-message error">
              3D renderer unavailable<small>{error}</small>
              <p>
                No 2D substitution. You can still edit and export the scene. Try the desktop
                OpenGL/X11 launch profile.
              </p>
            </div>
          )}
          <div className="viewport-badge">
            <span className="dot" />
            {settings.preset === "low" ? "LOW / LEGACY GPU" : "HIGH / OPTIONAL FX"}
            <small>{settings.volumetrics ? "FAKE BEAMS ON" : "FAKE BEAMS OFF"}</small>
          </div>
          {!playing && ready && !scene.ui?.elements.length && (
            <div className="scene-caption">
              <div>PINEFALL WORKSPACE</div>
              <h1>{scene.name}</h1>
              <p>A small world. A reusable foundation.</p>
              <Button onClick={() => void run()}>
                <Icon name="play" /> Explore in play mode
              </Button>
            </div>
          )}
          {playing && !scene.ui?.elements.length && (
            <div className="game-hud" data-testid="game-status">
              <span>
                {paused
                  ? "PAUSED"
                  : score.won
                    ? "SIGNAL RESTORED"
                    : scene.template === "sandbox"
                      ? "PHYSICS PLAYGROUND"
                      : "RESTORE THE SIGNAL"}
              </span>
              <h2>
                {scene.template === "sandbox"
                  ? "Make a little chaos."
                  : `${score.collected} / ${score.total} signals`}
              </h2>
              <p>
                {scene.template === "sandbox"
                  ? "Spawn crates and test rigid-body contacts."
                  : scene.template === "driving"
                    ? `${score.speed.toFixed(0)} km/h · recover the signals, then reach the beacon`
                    : "Collect the gold shards, then activate the jade beacon."}
              </p>
              {scene.template === "sandbox" && (
                <div>
                  <Button onClick={() => engine.current?.spawnBox()}>
                    <Icon name="plus" /> Spawn crate
                  </Button>
                  <Button onClick={() => engine.current?.impulse()}>
                    <Icon name="up" /> Apply impulse
                  </Button>
                </div>
              )}
            </div>
          )}
          <div className="viewport-bottom">
            <span>
              {playing
                ? scene.template === "sandbox"
                  ? "DRAG orbit · WHEEL zoom"
                  : scene.template === "driving"
                    ? "W/S drive · A/D steer · SPACE brake · R recover · ESC pause"
                    : "WASD move · SPACE jump · SHIFT sprint · DRAG look · R checkpoint · ESC pause"
                : "DRAG orbit · RIGHT DRAG pan · WHEEL zoom · CLICK select"}
            </span>
            <span className="axis">
              <b>Y</b>
              <i>Z</i>
              <em>X</em>
            </span>
          </div>
        </div>
        <div className="viewport-stats">
          <span>{stats ? Math.round(stats.fps) + " FPS" : "— FPS"}</span>
          <span>{stats?.drawCalls || 0} draws</span>
          <span>{((stats?.triangles || 0) / 1000).toFixed(1)}k tris</span>
          <span>
            {stats?.visible || 0}/{scene.entities.length} visible*
          </span>
          <span>{stats?.bodies || 0} bodies</span>
          <span>{stats ? stats.width + " × " + stats.height : "—"}</span>
        </div>
      </main>
      <Panel as="aside" className="inspector">
        <div className="inspector-tabs">
          <Button
            className={inspector === "entity" ? "active" : ""}
            onClick={() => setInspector("entity")}
          >
            Inspector
          </Button>
          <Button
            className={inspector === "render" ? "active" : ""}
            onClick={() => setInspector("render")}
          >
            Rendering
          </Button>
          <Button aria-label="Audio studio" onClick={() => setAudioOpen(true)}>
            Audio
          </Button>
        </div>
        <div className="inspector-content">
          {inspector === "entity" ? (
            chosen ? (
              <>
                <div className="selected-heading">
                  <span>
                    <Icon name="cube" size={25} />
                  </span>
                  <div>
                    <Input
                      aria-label="Entity name"
                      disabled={playing}
                      key={chosen.id + revision}
                      defaultValue={chosen.name}
                      onBlur={(e) => {
                        if (e.currentTarget.value !== chosen.name)
                          patchEntity((item) => {
                            item.name = e.currentTarget.value;
                          });
                      }}
                    />
                    <small>{chosen.id.slice(0, 8)} · ENTITY</small>
                  </div>
                  <Input
                    aria-label="Entity enabled"
                    type="checkbox"
                    checked={chosen.enabled}
                    disabled={playing}
                    onChange={(e) =>
                      patchEntity((item) => {
                        item.enabled = e.target.checked;
                      })
                    }
                  />
                </div>
                <Panel>
                  <h3>
                    <Icon name="move" /> Transform
                  </h3>
                  {vector("position")}
                  {vector("rotation")}
                  {vector("scale")}
                  <small className="hint">
                    Rotation in degrees. Commit a numeric edit with Enter or by leaving the field.
                  </small>
                </Panel>
                {chosen.mesh && (
                  <Panel>
                    <h3>
                      <Icon name="cube" /> Mesh renderer
                    </h3>
                    <label className="row-field">
                      Library model
                      <Select
                        aria-label="Library model"
                        disabled={playing}
                        value={chosen.mesh.asset || ""}
                        onChange={(event) =>
                          patchEntity((e) => {
                            if (!e.mesh) return;
                            const id = event.target.value;
                            e.mesh.primitive = id ? "asset" : "box";
                            e.mesh.asset = id || undefined;
                          })
                        }
                      >
                        <option value="">Primitive / reset to box</option>
                        {scene.assets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <small className="hint">
                      Swap visuals without removing physics or behaviors. Scale the model to match
                      its collision proxy. Drop GLB files into the viewport to import.
                    </small>
                    <label className="row-field">
                      Geometry <span>{chosen.mesh.primitive}</span>
                    </label>
                    <label className="row-field">
                      Albedo
                      <ColorPicker
                        key={chosen.id + ":material"}
                        label="Material color"
                        value={chosen.mesh.color}
                        disabled={playing}
                        onChange={(color) =>
                          patchEntity((item) => {
                            if (item.mesh) item.mesh.color = color;
                          })
                        }
                      />
                    </label>
                    <label>
                      Reusable material
                      <Select
                        aria-label="Reusable material"
                        disabled={playing}
                        value={chosen.mesh.material ?? ""}
                        onChange={(event) =>
                          patchEntity((e) => {
                            if (e.mesh) {
                              e.mesh.material = event.target.value || undefined;
                              delete e.mesh.surface;
                            }
                          })
                        }
                      >
                        <option value="">Original / imported material</option>
                        {scene.graphics?.materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                    {(["castShadow", "receiveShadow"] as const).map((key) => (
                      <label className="row-field" key={key}>
                        {key === "castShadow" ? "Cast shadow" : "Receive shadow"}
                        <Input
                          type="checkbox"
                          aria-label={
                            key === "castShadow" ? "Mesh casts shadow" : "Mesh receives shadow"
                          }
                          disabled={playing}
                          checked={
                            chosen.mesh?.[key] ??
                            (key === "receiveShadow" ||
                              (
                                chosen.mesh?.surface ??
                                scene.graphics?.materials.find(
                                  (m) => m.id === chosen.mesh?.material,
                                )
                              )?.alphaMode !== "blend")
                          }
                          onChange={(event) =>
                            patchEntity((e) => {
                              if (e.mesh) e.mesh[key] = event.target.checked;
                            })
                          }
                        />
                      </label>
                    ))}
                    <Button disabled={playing} onClick={() => setMaterialEditor(true)}>
                      Edit material surface…
                    </Button>
                    {chosen.mesh.surface && (
                      <Button
                        disabled={playing}
                        onClick={() =>
                          patchEntity((e) => {
                            if (e.mesh) delete e.mesh.surface;
                          })
                        }
                      >
                        Remove instance surface override
                      </Button>
                    )}
                    <Button disabled={playing} onClick={() => setShaderEditor(true)}>
                      Custom shader…
                    </Button>
                    {chosen.mesh.shader && (
                      <Button
                        disabled={playing}
                        onClick={() =>
                          patchEntity((e) => {
                            if (e.mesh) delete e.mesh.shader;
                          })
                        }
                      >
                        Remove custom shader binding
                      </Button>
                    )}
                    <small className="hint">
                      Instance-safe scalar overrides. Imported texture/UV authoring is a later Plan
                      03 gate.
                    </small>
                  </Panel>
                )}
                <Panel>
                  <h3>
                    <Icon name="physics" /> Physics body
                  </h3>
                  {chosen.physics ? (
                    <>
                      <label className="row-field">
                        Type
                        <Select
                          aria-label="Body type"
                          value={chosen.physics.type}
                          disabled={playing}
                          onChange={(e) =>
                            patchEntity((item) => {
                              if (item.physics)
                                item.physics.type = e.target.value as
                                  | "fixed"
                                  | "dynamic"
                                  | "kinematic";
                            })
                          }
                        >
                          {["fixed", "dynamic", "kinematic"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </Select>
                      </label>
                      <label className="row-field">
                        Collider
                        <Select
                          aria-label="Collider shape"
                          value={chosen.physics.shape}
                          disabled={playing}
                          onChange={(e) =>
                            patchEntity((item) => {
                              if (item.physics)
                                item.physics.shape = e.target.value as "box" | "sphere" | "capsule";
                            })
                          }
                        >
                          {["box", "sphere", "capsule"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </Select>
                      </label>
                      {num(
                        "Mass",
                        chosen.physics.mass,
                        (v) =>
                          patchEntity((e) => {
                            if (e.physics) e.physics.mass = v;
                          }),
                        0.01,
                        10000,
                      )}
                      {num(
                        "Friction",
                        chosen.physics.friction,
                        (v) =>
                          patchEntity((e) => {
                            if (e.physics) e.physics.friction = v;
                          }),
                        0,
                        2,
                      )}
                      {num(
                        "Restitution",
                        chosen.physics.restitution,
                        (v) =>
                          patchEntity((e) => {
                            if (e.physics) e.physics.restitution = v;
                          }),
                        0,
                        1,
                      )}
                      <label className="row-field">
                        Sensor / trigger
                        <Input
                          aria-label="Sensor"
                          type="checkbox"
                          checked={chosen.physics.sensor}
                          disabled={playing}
                          onChange={(event) =>
                            patchEntity((e) => {
                              if (e.physics) e.physics.sensor = event.target.checked;
                            })
                          }
                        />
                      </label>
                      <Button
                        className="subtle"
                        disabled={playing}
                        onClick={() =>
                          patchEntity((e) => {
                            delete e.physics;
                          })
                        }
                      >
                        Remove physics
                      </Button>
                    </>
                  ) : (
                    <>
                      <p>Primitive proxy colliders. Physics bodies must be root entities.</p>
                      <Button
                        disabled={playing || !!chosen.parent}
                        onClick={() =>
                          patchEntity((e) => {
                            e.physics = {
                              type: "dynamic",
                              shape: "box",
                              mass: 1,
                              friction: 0.7,
                              restitution: 0.1,
                              sensor: false,
                            };
                          })
                        }
                      >
                        <Icon name="plus" /> Add rigid body
                      </Button>
                    </>
                  )}
                </Panel>
                <Panel>
                  <h3>
                    <Icon name="code" /> Behavior
                  </h3>
                  <Select
                    aria-label="Behavior"
                    value={chosen.behavior || ""}
                    disabled={playing}
                    onChange={(event) =>
                      patchEntity((e) => {
                        const name = event.target.value;
                        e.behavior = name || undefined;
                        if (name === "character" || name === "vehicle") {
                          e.tag = "player";
                          e.physics = {
                            type: "kinematic",
                            shape: name === "character" ? "capsule" : "box",
                            mass: 75,
                            friction: 0.5,
                            restitution: 0,
                            sensor: false,
                          };
                        }
                      })
                    }
                  >
                    {[
                      "",
                      "character",
                      "vehicle",
                      "collectible",
                      "checkpoint",
                      "finish",
                      "spin",
                    ].map((v) => (
                      <option key={v} value={v}>
                        {v || "None"}
                      </option>
                    ))}
                  </Select>
                  <small className="hint">
                    Built-in behaviors run in Play. Attach custom TypeScript below to extend them.
                  </small>
                </Panel>
                {chosen.mesh?.asset &&
                  scene.assets.find((a) => a.id === chosen.mesh?.asset)?.import && (
                    <AnimationPanel
                      key={chosen.id}
                      entity={chosen}
                      asset={scene.assets.find((a) => a.id === chosen.mesh?.asset)!}
                      engine={engine.current}
                      disabled={playing || loadBusy || importBusy}
                      commit={commit}
                    />
                  )}
                <ScriptAttachments
                  entity={chosen}
                  scene={scene}
                  disabled={playing}
                  patch={patchEntity}
                  onOpen={(id) => {
                    setScriptId(id);
                    void openExternalSource(id ? "script" : "scene", id);
                    setTab("scripts");
                  }}
                />
                {chosen.light && (
                  <Panel>
                    <h3>
                      <Icon name="light" /> Light
                    </h3>
                    <label>
                      Light type
                      <Select
                        aria-label="Light type"
                        disabled={playing}
                        value={chosen.light.type}
                        onChange={(event) =>
                          patchEntity((e) => {
                            if (e.light)
                              e.light.type = event.target.value as "directional" | "point" | "spot";
                          })
                        }
                      >
                        {["directional", "point", "spot"].map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </Select>
                    </label>
                    <label className="row-field">
                      Cast shadow
                      <Input
                        aria-label="Light casts shadow"
                        type="checkbox"
                        disabled={playing}
                        checked={chosen.light.castShadow ?? false}
                        onChange={(event) =>
                          patchEntity((e) => {
                            if (e.light) e.light.castShadow = event.target.checked;
                          })
                        }
                      />
                    </label>
                    <label>
                      Shadow updates
                      <Select
                        aria-label="Light shadow update mode"
                        disabled={playing}
                        value={chosen.light.shadowUpdate ?? "every-frame"}
                        onChange={(event) =>
                          patchEntity((e) => {
                            if (e.light)
                              e.light.shadowUpdate = event.target.value as
                                | "every-frame"
                                | "on-change"
                                | "manual";
                          })
                        }
                      >
                        {["every-frame", "on-change", "manual"].map((mode) => (
                          <option key={mode}>{mode}</option>
                        ))}
                      </Select>
                    </label>
                    {chosen.light.type === "directional" && (
                      <label>
                        Directional shadow bounds
                        <Select
                          aria-label="Directional shadow bounds"
                          disabled={playing}
                          value={chosen.light.shadowFrustum ?? "fixed"}
                          onChange={(event) =>
                            patchEntity((e) => {
                              if (e.light)
                                e.light.shadowFrustum = event.target.value as "fixed" | "scene";
                            })
                          }
                        >
                          <option value="fixed">Fixed bounds</option>
                          <option value="scene">Fit scene bounds</option>
                        </Select>
                      </label>
                    )}
                    <label>
                      Requested shadow size
                      <Select
                        aria-label="Light shadow size"
                        disabled={playing}
                        value={chosen.light.shadowSize ?? 512}
                        onChange={(event) =>
                          patchEntity((e) => {
                            if (e.light)
                              e.light.shadowSize = Number(event.target.value) as 512 | 1024 | 2048;
                          })
                        }
                      >
                        {[512, 1024, 2048].map((size) => (
                          <option key={size}>{size}</option>
                        ))}
                      </Select>
                    </label>
                    {chosen.light.type === "spot" && (
                      <>
                        {num(
                          "Spot cone degrees",
                          chosen.light.angle ?? 28.65,
                          (v) =>
                            patchEntity((e) => {
                              if (e.light) e.light.angle = v;
                            }),
                          1,
                          89,
                        )}
                        {num(
                          "Spot penumbra",
                          chosen.light.penumbra ?? 0.6,
                          (v) =>
                            patchEntity((e) => {
                              if (e.light) e.light.penumbra = v;
                            }),
                          0,
                          1,
                          0.05,
                        )}
                      </>
                    )}
                    {num(
                      "Shadow bias",
                      chosen.light.bias ?? -0.0005,
                      (v) =>
                        patchEntity((e) => {
                          if (e.light) e.light.bias = v;
                        }),
                      -0.01,
                      0.01,
                      0.0001,
                    )}
                    {num(
                      "Shadow normal bias",
                      chosen.light.normalBias ?? 0.02,
                      (v) =>
                        patchEntity((e) => {
                          if (e.light) e.light.normalBias = v;
                        }),
                      0,
                      1,
                      0.01,
                    )}
                    <small>
                      Point/spot intensity is candela; directional intensity follows Three.js
                      irradiance convention. Range is metres. Preview profiles cap shadows without
                      changing these authored values.
                    </small>
                    {num(
                      "Light intensity",
                      chosen.light.intensity,
                      (v) =>
                        patchEntity((e) => {
                          if (e.light) e.light.intensity = v;
                        }),
                      0,
                      200,
                    )}
                    {num(
                      "Light range",
                      chosen.light.range,
                      (v) =>
                        patchEntity((e) => {
                          if (e.light) e.light.range = v;
                        }),
                      1,
                      100,
                    )}
                    <label className="row-field">
                      Color
                      <ColorPicker
                        key={chosen.id + ":light"}
                        label="Light color"
                        value={chosen.light.color}
                        disabled={playing}
                        onChange={(color) =>
                          patchEntity((item) => {
                            if (item.light) item.light.color = color;
                          })
                        }
                      />
                    </label>
                  </Panel>
                )}
                <Button
                  className="wide-button"
                  disabled={playing}
                  onClick={() => void exportPrefab()}
                >
                  <Icon name="download" /> Export selected prefab
                </Button>
              </>
            ) : (
              <div className="empty-inspector">
                <span>
                  <Icon name="focus" size={32} />
                </span>
                <h3>
                  {selectedCollection ? selectedCollection.name : "A place for every detail."}
                </h3>
                <p>
                  {selectedCollection
                    ? "Organizational collection. Drag objects or nested collections here; transforms and physics remain unchanged. Double-click to collapse. Rename with F2."
                    : "Select an object in the scene or hierarchy to inspect its components."}
                </p>
                <Button
                  onClick={() =>
                    setSelected(
                      scene.entities.find((e) => e.tag === "player")?.id ||
                        scene.entities[0]?.id ||
                        null,
                    )
                  }
                >
                  Select main actor
                </Button>
              </div>
            )
          ) : (
            <>
              <div className="render-heading">
                <small>RENDER PIPELINE</small>
                <h2>Atmosphere, on your terms.</h2>
                <p>Low-cost defaults. Optional effects. No hidden Vulkan requirement.</p>
              </div>
              <div className="preset-buttons">
                <Button
                  className={settings.preset === "low" ? "active" : ""}
                  onClick={() => setSettings({ ...LOW })}
                >
                  LOW / CEDAR
                </Button>
                <Button
                  className={settings.preset === "high" ? "active" : ""}
                  onClick={() => setSettings({ ...HIGH })}
                >
                  HIGH / FX
                </Button>
              </div>
              <Panel>
                <h3>Budget & lighting</h3>
                <p>
                  {settings.preset === "low"
                    ? "960 × 540 maximum · 30 FPS target · shadows off by default"
                    : "1600 × 900 maximum · 60 FPS play target · budgeted shadows"}
                </p>
                <label>
                  View distance <b>{settings.viewDistance}</b>
                  <Input
                    aria-label="View distance"
                    type="range"
                    min="35"
                    max="180"
                    step="5"
                    value={settings.viewDistance}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, viewDistance: Number(e.target.value) }))
                    }
                  />
                </label>
                <small className="hint">
                  Frustum culling stays active. Counter is distance-enabled entities, not exact
                  GPU-visible meshes.
                </small>
              </Panel>
              <Panel>
                <h3>Trusted shader preview</h3>
                <p className="hint">
                  Custom GLSL can stall a driver. Imported GPU code is disabled by default. This is
                  not a sandbox.
                </p>
                <Button
                  disabled={playing || loadBusy}
                  onClick={() => {
                    const next = { ...settings, allowCustomShaders: !settings.allowCustomShaders };
                    engine.current?.applySettings(next);
                    setSettings(next);
                    setLoadAttempt((n) => n + 1);
                  }}
                >
                  {settings.allowCustomShaders
                    ? "Disable custom shaders"
                    : "Trust and reload authored shaders"}
                </Button>
              </Panel>
              <Panel>
                <h3>Scene reflection lighting (authored)</h3>
                <label className="row-field">
                  PMREM hemisphere environment
                  <Input
                    aria-label="PMREM environment"
                    type="checkbox"
                    disabled={playing}
                    checked={!!scene.graphics?.environment}
                    onChange={(event) =>
                      commit((d) => {
                        d.graphics ??= emptyGraphics();
                        if (event.target.checked)
                          d.graphics.environment = {
                            sky: "#b8d7ff",
                            ground: "#30352a",
                            intensity: 1,
                            resolution: 128,
                          };
                        else delete d.graphics.environment;
                      })
                    }
                  />
                </label>
                {scene.graphics?.environment && (
                  <>
                    {(["sky", "ground"] as const).map((key) => (
                      <label className="row-field" key={key}>
                        {key}
                        <ColorPicker
                          label={"Environment " + key}
                          value={scene.graphics!.environment![key]}
                          disabled={playing}
                          onChange={(color) =>
                            commit((d) => {
                              if (d.graphics?.environment) d.graphics.environment[key] = color;
                            })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      Environment intensity
                      <Input
                        aria-label="Environment intensity"
                        type="range"
                        min={0}
                        max={8}
                        step={0.1}
                        disabled={playing}
                        value={scene.graphics.environment.intensity}
                        onChange={(event) =>
                          commit((d) => {
                            if (d.graphics?.environment)
                              d.graphics.environment.intensity = Number(event.target.value);
                          })
                        }
                      />
                    </label>
                    <label>
                      PMREM face size
                      <Select
                        aria-label="PMREM face size"
                        disabled={playing}
                        value={scene.graphics.environment.resolution}
                        onChange={(event) =>
                          commit((d) => {
                            if (d.graphics?.environment)
                              d.graphics.environment.resolution = Number(event.target.value) as
                                | 128
                                | 256;
                          })
                        }
                      >
                        <option value={128}>128</option>
                        <option value={256}>256</option>
                      </Select>
                    </label>
                  </>
                )}
                <p className="hint">
                  Filtered linear reflections, shared between staged worlds. Requires floating-point
                  targets. External HDR image environments are not yet supported.
                </p>
              </Panel>
              <PreviewRendering
                settings={settings}
                post={previewPost(settings, scene.graphics?.post)}
                snapshot={stats?.graphics}
                canAuthor={!playing}
                onSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
                onPost={(post) => setSettings((s) => ({ ...s, previewPost: post }))}
                onReset={() => setSettings((s) => ({ ...s, previewPost: undefined }))}
                onAuthor={() =>
                  commit((d) => {
                    d.graphics ??= emptyGraphics();
                    d.graphics.post = previewPost(settings, scene.graphics?.post);
                  })
                }
                onDesktop={() => setPreferencesOpen(true)}
              />
              <Panel>
                <h3>Adapter</h3>
                <code>{stats?.adapter || "Not available"}</code>
                <small>
                  Asset admission: {((stats?.assetAccountedBytes || 0) / 1048576).toFixed(1)} MiB ·
                  peak {((stats?.assetPeakAccountedBytes || 0) / 1048576).toFixed(1)} MiB.
                  Conservative accounting, not measured process/GPU memory.
                </small>
                <p className="hint">
                  SwiftShader / llvmpipe means CPU software rendering, not your physical GPU.
                </p>
              </Panel>
            </>
          )}
        </div>
      </Panel>
      <Panel className="bottom-panel">
        <div className="bottom-tabs">
          {workspace.dockGrip}
          <Select
            className="pf-panel-select"
            aria-label="Workspace panel"
            value={tab}
            onChange={(e) => setTab(e.target.value as typeof tab)}
          >
            {panelDefinitions
              .filter((p) => p.side === "bottom")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
          </Select>
          <div className="pf-shelf-tabs">
            {(["assets", "console", "ui", "scripts", "guide"] as const).map((t) => (
              <Button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {t === "assets" ? (
                  <>
                    <Icon name="assets" /> Asset library
                  </>
                ) : t === "console" ? (
                  <>
                    <Icon name="console" /> Console ({logs.length})
                  </>
                ) : t === "ui" ? (
                  <>
                    <Icon name="assets" />
                    UI designer
                  </>
                ) : t === "scripts" ? (
                  <>
                    <Icon name="code" /> Scripts
                  </>
                ) : (
                  <>
                    <Icon name="guide" /> Quick start
                  </>
                )}
              </Button>
            ))}
          </div>
          <div>
            {tab === "assets" ? (
              <ActionMenu label="Assets" badge={pendingImports.length}>
                {!!pendingImports.length && (
                  <MenuItem onSelect={() => setAssetActionsOpen(true)}>
                    Resolve {pendingImports.length} import issue(s)…
                  </MenuItem>
                )}
                <MenuItem
                  disabled={playing || importBusy}
                  onSelect={() => {
                    chooseModelImport();
                  }}
                >
                  Import model…
                </MenuItem>
                <MenuItem onSelect={() => setImportSettingsOpen(true)}>Import settings</MenuItem>
                <MenuItem onSelect={() => setAssetActionsOpen(true)}>More asset actions…</MenuItem>
              </ActionMenu>
            ) : tab === "console" ? (
              <>
                <Button
                  onClick={() => {
                    engine.current?.events.clear();
                    setLogs([]);
                  }}
                >
                  Clear
                </Button>
                <Button
                  onClick={() =>
                    void download("engine-session.jsonl", engine.current?.events.jsonl() || "")
                  }
                >
                  Export log
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {tab === "ui" ? (
          <UIEditor
            actions={uiActions}
            sharedClipboard={uiClipboard}
            onCopy={setUIClipboard}
            scene={scene}
            selected={uiSelected}
            onSelect={(id) => {
              setSelectionDomain("ui");
              setUISelected(id);
            }}
            commit={commit}
            disabled={playing}
          />
        ) : tab === "scripts" ? (
          <ScriptPanel
            key={scriptId + (scene.scripts?.find((s) => s.id === scriptId)?.source || "")}
            scene={scene}
            disabled={playing}
            commit={commit}
            exportText={download}
            selectedId={scriptId}
            onSelect={setScriptId}
            onOpenFiles={() => setFilesOpen(true)}
            onOpenSource={() => void openExternalSource("script", scriptId)}
          />
        ) : tab === "assets" ? (
          <div className="asset-content">
            <div className="asset-folders">
              <span className="active">
                <Icon name="folderOpen" /> Built-in library
              </span>
              <span>　Primitives</span>
              <span>　Game templates</span>
              <span>　Project assets ({scene.assets.length})</span>
              <small>
                GLB · experimental FBX + PNG/JPEG
                <br />
                200 MB model + companion input · 2048px textures
              </small>
            </div>
            <div className="asset-grid">
              {(["box", "sphere", "capsule", "cylinder", "cone"] as const).map((p, i) => (
                <Button className="asset-card" disabled={playing} key={p} onClick={() => add(p)}>
                  <span className={"asset-icon shape-" + p}>
                    <Icon
                      name={(["cube", "sphere", "capsule", "cylinder", "cone"] as const)[i]}
                      size={32}
                    />
                  </span>
                  <strong>{p}</strong>
                  <small>PRIMITIVE · ADD</small>
                </Button>
              ))}
              <Button
                className="asset-card"
                disabled={playing}
                onClick={() => {
                  const e = entity("Spot light", "sphere", [0, 4, 0], [0.3, 0.3, 0.3], "#ffe2a3");
                  e.light = { type: "spot", color: "#ffcf8d", intensity: 45, range: 12 };
                  commit((d) => d.entities.push(e));
                  setSelected(e.id);
                }}
              >
                <span className="asset-icon">
                  <Icon name="light" size={32} />
                </span>
                <strong>Spot light</strong>
                <small>LIGHT · ADD</small>
              </Button>
              {scene.assets.map((a) => (
                <div key={a.id}>
                  <Button
                    className="asset-card"
                    disabled={playing}
                    key={a.id}
                    onClick={() => placeAsset(a.id)}
                  >
                    <span className="asset-icon">
                      <Icon name="cube" size={32} />
                    </span>
                    <strong>{a.name}</strong>
                    <small>
                      {a.import?.format.toUpperCase() || "GLB"} · INSTANCE{" "}
                      {a.import ? `· r${a.import.revision}` : ""}
                    </small>
                  </Button>
                  <Button
                    disabled={playing || importBusy}
                    aria-label={`Reimport ${a.name}`}
                    onClick={() => reimportAsset(a.id)}
                  >
                    Reimport…
                  </Button>
                  {a.import && (
                    <details>
                      <summary>Import report</summary>
                      <small>
                        {a.import.report.nodes} nodes · {a.import.report.vertices} vertices ·{" "}
                        {a.import.report.clips.length} clips
                        <br />
                        SHA-256 {a.import.artifactHash}
                        <br />
                        {a.import.report.warnings.join(" ")}
                      </small>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : tab === "console" ? (
          <div className="console">
            {logs.map((e, i) => (
              <div className={e.type === "error" ? "error" : ""} key={i}>
                <time>{e.time.slice(11, 19)}</time>
                <b>{e.type}</b>
                <span>
                  {e.message}
                  {e.data && <code className="log-details">{JSON.stringify(e.data)}</code>}
                </span>
              </div>
            ))}
            {!logs.length && <p>No events yet.</p>}
          </div>
        ) : (
          <div className="guide">
            <div>
              <h3>01 / Build a scene</h3>
              <p>
                Add primitives, import GLB or experimental FBX with companion PNG/JPEG files, edit
                transforms and attach physics or behaviors. Double-click a hierarchy item to frame
                it.
              </p>
            </div>
            <div>
              <h3>02 / Press play</h3>
              <p>
                WASD movement. Space jumps or brakes. Drag to look; double-click for first-person
                pointer lock where allowed. Escape pauses. Stop restores the authored scene.
              </p>
            </div>
            <div>
              <h3>03 / Take it with you</h3>
              <p>
                Export scene JSON with embedded assets. Open Player to run any exported scene
                without the editor. Runtime code has no React or editor dependency.
              </p>
            </div>
          </div>
        )}
      </Panel>
      <footer className="statusbar">
        <span role="status" aria-live="polite" title={status} className={error ? "error" : ""}>
          <span className="dot" />
          {status}
        </span>
        <div>
          <label>
            Starter{" "}
            <Select
              aria-label="Game template"
              disabled={playing || projectBusy || homeBusy}
              value={scene.template}
              onChange={(e) => void newScene(e.target.value as Template)}
            >
              {Object.entries(templateNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </label>
          <span>Rapier · fixed 60 Hz</span>
          <span title="Encoded source bytes are disk-backed. Active rendering still uses RAM/VRAM.">
            Sources: {blobs.persistent ? "disk" : "memory"} · resident{" "}
            {(blobs.bytes / 1048576).toFixed(1)} MiB
          </span>
          <span title="Accounted asset working allocations, not total process RAM or VRAM">
            Working {((stats?.assetAccountedBytes ?? 0) / 1048576).toFixed(1)} MiB
          </span>
        </div>
      </footer>
      <Input
        ref={file}
        hidden
        type="file"
        accept=".pif,.json"
        onChange={(e) => void loadScene(e)}
      />
      <Input
        ref={glb}
        hidden
        type="file"
        accept=".glb,.fbx,.png,.jpg,.jpeg"
        multiple
        onChange={(e) => void importGlb(e)}
      />
      {review && <ReimportReview {...review} />}
      <Input
        ref={prefabFile}
        hidden
        type="file"
        accept=".json"
        onChange={(e) => void importPrefab(e)}
      />
    </div>
  );
}
function ApplicationShell() {
  const [openingFolder, setOpeningFolder] = useState<FolderSession>();
  const [editing, setEditing] = useState(
    () => startInEditor || new URLSearchParams(location.search).has("editor"),
  );
  const [recovery, setRecovery] = useState(() => (hasRecovery ? bootScene : undefined));
  useEffect(() => applyPreferences(readPreferences()), []);
  return editing ? (
    <App
      initialFolder={openingFolder}
      onHome={async (scene, skipSnapshot, isCurrent) => {
        if (!skipSnapshot) await rememberProject(scene);
        if (isCurrent && !isCurrent())
          throw Error(
            "Project changed while saving. Return home again after finishing your edits.",
          );
        bootScene = scene;
        setRecovery(scene);
        setOpeningFolder(undefined);
        setEditing(false);
      }}
    />
  ) : (
    <Home
      notice={bootNotice}
      recovery={recovery}
      onOpen={async (scene, folder) => {
        scene.project ??= newProjectMetadata(scene.name);
        try {
          await rememberProject(scene);
        } catch (error) {
          bootNotice = "Recent snapshot unavailable: " + String(error) + ". Save a PIF backup.";
        }
        bootScene = scene;
        setOpeningFolder(folder);
        recoveryBlocked = false;
        setEditing(true);
      }}
    />
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing editor root");
async function boot() {
  root!.textContent = "Opening asset database…";
  const requested = new URLSearchParams(location.search).get("recent");
  try {
    const restored = requested
      ? { scene: await openLocalSnapshot(requested), recovered: false, revision: 0 }
      : await assetDatabase.restoreCheckpoint();
    startInEditor = !!requested;
    hasRecovery = !!restored;
    bootScene = restored?.scene || (await referenceScene(initialScene()));
    if (restored?.recovered)
      bootNotice =
        "Recovered previous verified checkpoint; the newest checkpoint was invalid. Save a PIF backup.";
  } catch (error) {
    bootNotice =
      "Recovery unavailable: " +
      String(error) +
      ". Existing storage retained; open a PIF or create a new project.";
    recoveryBlocked = true;
    try {
      bootScene = await referenceScene(initialScene());
    } catch {
      bootScene = createTemplate("adventure");
    }
  }
  if (requested) {
    const url = new URL(location.href);
    url.searchParams.delete("recent");
    history.replaceState(null, "", url.href);
  }
  createRoot(root!).render(
    <ConfirmationProvider>
      <ApplicationShell />
    </ConfirmationProvider>,
  );
}
void boot();
