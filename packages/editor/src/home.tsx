import { FolderSession } from "../../project/src/folder-session";
import type { FolderRecent } from "../../project/src/disk-api";
import type { GraphicsPreferences, GraphicsState } from "./graphics";
import { ARCHIVE_BYTES } from "../../assets/src/limits";
/* oxlint-disable react/refs -- Event handler ref keeps keyboard routing current without reattaching listeners. */
import { CommandPalette } from "./command-palette";
import { dispatchShortcut, type EditorCommand } from "./commands";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Input, Select, Switch, Dialog, Panel, EmptyState } from "./ui";
import { Icon } from "./icons";
import { readPreferences, savePreferences, applyPreferences } from "./preferences";
import {
  listRecentProjects,
  openRecentProject,
  removeRecentProject,
  type RecentProject,
} from "./recent-projects";
import { createGame } from "../../project/src";
import { newProjectMetadata } from "../../project/src/metadata";
import { parseScene, type SceneDocument, type Template } from "../../runtime/src/schema";
import { createTemplate } from "../../../examples/templates";
import { projectJob } from "../../project/src/pif-client";
import { blobs } from "../../assets/src/blobs";
import { referenceScene, sceneReferences } from "../../assets/src/documents";
import { version } from "../../../package.json";
export const starters = [
  {
    id: "blank",
    name: "Blank game",
    description: "A clean world, ground and playable character.",
    icon: "plus",
  },
  {
    id: "adventure",
    name: "Adventure",
    description: "Third-person exploration and collectibles.",
    icon: "tree",
  },
  {
    id: "first-person",
    name: "First person",
    description: "An immersive starting point to explore.",
    icon: "crosshair",
  },
  {
    id: "driving",
    name: "Driving",
    description: "A vehicle, open roads and room to build.",
    icon: "move",
  },
  {
    id: "sandbox",
    name: "Physics sandbox",
    description: "Experiment with bodies and interactions.",
    icon: "cube",
  },
] as const;
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState(readPreferences),
    [error, setError] = useState("");
  const [graphics, setGraphics] = useState<GraphicsState>();
  const [draft, setDraft] = useState<GraphicsPreferences>();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    void window.engineDesktop
      ?.getGraphics()
      .then((state) => {
        if (alive) {
          setGraphics(state);
          setDraft(state.saved);
        }
      })
      .catch(() => {
        if (alive) setError("Desktop graphics settings could not be read.");
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Dialog
      title="Editor settings"
      description="Preferences for this device. Project graphics can be adjusted in the editor."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            if (draft && window.engineDesktop) await window.engineDesktop.saveGraphics(draft);
            savePreferences(value);
            onClose();
          } catch {
            setError(
              "Preferences could not be saved completely. Reopen Settings to verify saved values.",
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <label>
          Interface density
          <Select
            value={value.density}
            onChange={(e) =>
              setValue({ ...value, density: e.target.value as typeof value.density })
            }
          >
            <option value="comfortable">Comfortable — more breathing room</option>
            <option value="compact">Compact — more on screen</option>
          </Select>
        </label>
        <label>
          Default rendering profile
          <Select
            value={value.quality}
            onChange={(e) =>
              setValue({ ...value, quality: e.target.value as typeof value.quality })
            }
          >
            <option value="low">Low / legacy GPU</option>
            <option value="high">High / modern GPU</option>
          </Select>
        </label>
        <label className="pf-setting-row">
          <span>
            Reduce interface motion<small>Recommended for low-end devices.</small>
          </span>
          <Switch
            aria-label="Reduce interface motion"
            checked={value.reducedMotion}
            onChange={(e) => setValue({ ...value, reducedMotion: e.target.checked })}
          />
        </label>
        <fieldset disabled={saving || !draft}>
          <legend>Desktop rendering — applies next launch</legend>
          <label>
            Browser / UI compositing
            <Select
              aria-label="Browser / UI compositing"
              value={draft?.compositor ?? "default"}
              onChange={(e) =>
                draft &&
                setDraft({
                  ...draft,
                  compositor: e.target.value as GraphicsPreferences["compositor"],
                })
              }
            >
              <option value="default">Chromium default (hardware acceleration allowed)</option>
              <option value="software">Software compositing (keep 3D GPU available)</option>
            </Select>
          </label>
          <label>
            3D renderer
            <Select
              aria-label="3D renderer"
              value={draft?.renderer ?? "auto"}
              onChange={(e) =>
                draft &&
                setDraft({ ...draft, renderer: e.target.value as GraphicsPreferences["renderer"] })
              }
            >
              <option value="auto">Three.js / WebGL — automatic GPU selection</option>
              <option value="legacy-gl">Three.js / WebGL — legacy OpenGL (ANGLE)</option>
              <option value="software">CPU 3D — SwiftShader WebGL (slow)</option>
              <option value="vgpu" disabled>
                Vercel vgpu / WebGPU — engine adapter not implemented
              </option>
            </Select>
          </label>
        </fieldset>
        <small>
          {window.engineDesktop
            ? "Save your project, save these preferences, then close and reopen the app. CPU mode also requests software UI compositing; it retains real 3D and the existing UI. SwiftShader requires an explicit Chromium software-WebGL opt-in; Electron sandboxing remains enabled."
            : "A web page cannot change browser hardware acceleration or force a CPU adapter. Use the desktop app for these controls, or your browser’s own settings."}
        </small>
        <p>
          <small>
            R3F is a React wrapper for Three.js, not a GPU backend. This engine uses Three.js
            directly. The original game's vgpu renderer cannot yet render arbitrary engine scenes;
            it is not offered as a working switch.
          </small>
        </p>
        {graphics && (
          <details>
            <summary>Active graphics diagnostics</summary>
            <p>
              3D: {graphics.active.renderer} · UI: {graphics.active.compositor}
            </p>
            <p>
              Requested preferences are not proof of hardware acceleration. Chromium feature status:
            </p>
            <pre>{JSON.stringify(graphics.features, null, 2)}</pre>
          </details>
        )}
        {error && <p role="alert">{error}</p>}
        <footer>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            Save preferences
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
export function Home({
  onOpen,
  recovery,
  notice = "",
}: {
  onOpen: (scene: SceneDocument, folder?: FolderSession) => void | Promise<void>;
  recovery?: SceneDocument;
  notice?: string;
}) {
  const [section, setSection] = useState("projects"),
    [rows, setRows] = useState<RecentProject[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(notice),
    [query, setQuery] = useState(""),
    [settings, setSettings] = useState(false),
    [creating, setCreating] = useState<string>(),
    [name, setName] = useState("Untitled game"),
    [removing, setRemoving] = useState<RecentProject>();
  const [folders, setFolders] = useState<FolderRecent[]>([]);
  const folderOpening = useRef<FolderSession | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      folderOpening.current?.dispose();
    };
  }, []);
  const file = useRef<HTMLInputElement>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const commands: EditorCommand[] = [
    {
      id: "new",
      label: "New game",
      keys: ["Mod+N"],
      disabled: busy ? "Project operation in progress" : undefined,
      run: () => setCreating("blank"),
    },
    {
      id: "open",
      label: "Open project",
      keys: ["Mod+O"],
      disabled: busy ? "Project operation in progress" : undefined,
      run: () => file.current?.click(),
    },
    {
      id: "save",
      label: "Save PIF project",
      keys: ["Mod+S"],
      disabled: "Open a project before saving",
      run: () => {},
    },
    { id: "settings", label: "Editor settings", keys: ["Mod+,"], run: () => setSettings(true) },
    {
      id: "commands",
      allowTyping: true,
      label: "Commands and shortcuts",
      keys: ["Mod+Shift+P", "F1"],
      run: () => setPaletteOpen(true),
    },
    { id: "templates", label: "Game templates", keys: [], run: () => setSection("templates") },
    { id: "recents", label: "Recent projects", keys: [], run: () => setSection("projects") },
    {
      id: "marketplace",
      label: "Plugins marketplace",
      keys: [],
      disabled: "TODO — not implemented",
      run: () => {},
    },
  ];
  const shortcutRef = useRef<(event: KeyboardEvent) => void>(() => {});
  shortcutRef.current = (event) => dispatchShortcut(event, commands, setError);
  useLayoutEffect(() => {
    const listener = (event: KeyboardEvent) => shortcutRef.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const refresh = () =>
    listRecentProjects()
      .then(setRows)
      .catch((e) => setError("Local project storage unavailable: " + String(e)));
  useEffect(() => {
    applyPreferences(readPreferences());
    blobs.retain(recovery ? sceneReferences(recovery) : []);
    void refresh();
    void window.engineDesktop?.workspace
      .recents()
      .then(setFolders)
      .catch((error) => setError(String(error)));
  }, [recovery]);
  async function openFolder(id: string) {
    const api = window.engineDesktop?.workspace;
    if (!api || busy) return;
    setBusy(true);
    setError("");
    let adopted = false;
    let candidate: FolderSession | undefined;
    try {
      const grant = await api.reopen(id),
        session = new FolderSession(api, grant);
      if (!mounted.current) {
        session.dispose();
        throw Error("Home closed during folder opening");
      }
      candidate = session;
      folderOpening.current = session;
      const snapshot = await session.read();
      const layout = await session.accept(snapshot);
      session.adopt(snapshot, layout);
      // Opening is an explicit user action; scripts/shaders still start without trust.
      if (!mounted.current) throw Error("Home closed during folder validation");
      folderOpening.current = null;
      await onOpen(snapshot.scene, session);
      adopted = true;
    } catch (error) {
      setError("Folder not opened: " + String(error));
    } finally {
      if (!adopted) candidate?.dispose();
      folderOpening.current = null;
      setBusy(false);
    }
  }
  async function open(work: () => Promise<SceneDocument>) {
    setBusy(true);
    setError("");
    try {
      const scene = await work();
      scene.project ??= newProjectMetadata(scene.name);
      await onOpen(scene);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="pf-home">
      {paletteOpen && (
        <CommandPalette
          commands={commands.filter((command) => command.id !== "commands")}
          onClose={() => setPaletteOpen(false)}
          onError={setError}
        />
      )}
      <aside className="pf-home-sidebar">
        <div className="pf-home-brand">
          <img src="./pinefall-logo.svg" width="34" height="34" alt="" />
          <div>
            PINEFALL<small>GAME ENGINE</small>
          </div>
        </div>
        <span className="pf-eyebrow">WORKSPACE</span>
        <nav aria-label="Home navigation">
          {[
            ["projects", "Recent projects"],
            ["templates", "Game templates"],
            ["plugins", "Plugins marketplace"],
          ].map(([key, label]) => (
            <Button
              key={key}
              aria-current={section === key ? "page" : undefined}
              onClick={() => setSection(key)}
            >
              <Icon
                name={key === "projects" ? "folder" : key === "templates" ? "assets" : "stack"}
              />
              {label}
              {key === "plugins" && <span className="pf-tag">SOON</span>}
            </Button>
          ))}
        </nav>
        <div className="pf-home-sidebar-bottom">
          <Button variant="ghost" onClick={() => setPaletteOpen(true)}>
            Commands · F1
          </Button>
          <Button onClick={() => setSettings(true)}>
            <Icon name="settings" /> Editor settings
          </Button>
          <Button
            disabled={busy}
            onClick={() => void open(async () => recovery ?? createTemplate("adventure"))}
          >
            {recovery ? "Continue last workspace" : "Open demo editor"} <span>↗</span>
          </Button>
          <small>
            VERSION {version}
            <br />
            Local-first. Yours to build.
          </small>
        </div>
      </aside>
      <main className="pf-home-main">
        <header className="pf-home-top">
          <span>YOUR CREATIVE WORKSPACE</span>
          <span className="pf-local">
            <i /> All projects stay on this device
          </span>
        </header>
        <section className="pf-home-hero">
          <div>
            <span className="pf-eyebrow">WELCOME TO PINEFALL</span>
            <h1>
              Your next world
              <br />
              starts here<span>.</span>
            </h1>
            <p>
              Start small. Make something that’s entirely yours.
              <br />
              Create a blank game or find your footing with a template.
            </p>
            <div className="pf-home-actions">
              <Button
                variant="primary"
                size="lg"
                disabled={busy}
                onClick={() => {
                  setCreating("blank");
                  setName("Untitled game");
                }}
              >
                <Icon name="plus" /> New game
              </Button>
              <Button
                variant="secondary"
                size="lg"
                disabled={busy}
                onClick={() => file.current?.click()}
              >
                <Icon name="folderOpen" /> Open project
              </Button>
            </div>
          </div>
          <div className="pf-world-art" aria-hidden="true">
            <svg viewBox="0 0 320 240">
              <path d="M20 165 160 85 300 165 160 245Z" fill="#283d37" />
              <path d="M20 145 160 65 300 145 160 225Z" fill="#3e5c4c" />
              <path
                d="M160 65v160M20 145h280M90 105l140 80M230 105 90 185"
                stroke="#69856a"
                fill="none"
              />
              <path d="m118 121 42-24 42 24v48l-42 24-42-24Z" fill="#c2cfa0" />
              <path d="m118 121 42 24 42-24m-42 24v48" stroke="#667956" fill="none" />
              <path d="M62 130v-28m-19 8 19-39 19 39Z" fill="#86a283" stroke="#86a283" />
              <path d="M246 155v-35m-23 8 23-49 23 49Z" fill="#91ad8d" stroke="#91ad8d" />
            </svg>
            <span>A LITTLE SPACE. ENDLESS POSSIBILITY.</span>
          </div>
        </section>
        {error && (
          <div className="pf-notice" role="alert">
            {error}
            <Button size="sm" onClick={() => setError("")} aria-label="Dismiss notification">
              Dismiss
            </Button>
          </div>
        )}
        {busy && <p role="status">Opening and verifying project…</p>}
        {section === "plugins" ? (
          <Panel className="pf-marketplace">
            <span className="pf-tag">TODO · LATER</span>
            <h2>A place to extend your toolkit.</h2>
            <p>
              The plugins marketplace is planned for a future update. Browsing, installation and
              publishing are not available yet.
            </p>
            <Button disabled>Marketplace coming later</Button>
          </Panel>
        ) : (
          <>
            {section === "projects" && (
              <section className="pf-home-section">
                <header>
                  <div>
                    <h2>
                      {section === "projects" ? "Recent projects" : "Choose your starting point"}
                    </h2>
                    <p>
                      {section === "projects"
                        ? "Pick up where you left off."
                        : "Every template is a real, editable 3D project."}
                    </p>
                  </div>
                  {section === "projects" && (
                    <Input
                      type="search"
                      aria-label="Search recent projects"
                      placeholder="Search projects…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  )}
                </header>
                {section === "projects" && folders.length > 0 && (
                  <section aria-label="Recent working folders">
                    <h3>Working folders</h3>
                    <div className="pf-project-grid">
                      {folders
                        .filter((folder) => folder.root.toLowerCase().includes(query.toLowerCase()))
                        .map((folder) => (
                          <Panel key={folder.id} className="pf-project-card">
                            <Button
                              className="pf-project-open"
                              disabled={busy}
                              onClick={() => void openFolder(folder.id)}
                              aria-label={"Open working folder " + folder.root}
                            >
                              <h3>{folder.root.split(/[\\/]/).at(-1)}</h3>
                              <span>Open working folder ↗</span>
                            </Button>
                            <p>{folder.root}</p>
                            <small>
                              {new Date(folder.opened).toLocaleDateString()} · Disk source of truth
                            </small>
                          </Panel>
                        ))}
                    </div>
                  </section>
                )}
                {section === "projects" &&
                  (rows.length ? (
                    <div className="pf-project-grid">
                      {!rows.some((r) => r.name.toLowerCase().includes(query.toLowerCase())) && (
                        <EmptyState
                          title="No matching projects"
                          action={<Button onClick={() => setQuery("")}>Clear search</Button>}
                        >
                          Try another name or open a PIF file.
                        </EmptyState>
                      )}
                      {rows
                        .filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
                        .map((row) => (
                          <Panel key={row.id} className="pf-project-card">
                            <div className="pf-project-monogram" aria-hidden="true">
                              {row.name.slice(0, 1).toUpperCase()}
                            </div>
                            <Button
                              className="pf-project-open"
                              disabled={busy}
                              onClick={() => void open(() => openRecentProject(row.id))}
                            >
                              <h3>{row.name}</h3>
                              <span>Open project ↗</span>
                            </Button>
                            <p>{new Date(row.updated).toLocaleDateString()} · Local snapshot</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={"Remove recent " + row.name}
                              onClick={() => setRemoving(row)}
                            >
                              Remove from recents
                            </Button>
                          </Panel>
                        ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="A fresh start awaits"
                      action={
                        <Button onClick={() => setCreating("blank")}>
                          Create your first game →
                        </Button>
                      }
                    >
                      Create or open a project to see it here. Snapshots update on PIF save and when
                      returning home.
                    </EmptyState>
                  ))}
              </section>
            )}
            <section className="pf-home-section">
              <header>
                <div>
                  <h2>{section === "projects" ? "Start with a template" : "Game templates"}</h2>
                  <p>A foundation, not a limitation.</p>
                </div>
                <span className="pf-tag">5 STARTING POINTS</span>
              </header>
              <div className="pf-template-grid">
                {starters.map((starter, i) => (
                  <Button
                    className="pf-template-card"
                    key={starter.id}
                    disabled={busy}
                    onClick={() => {
                      setCreating(starter.id);
                      setName(starter.id === "blank" ? "Untitled game" : starter.name + " game");
                    }}
                  >
                    <span className={"pf-template-preview preview-" + i} aria-hidden="true">
                      <Icon
                        name={
                          starter.id === "blank"
                            ? "plus"
                            : starter.id === "adventure"
                              ? "tree"
                              : starter.id === "first-person"
                                ? "focus"
                                : starter.id === "driving"
                                  ? "move"
                                  : "cube"
                        }
                        size={34}
                      />
                      <span>0{i + 1}</span>
                    </span>
                    <strong>
                      {starter.name} <span>↗</span>
                    </strong>
                    <small>{starter.description}</small>
                  </Button>
                ))}
              </div>
            </section>
          </>
        )}
        <footer className="pf-home-footer">
          Local snapshots are not backups. Save a portable .pif to keep your work safe.
          <span>3D ONLY · BUILT TO BE YOURS</span>
        </footer>
      </main>
      <Input
        ref={file}
        hidden
        type="file"
        accept=".pif,.json"
        aria-label="Open project file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f)
            void open(async () => {
              if (f.size > ARCHIVE_BYTES) throw Error("Project exceeds 512 MiB limit");
              return f.name.toLowerCase().endsWith(".pif")
                ? projectJob("unpack", new Uint8Array(await f.arrayBuffer()))
                : referenceScene(parseScene(JSON.parse(await f.text())));
            });
        }}
      />
      {settings && <SettingsDialog onClose={() => setSettings(false)} />}
      {creating && (
        <Dialog
          title="New game"
          description="Choose a name and a starting point. Everything can be changed later."
          onClose={() => setCreating(undefined)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const next =
                creating === "blank"
                  ? createGame(name.trim())
                  : createTemplate(creating as Template);
              next.name = name.trim();
              next.project = newProjectMetadata(next.name);
              void open(async () => referenceScene(parseScene(next)));
            }}
          >
            <label>
              Game name
              <Input
                autoFocus
                required
                maxLength={100}
                aria-label="Game name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Starting scene
              <Select
                aria-label="Starting scene"
                value={creating}
                onChange={(e) => setCreating(e.target.value)}
              >
                {starters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
            <p className="pf-muted">
              Blank game includes only a ground plane and a playable character. Templates include a
              complete starter scene.
            </p>
            <footer>
              <Button onClick={() => setCreating(undefined)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
                Create game
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
      {removing && (
        <Dialog
          title="Remove recent project?"
          description="This deletes the local recent snapshot, not any exported PIF file. Save a backup first."
          onClose={() => setRemoving(undefined)}
        >
          <p>{removing.name}</p>
          <footer>
            <Button onClick={() => setRemoving(undefined)}>Keep project</Button>
            <Button
              variant="danger"
              onClick={() => {
                void removeRecentProject(removing.id)
                  .then(() => {
                    setRemoving(undefined);
                    return refresh();
                  })
                  .catch((e) => setError(String(e)));
              }}
            >
              Remove snapshot
            </Button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
