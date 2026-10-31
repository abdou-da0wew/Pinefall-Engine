import { newProjectMetadata } from "../../project/src/metadata";
import { projectJob } from "../../project/src/pif-client";
import { UIEditor } from "./ui-editor";
import { ColorPicker } from "./color-picker";
import { descendants } from "./hierarchy-model";
import { Hierarchy } from "./hierarchy";
import { Icon } from "./icons";
import { useWorkspaceLayout } from "./layout";
import { ScriptPanel, ScriptAttachments } from "./scripting";
import { hasSceneScripts } from "../../scripting/src/runtime";
import { createGame, importModel, placeModel } from "../../project/src";
/* oxlint-disable react/refs -- Event-handler closures access runtime refs; no React Compiler is used. History is revision-driven. */
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/space-grotesk/500.css";
import "./style.css";
import {
  Engine,
  LOW,
  HIGH,
  entity,
  cloneScene,
  parseScene,
  serializeScene,
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
function initialScene() {
  try {
    const saved = localStorage.getItem("pinefall-engine.scene.v1");
    if (saved) return parseScene(JSON.parse(saved));
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
function App() {
  const [projectBusy, setProjectBusy] = useState(false);
  const projectAbort = useRef<AbortController | null>(null);
  const projectCommands = useRef<(event: KeyboardEvent) => void>(() => {});
  const [uiSelected, setUISelected] = useState("");
  const [trustedSignature, setTrustedSignature] = useState<string | null>(null),
    [scriptId, setScriptId] = useState("");
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
    [settings, setSettings] = useState<RenderSettings>({ ...LOW }),
    [tab, setTab] = useState<"assets" | "console" | "guide" | "scripts" | "ui">("assets"),
    [inspector, setInspector] = useState<"entity" | "render">("entity"),
    [logs, setLogs] = useState<EngineEvent[]>([]),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Initializing physics and renderer…"),
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
  const applyRef = useRef<(fn: (scene: SceneDocument) => void) => void>(() => {});
  useEffect(() => {
    const handler = (e: KeyboardEvent) => projectCommands.current(e);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      projectAbort.current?.abort();
    };
  }, []);
  projectCommands.current = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (!projectBusy) void saveProject();
    }
    if (e.key.toLowerCase() === "o") {
      e.preventDefault();
      if (!projectBusy && !playing) file.current?.click();
    }
  };
  async function saveProject() {
    if (projectAbort.current) return;
    const controller = new AbortController();
    projectAbort.current = controller;
    setProjectBusy(true);
    setStatus("Compressing PIF project in worker…");
    try {
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
      }
    } catch (error) {
      setStatus(String(error));
    } finally {
      if (projectAbort.current === controller) projectAbort.current = null;
      setProjectBusy(false);
    }
  }

  function createNewGame() {
    try {
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
    }
  }

  useEffect(() => {
    engine.current?.selectUI(uiSelected);
  }, [uiSelected, revision]);
  function commit(fn: (scene: SceneDocument) => void) {
    if (playing) return;
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
      .then(async (instance) => {
        if (disposed) {
          instance.dispose();
          return;
        }
        engine.current = instance;
        unsubscribe = instance.events.subscribe((event) => {
          setLogs((old) => [...old.slice(-199), event]);
          if (event.type === "error") setStatus(event.message);
        });
        await instance.load(current.current);
        if (!disposed) {
          setReady(true);
          setStatus("Ready · changes are saved locally");
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
    if (engine.current && ready)
      void engine.current
        .load(scene, { preserveView: engine.current.document?.name === scene.name })
        .catch((e) => setError(String(e)));
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("pinefall-engine.scene.v1", serializeScene(scene));
        // Autosave must not overwrite import/export results or errors.
      } catch {
        setStatus("Local storage unavailable/full. Export your scene to keep it.");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [scene, ready]);
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
  function newScene(template: Template) {
    if (playing) return;
    history.current.commit(scene);
    const next = createTemplate(template);
    next.project = newProjectMetadata(next.name);
    current.current = next;
    setScene(next);
    setSelected(null);
    setRevision((r) => r + 1);
  }
  async function run() {
    if (!engine.current || !ready) return;
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
        engine.current.play();
        setPlaying(true);
      } catch (e) {
        setStatus(String(e));
      }
    }
  }
  async function loadScene(event: React.ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0];
    event.target.value = "";
    if (!f || projectAbort.current) return;
    const before = current.current;
    try {
      const isPif = f.name.toLowerCase().endsWith(".pif");
      if (f.size > (isPif ? 16 * 1024 * 1024 : 9_000_000))
        throw Error("Project exceeds file size limit");
      const controller = new AbortController();
      projectAbort.current = controller;
      setProjectBusy(true);
      setStatus(isPif ? "Opening PIF in worker…" : "Opening legacy JSON…");
      const next = isPif
        ? await projectJob("unpack", new Uint8Array(await f.arrayBuffer()), controller.signal)
        : parseScene(JSON.parse(await f.text()));
      if (controller.signal.aborted) throw Error("Project operation cancelled");
      if (current.current !== before)
        throw Error("Project changed while opening. Retry after finishing your edits.");
      if (engine.current?.playing) throw Error("Stop gameplay before replacing the project");
      next.project ??= newProjectMetadata(next.name);
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
  async function importFiles(files: File[]) {
    if (playing) return;
    try {
      let next = cloneScene(current.current);
      let selectedId: string | null = null;
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith(".glb"))
          throw Error("Import self-contained .glb models; textures/materials must be embedded");
        const result = importModel(next, file.name, new Uint8Array(await file.arrayBuffer()));
        const placed = placeModel(result.scene, result.asset.id);
        next = placed.scene;
        selectedId = placed.entity.id;
      }
      commit((d) => {
        d.assets = next.assets;
        d.entities = next.entities;
      });
      setSelected(selectedId);
    } catch (e) {
      setStatus(String(e));
    }
  }
  async function importGlb(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    await importFiles(files);
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
      serializeScene({ ...scene, name: e.name, entities: items }),
    );
  }
  async function importPrefab(event: React.ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0];
    event.target.value = "";
    if (!f) return;
    try {
      if (f.size > 9_000_000) throw new Error("Prefab too large");
      const prefab = parseScene(JSON.parse(await f.text()));
      const mapping = new Map(prefab.entities.map((e) => [e.id, crypto.randomUUID()]));
      const collectionMap = new Map(
        (prefab.collections || []).map((c) => [c.id, crypto.randomUUID()]),
      );
      commit((d) => {
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

  function num(
    label: string,
    value: number,
    onCommit: (v: number) => void,
    min = -1000,
    max = 1000,
    step = 0.1,
  ) {
    return (
      <label className="number-field">
        <span>{label}</span>
        <input
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
      style={workspace.style}
      className={"workbench " + workspace.className + (tab === "scripts" ? " scripting-open" : "")}
    >
      {workspace.handles}
      {workspace.dockTargets}
      {newGameOpen && (
        <div className="project-modal" role="dialog" aria-modal="true" aria-label="New game">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createNewGame();
            }}
          >
            <small>PINEFALL / CREATE</small>
            <h2>Your next game starts here.</h2>
            <label>
              Game name
              <input
                aria-label="Game name"
                required
                maxLength={100}
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
              />
            </label>
            <label>
              Starting scene
              <select
                aria-label="Starting scene"
                value={gameStarter}
                onChange={(e) => setGameStarter(e.target.value)}
              >
                <option value="blank">Blank world + playable character</option>
                {Object.entries(templateNames).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Import your GLB models, place them, add colliders and press Play. Export your current
              scene before creating another game if you want to keep it permanently. New games
              replace the local autosave; Undo restores the previous scene during this session.
            </p>
            <footer>
              <button type="button" onClick={() => setNewGameOpen(false)}>
                Cancel
              </button>
              <button type="submit">Create game</button>
            </footer>
          </form>
        </div>
      )}

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <img src="./pinefall-logo.svg" width="32" height="32" alt="Pinefall" />
          </span>
          <div>
            PINEFALL <b>ENGINE</b>
            <small>WORKSHOP / 0.5.2</small>
          </div>
        </div>
        <div className="project-path">
          Projects <span>/</span> {scene.name} <i>LOCAL</i>
        </div>
        <div className="top-actions">
          {workspace.toolbar}
          <button disabled={playing} onClick={() => setNewGameOpen(true)}>
            <Icon name="plus" /> New game
          </button>
          <button
            disabled={playing || projectBusy}
            title="Open project · Ctrl/⌘+O"
            onClick={() => file.current?.click()}
          >
            <Icon name="upload" /> Open project
          </button>
          <button
            disabled={projectBusy}
            title="Save PIF project · Ctrl/⌘+S"
            onClick={() => void saveProject()}
          >
            <Icon name="save" />
            Save project
          </button>
          {projectBusy && (
            <button onClick={() => projectAbort.current?.abort()}>Cancel project operation</button>
          )}
          <button onClick={() => void download(scene.name + ".scene.json", serializeScene(scene))}>
            <Icon name="download" /> Export scene
          </button>
          <a href={`./game.html?template=${scene.template}`} target="_blank" rel="noreferrer">
            <Icon name="external" /> Player
          </a>
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
              <input
                type="checkbox"
                aria-label="Allow trusted scripts"
                checked={scriptsTrusted}
                disabled={playing}
                onChange={(e) => setTrustedSignature(e.target.checked ? scriptSignature : null)}
              />
              Allow trusted scripts
            </label>
          ) : null}
          <button
            aria-label={playing ? "Stop scene" : "Play scene"}
            className={playing ? "stop" : "play"}
            disabled={!ready}
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
          </button>
          <button
            aria-label="Pause simulation"
            disabled={!playing}
            className={paused ? "active" : ""}
            onClick={() => {
              if (engine.current) {
                engine.current.paused = !engine.current.paused;
                setPaused(engine.current.paused);
              }
            }}
          >
            <Icon name="pause" />
          </button>
        </div>
        <div className="history-controls">
          <button disabled={playing || !history.current.canUndo} onClick={() => undo()}>
            <Icon name="undo" /> Undo
          </button>
          <button disabled={playing || !history.current.canRedo} onClick={() => undo(true)}>
            <Icon name="redo" /> Redo
          </button>
          <span className="saved-dot" /> {playing ? "Runtime isolated" : "Local autosave"}
        </div>
      </div>
      <Hierarchy
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
            <button
              aria-label="Toggle viewport focus"
              title="Maximize / restore viewport"
              onClick={workspace.toggleFocus}
            >
              <Icon name="maximize" />
            </button>
            {(["translate", "rotate", "scale"] as const).map((t, i) => (
              <button
                key={t}
                disabled={playing}
                title={t}
                className={tool === t ? "active" : ""}
                onClick={() => {
                  setTool(t);
                  engine.current?.transformMode(t);
                }}
              >
                <Icon name={(["move", "rotate", "scale"] as const)[i]} />
              </button>
            ))}
            <button
              disabled={!chosen || playing}
              onClick={() => selected && engine.current?.focus(selected)}
            >
              Frame
            </button>
            <button onClick={() => setInspector("render")}>
              <Icon name="settings" /> Render
            </button>
          </div>
        </div>
        <div
          className="canvas-wrap"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
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
            <small>{settings.volumetrics ? "BEAM VOLUMES ON" : "VOLUMETRICS OFF"}</small>
          </div>
          {!playing && ready && !scene.ui?.elements.length && (
            <div className="scene-caption">
              <div>THE LAST LIGHT COLLECTION</div>
              <h1>{scene.name}</h1>
              <p>A small world. A reusable foundation.</p>
              <button onClick={() => void run()}>
                <Icon name="play" /> Explore in play mode
              </button>
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
                  <button onClick={() => engine.current?.spawnBox()}>
                    <Icon name="plus" /> Spawn crate
                  </button>
                  <button onClick={() => engine.current?.impulse()}>
                    <Icon name="up" /> Apply impulse
                  </button>
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
      <aside className="inspector">
        <div className="inspector-tabs">
          <button
            className={inspector === "entity" ? "active" : ""}
            onClick={() => setInspector("entity")}
          >
            Inspector
          </button>
          <button
            className={inspector === "render" ? "active" : ""}
            onClick={() => setInspector("render")}
          >
            Rendering
          </button>
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
                    <input
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
                  <input
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
                <section>
                  <h3>
                    <Icon name="move" /> Transform
                  </h3>
                  {vector("position")}
                  {vector("rotation")}
                  {vector("scale")}
                  <small className="hint">
                    Rotation in degrees. Commit a numeric edit with Enter or by leaving the field.
                  </small>
                </section>
                {chosen.mesh && (
                  <section>
                    <h3>
                      <Icon name="cube" /> Mesh renderer
                    </h3>
                    <label className="row-field">
                      Library model
                      <select
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
                      </select>
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
                    <small className="hint">
                      Shared geometry & materials · standard lit shading
                    </small>
                  </section>
                )}
                <section>
                  <h3>
                    <Icon name="physics" /> Physics body
                  </h3>
                  {chosen.physics ? (
                    <>
                      <label className="row-field">
                        Type
                        <select
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
                        </select>
                      </label>
                      <label className="row-field">
                        Collider
                        <select
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
                        </select>
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
                        <input
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
                      <button
                        className="subtle"
                        disabled={playing}
                        onClick={() =>
                          patchEntity((e) => {
                            delete e.physics;
                          })
                        }
                      >
                        Remove physics
                      </button>
                    </>
                  ) : (
                    <>
                      <p>Primitive proxy colliders. Physics bodies must be root entities.</p>
                      <button
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
                      </button>
                    </>
                  )}
                </section>
                <section>
                  <h3>
                    <Icon name="code" /> Behavior
                  </h3>
                  <select
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
                  </select>
                  <small className="hint">
                    Built-in behaviors run in Play. Attach custom TypeScript below to extend them.
                  </small>
                </section>
                <ScriptAttachments
                  entity={chosen}
                  scene={scene}
                  disabled={playing}
                  patch={patchEntity}
                  onOpen={(id) => {
                    setScriptId(id);
                    setTab("scripts");
                  }}
                />
                {chosen.light && (
                  <section>
                    <h3>
                      <Icon name="light" /> Light
                    </h3>
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
                  </section>
                )}
                <button
                  className="wide-button"
                  disabled={playing}
                  onClick={() => void exportPrefab()}
                >
                  <Icon name="download" /> Export selected prefab
                </button>
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
                <button
                  onClick={() =>
                    setSelected(
                      scene.entities.find((e) => e.tag === "player")?.id ||
                        scene.entities[0]?.id ||
                        null,
                    )
                  }
                >
                  Select main actor
                </button>
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
                <button
                  className={settings.preset === "low" ? "active" : ""}
                  onClick={() => setSettings({ ...LOW })}
                >
                  LOW / CEDAR
                </button>
                <button
                  className={settings.preset === "high" ? "active" : ""}
                  onClick={() => setSettings({ ...HIGH })}
                >
                  HIGH / FX
                </button>
              </div>
              <section>
                <h3>Budget & lighting</h3>
                <p>
                  {settings.preset === "low"
                    ? "960 × 540 maximum · 30 FPS target · no shadow maps"
                    : "1600 × 900 maximum · 60 FPS play target · sun shadows"}
                </p>
                <label>
                  View distance <b>{settings.viewDistance}</b>
                  <input
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
              </section>
              <section>
                <h3>Post-processing</h3>
                {(["post", "glow", "volumetrics"] as const).map((key) => (
                  <label className="row-field" key={key}>
                    {key === "post"
                      ? "Enable post FX"
                      : key === "glow"
                        ? "Threshold glow"
                        : "Volumetric-style beams"}
                    <input
                      aria-label={key}
                      type="checkbox"
                      checked={settings[key]}
                      onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.checked }))}
                    />
                  </label>
                ))}
                {(
                  [
                    ["threshold", "Glow threshold", 0.05, 1, 0.05],
                    ["strength", "Glow intensity", 0, 0.6, 0.02],
                    ["exposure", "Exposure", 0.7, 1.5, 0.05],
                    ["beamOpacity", "Beam density", 0.01, 0.25, 0.01],
                  ] as const
                ).map(([key, label, min, max, step]) => (
                  <label key={key}>
                    {label}
                    <b>{settings[key].toFixed(2)}</b>
                    <input
                      aria-label={label}
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={settings[key]}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))
                      }
                    />
                  </label>
                ))}
                <p className="hint">
                  Beams are translucent cone approximations—not ray-marched volumetrics. Glow is a
                  five-tap effect, not full bloom. Effects cost GPU time.
                </p>
              </section>
              <section>
                <h3>Adapter</h3>
                <code>{stats?.adapter || "Not available"}</code>
                <p className="hint">
                  SwiftShader / llvmpipe means CPU software rendering, not your physical GPU.
                </p>
              </section>
            </>
          )}
        </div>
      </aside>
      <section className="bottom-panel">
        <div className="bottom-tabs">
          {workspace.dockGrip}
          <div>
            {(["assets", "console", "ui", "scripts", "guide"] as const).map((t) => (
              <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
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
              </button>
            ))}
          </div>
          <div>
            {tab === "assets" ? (
              <>
                <button disabled={playing} onClick={() => glb.current?.click()}>
                  <Icon name="upload" /> Import GLB
                </button>
                <button disabled={playing} onClick={() => prefabFile.current?.click()}>
                  <Icon name="upload" /> Import prefab
                </button>
              </>
            ) : tab === "console" ? (
              <>
                <button
                  onClick={() => {
                    engine.current?.events.clear();
                    setLogs([]);
                  }}
                >
                  Clear
                </button>
                <button
                  onClick={() =>
                    void download("engine-session.jsonl", engine.current?.events.jsonl() || "")
                  }
                >
                  Export log
                </button>
              </>
            ) : null}
          </div>
        </div>
        {tab === "ui" ? (
          <UIEditor
            scene={scene}
            selected={uiSelected}
            onSelect={setUISelected}
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
          />
        ) : tab === "assets" ? (
          <div className="asset-content">
            <div className="asset-folders">
              <span className="active">
                <Icon name="folderOpen" /> Built-in library
              </span>
              <span>　Primitives</span>
              <span>　Game templates</span>
              <span>　Embedded assets ({scene.assets.length})</span>
            </div>
            <div className="asset-grid">
              {(["box", "sphere", "capsule", "cylinder", "cone"] as const).map((p, i) => (
                <button className="asset-card" disabled={playing} key={p} onClick={() => add(p)}>
                  <span className={"asset-icon shape-" + p}>
                    <Icon
                      name={(["cube", "sphere", "capsule", "cylinder", "cone"] as const)[i]}
                      size={32}
                    />
                  </span>
                  <strong>{p}</strong>
                  <small>PRIMITIVE · ADD</small>
                </button>
              ))}
              <button
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
              </button>
              {scene.assets.map((a) => (
                <button
                  className="asset-card"
                  disabled={playing}
                  key={a.id}
                  onClick={() => {
                    const e = entity(a.name, "asset");
                    e.mesh!.asset = a.id;
                    commit((d) => d.entities.push(e));
                    setSelected(e.id);
                  }}
                >
                  <span className="asset-icon">
                    <Icon name="cube" size={32} />
                  </span>
                  <strong>{a.name}</strong>
                  <small>GLB · INSTANCE</small>
                </button>
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
                Add primitives, import self-contained GLB assets, edit transforms and attach physics
                or behaviors. Double-click a hierarchy item to frame it.
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
      </section>
      <footer className="statusbar">
        <span className={error ? "error" : ""}>
          <span className="dot" />
          {status}
        </span>
        <div>
          <label>
            Starter{" "}
            <select
              aria-label="Game template"
              disabled={playing}
              value={scene.template}
              onChange={(e) => newScene(e.target.value as Template)}
            >
              {Object.entries(templateNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <span>Rapier · fixed 60 Hz</span>
          <span>WebGL 2</span>
        </div>
      </footer>
      <input
        ref={file}
        hidden
        type="file"
        accept=".pif,.json"
        onChange={(e) => void loadScene(e)}
      />
      <input
        ref={glb}
        hidden
        type="file"
        accept=".glb"
        multiple
        onChange={(e) => void importGlb(e)}
      />
      <input
        ref={prefabFile}
        hidden
        type="file"
        accept=".json"
        onChange={(e) => void importPrefab(e)}
      />
    </div>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing editor root");
createRoot(root).render(<App />);
