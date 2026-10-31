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
  const [scene, setScene] = useState(initialScene),
    [selected, setSelected] = useState<string | null>(null),
    [playing, setPlaying] = useState(false),
    [paused, setPaused] = useState(false),
    [settings, setSettings] = useState<RenderSettings>({ ...LOW }),
    [tab, setTab] = useState<"assets" | "console" | "guide">("assets"),
    [inspector, setInspector] = useState<"entity" | "render">("entity"),
    [logs, setLogs] = useState<EngineEvent[]>([]),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Initializing physics and renderer…"),
    [ready, setReady] = useState(false),
    [search, setSearch] = useState(""),
    [stats, setStats] = useState<Stats | null>(null),
    [score, setScore] = useState({ collected: 0, total: 5, won: false, speed: 0 }),
    [revision, setRevision] = useState(0),
    [tool, setTool] = useState<"translate" | "rotate" | "scale">("translate");
  const canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<Engine | null>(null),
    history = useRef(new History()),
    current = useRef(scene),
    file = useRef<HTMLInputElement>(null),
    glb = useRef<HTMLInputElement>(null),
    prefabFile = useRef<HTMLInputElement>(null);
  const applyRef = useRef<(fn: (scene: SceneDocument) => void) => void>(() => {});
  function commit(fn: (scene: SceneDocument) => void) {
    if (playing) return;
    try {
      const next = cloneScene(current.current);
      fn(next);
      const checked = parseScene(next);
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
    if (engine.current && ready) void engine.current.load(scene).catch((e) => setError(String(e)));
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("pinefall-engine.scene.v1", serializeScene(scene));
        setStatus("Scene saved locally");
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
  function duplicate() {
    const source = scene.entities.find((e) => e.id === selected);
    if (!source) return;
    const e = structuredClone(source);
    e.id = crypto.randomUUID();
    e.name += " copy";
    e.transform.position[0] += 2;
    commit((d) => d.entities.push(e));
    setSelected(e.id);
  }
  function remove() {
    if (!selected) return;
    commit((d) => {
      const ids = new Set([selected]);
      let added = true;
      while (added) {
        added = false;
        for (const e of d.entities)
          if (e.parent && ids.has(e.parent) && !ids.has(e.id)) {
            ids.add(e.id);
            added = true;
          }
      }
      d.entities = d.entities.filter((e) => !ids.has(e.id));
    });
    setSelected(null);
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
      engine.current.play();
      setPlaying(true);
    }
  }
  async function loadScene(event: React.ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0];
    event.target.value = "";
    if (!f) return;
    try {
      if (f.size > 9_000_000) throw new Error("Scene exceeds 9 MB limit");
      const next = parseScene(JSON.parse(await f.text()));
      history.current.commit(scene);
      current.current = next;
      setScene(next);
      setSelected(null);
      setRevision((r) => r + 1);
    } catch (e) {
      setStatus(String(e));
    }
  }
  async function importGlb(event: React.ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0];
    event.target.value = "";
    if (!f) return;
    try {
      if (f.size > 2_000_000) throw new Error("GLB limit is 2 MB per asset");
      const bytes = new Uint8Array(await f.arrayBuffer());
      const view = new DataView(bytes.buffer);
      if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67)
        throw new Error("Choose a binary .glb file");
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const asset = {
        id: crypto.randomUUID(),
        name: f.name,
        data: "data:model/gltf-binary;base64," + btoa(binary),
      };
      const e = entity(f.name, "asset");
      e.mesh!.asset = asset.id;
      commit((d) => {
        d.assets.push(asset);
        d.entities.push(e);
      });
      setSelected(e.id);
    } catch (e) {
      setStatus(String(e));
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
    delete items[0].parent;
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
      commit((d) => {
        for (const asset of prefab.assets)
          if (!d.assets.some((a) => a.id === asset.id)) d.assets.push(asset);
        for (const e of prefab.entities) {
          const item = structuredClone(e);
          item.id = mapping.get(e.id)!;
          item.parent = e.parent ? mapping.get(e.parent) : undefined;
          d.entities.push(item);
        }
      });
    } catch (e) {
      setStatus(String(e));
    }
  }
  const chosen = scene.entities.find((e) => e.id === selected);
  const displayed = scene.entities.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()),
  );
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
    <div className="workbench">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          <div>
            PINEFALL <b>ENGINE</b>
            <small>WORKSHOP / 0.1</small>
          </div>
        </div>
        <div className="project-path">
          Projects <span>/</span> {scene.name} <i>LOCAL</i>
        </div>
        <div className="top-actions">
          <button disabled={playing} onClick={() => file.current?.click()}>
            ↥ Open scene
          </button>
          <button onClick={() => void download(scene.name + ".scene.json", serializeScene(scene))}>
            ↧ Export scene
          </button>
          <a href={`./game.html?template=${scene.template}`} target="_blank" rel="noreferrer">
            ↗ Player
          </a>
        </div>
      </header>
      <div className="commandbar">
        <div className="document-name">
          <span className="dot" /> {scene.name}.scene <span className="dim">3D ONLY</span>
        </div>
        <div className="play-controls">
          <button
            aria-label={playing ? "Stop scene" : "Play scene"}
            className={playing ? "stop" : "play"}
            disabled={!ready}
            onClick={() => void run()}
          >
            {playing ? "■ Stop" : "▶ Play"}
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
            Ⅱ
          </button>
        </div>
        <div className="history-controls">
          <button disabled={playing || !history.current.canUndo} onClick={() => undo()}>
            ↶ Undo
          </button>
          <button disabled={playing || !history.current.canRedo} onClick={() => undo(true)}>
            ↷ Redo
          </button>
          <span className="saved-dot" /> {playing ? "Runtime isolated" : "Local autosave"}
        </div>
      </div>
      <aside className="hierarchy">
        <div className="panel-title">
          SCENE HIERARCHY <span>{scene.entities.length}</span>
        </div>
        <input
          className="search"
          aria-label="Search entities"
          placeholder="⌕  Find an object…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="scene-root">
          ▾ <span>◈</span> {scene.name}
        </div>
        <div className="entity-list">
          {displayed.map((e) => (
            <button
              key={e.id}
              className={"entity-row " + (selected === e.id ? "selected" : "")}
              style={{ paddingLeft: e.parent ? 30 : 14, opacity: e.enabled ? 1 : 0.45 }}
              onClick={() => {
                setSelected(e.id);
                setInspector("entity");
              }}
              onDoubleClick={() => engine.current?.focus(e.id)}
            >
              <span
                className={
                  e.light ? "icon-light" : e.tag === "player" ? "icon-player" : "icon-object"
                }
              >
                {e.light ? "☀" : e.tag === "player" ? "◉" : e.physics?.sensor ? "◇" : "⬡"}
              </span>
              <span>{e.name}</span>
              {e.physics && (
                <i>{e.physics.type === "dynamic" ? "●" : e.physics.sensor ? "◌" : "·"}</i>
              )}
            </button>
          ))}
        </div>
        <div className="hierarchy-footer">
          <button disabled={playing} onClick={() => add("box")}>
            ＋ Object
          </button>
          <button disabled={playing || !chosen} onClick={duplicate}>
            Duplicate
          </button>
          <button disabled={playing || !chosen} onClick={remove}>
            Delete
          </button>
        </div>
      </aside>
      <main className="viewport">
        <div className="viewport-toolbar">
          <div>
            <span className="tab-active">{playing ? "Game" : "Scene"}</span>
            <span className="dim">{playing ? templateNames[scene.template] : "Perspective"}</span>
          </div>
          <div className="tools">
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
                {["↔", "↻", "⤢"][i]}
              </button>
            ))}
            <button
              disabled={!chosen || playing}
              onClick={() => selected && engine.current?.focus(selected)}
            >
              Frame
            </button>
            <button onClick={() => setInspector("render")}>☷ Render</button>
          </div>
        </div>
        <div className="canvas-wrap">
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
          {!playing && ready && (
            <div className="scene-caption">
              <div>THE LAST LIGHT COLLECTION</div>
              <h1>{scene.name}</h1>
              <p>A small world. A reusable foundation.</p>
              <button onClick={() => void run()}>▶ Explore in play mode</button>
            </div>
          )}
          {playing && (
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
                  <button onClick={() => engine.current?.spawnBox()}>＋ Spawn crate</button>
                  <button onClick={() => engine.current?.impulse()}>↑ Apply impulse</button>
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
                  <span>⬡</span>
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
                  <h3>⌖ Transform</h3>
                  {vector("position")}
                  {vector("rotation")}
                  {vector("scale")}
                  <small className="hint">
                    Rotation in degrees. Commit a numeric edit with Enter or by leaving the field.
                  </small>
                </section>
                {chosen.mesh && (
                  <section>
                    <h3>⬡ Mesh renderer</h3>
                    <label className="row-field">
                      Geometry <span>{chosen.mesh.primitive}</span>
                    </label>
                    <label className="row-field">
                      Albedo
                      <input
                        aria-label="Material color"
                        type="color"
                        defaultValue={chosen.mesh.color}
                        disabled={playing}
                        onBlur={(e) =>
                          patchEntity((item) => {
                            if (item.mesh) item.mesh.color = e.target.value;
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
                  <h3>◉ Physics body</h3>
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
                        ＋ Add rigid body
                      </button>
                    </>
                  )}
                </section>
                <section>
                  <h3>⌘ Behavior</h3>
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
                    Typed behaviors run only in Play. Custom behavior modules register through the
                    runtime API.
                  </small>
                </section>
                {chosen.light && (
                  <section>
                    <h3>☀ Light</h3>
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
                      <input
                        aria-label="Light color"
                        type="color"
                        defaultValue={chosen.light.color}
                        disabled={playing}
                        onBlur={(event) =>
                          patchEntity((e) => {
                            if (e.light) e.light.color = event.target.value;
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
                  ↧ Export selected prefab
                </button>
              </>
            ) : (
              <div className="empty-inspector">
                <span>⌖</span>
                <h3>A place for every detail.</h3>
                <p>Select an object in the scene or hierarchy to inspect its components.</p>
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
          <div>
            {(["assets", "console", "guide"] as const).map((t) => (
              <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {t === "assets"
                  ? "◫ Asset library"
                  : t === "console"
                    ? `›_ Console (${logs.length})`
                    : "⌘ Quick start"}
              </button>
            ))}
          </div>
          <div>
            {tab === "assets" ? (
              <>
                <button disabled={playing} onClick={() => glb.current?.click()}>
                  ↥ Import GLB
                </button>
                <button disabled={playing} onClick={() => prefabFile.current?.click()}>
                  ↥ Import prefab
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
        {tab === "assets" ? (
          <div className="asset-content">
            <div className="asset-folders">
              <span className="active">▾ Built-in library</span>
              <span>　Primitives</span>
              <span>　Game templates</span>
              <span>　Embedded assets ({scene.assets.length})</span>
            </div>
            <div className="asset-grid">
              {(["box", "sphere", "capsule", "cylinder", "cone"] as const).map((p, i) => (
                <button className="asset-card" disabled={playing} key={p} onClick={() => add(p)}>
                  <span className={"asset-icon shape-" + p}>{["⬡", "●", "◉", "▥", "▲"][i]}</span>
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
                <span className="asset-icon">☀</span>
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
                  <span className="asset-icon">◇</span>
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
                <span>{e.message}</span>
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
      <input ref={file} hidden type="file" accept=".json" onChange={(e) => void loadScene(e)} />
      <input ref={glb} hidden type="file" accept=".glb" onChange={(e) => void importGlb(e)} />
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
