import { ShaderFiles } from "./shader-files";
import type { ShaderSource } from "../../runtime/src/shader-definition";
import { useEffect, useRef, useState } from "react";
import { Button, Dialog, Select, Input } from "./ui";
import type { SceneDocument } from "../../runtime/src/schema";
import { folderLayout } from "../../project/src/folder-format";
import { FolderSession, type FolderSnapshot } from "../../project/src/folder-session";
import type {
  ExternalEditorKind,
  FolderRecent,
  RepackStatus,
  RepackSettings,
  DiskProjectGrant,
} from "../../project/src/disk-api";
export function ProjectFilesDialog({
  scene,
  session,
  onSession,
  onRepackShortcut,
  onApply,
  onClose,
  onCreateScript,
  onCreateShader,
  preferredFile,
  pending,
  onValidate,
  onPending,
  browserShader,
}: {
  browserShader?: {
    id: string;
    initial?: ShaderSource;
    trusted: boolean;
    onApply: (source: ShaderSource, signal: AbortSignal) => Promise<void>;
    onExport: (name: string, text: string) => Promise<void>;
  };
  scene: SceneDocument;
  session: FolderSession | null;
  onSession: (session: FolderSession) => void;
  onRepackShortcut: (shortcut: string) => void;
  onApply: (snapshot: FolderSnapshot) => Promise<void>;
  onClose: () => void;
  onCreateScript: () => void;
  onCreateShader?: () => void;
  preferredFile?: string;
  pending: FolderSnapshot | null;
  onValidate: () => Promise<void>;
  onPending: (snapshot: FolderSnapshot | null) => void;
}) {
  const api = window.engineDesktop?.workspace;
  const [selected, setSelected] = useState(preferredFile ?? "scene.json");
  const [filter, setFilter] = useState("");
  const [registrationName, setRegistrationName] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [editor, setEditor] = useState<ExternalEditorKind>("system");
  const [recents, setRecents] = useState<FolderRecent[]>([]);
  const [backup, setBackup] = useState<RepackStatus>();
  const [shortcut, setShortcut] = useState("Mod+Shift+S");
  const [interval, setIntervalValue] = useState(120);
  const [mode, setMode] = useState<RepackSettings["mode"]>("manual");
  const [inventory, setInventory] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    void api
      ?.recents()
      .then((r) => {
        if (active) setRecents(r);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, session]);
  useEffect(() => {
    if (!api || !session) return;
    let active = true;
    void api
      .inventory(session.grant.id)
      .then((r) => {
        if (active) setInventory(r.map((e) => e.path));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, session, pending]);
  useEffect(() => {
    if (!api || !session) return;
    let active = true;
    const refresh = () =>
      void api
        .repackStatus(session.grant.id)
        .then((v) => {
          if (active) setBackup(v);
        })
        .catch(() => {});
    void api
      .repackStatus(session.grant.id)
      .then((v) => {
        if (active) {
          setMode(v.settings.mode);
          setShortcut(v.settings.shortcut);
          setIntervalValue(v.settings.intervalSeconds);
        }
      })
      .catch(() => {});
    refresh();
    const timer = globalThis.setInterval(refresh, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, session]);
  const adoptGrant = async (grant: DiskProjectGrant | null) => {
    if (!grant || !api) return;
    if (!mounted.current) {
      await api.close(grant.id).catch(() => {});
      return;
    }
    const next = new FolderSession(api, grant);
    onSession(next);
    onPending(null);
    const snapshot = await next.read();
    next.layout = await folderLayout(snapshot.scene, snapshot.paths);
    onPending(snapshot);
    setMessage(
      "Disk folder validated; explicit Apply is still required. Invalid drafts remain on disk.",
    );
  };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    void api
      ?.editor()
      .then((e) => setEditor(e.kind))
      .catch((e) => setMessage(String(e)));
  }, [api]);
  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      if (mounted.current) setMessage(String(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const files = [
    ...new Set([
      ...(session?.layout?.files.keys() ?? []),
      ...(session?.grant.entries.map((e) => e.path) ?? []),
      ...inventory,
    ]),
  ]
    .filter(
      (path) =>
        /\.(ts|glsl|json|md|txt)$/.test(path) && path.toLowerCase().includes(filter.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(!session?.layout?.files.has(a)) - Number(!session?.layout?.files.has(b)) ||
        a.localeCompare(b),
    );
  return (
    <Dialog
      title="Project files & external tools"
      className="pf-shader-dialog"
      description="Edit code and metadata in your own editor. Changed files are validated without executing them; applying is explicit."
      onClose={onClose}
    >
      {!api ? (
        <>
          <p role="status">
            Native folder watching and editor launching require the desktop application. Use
            exported files and import them back in browser mode; this is not an externally editable
            disk project.
          </p>
          {browserShader ? (
            <ShaderFiles key={browserShader.id} {...browserShader} />
          ) : (
            <p>Select a mesh in the Inspector to import shader files.</p>
          )}
        </>
      ) : (
        <>
          <p>
            {session
              ? session.grant.root
              : "Choose an empty folder to put this project on disk, or an existing Pinefall project folder to validate it."}
          </p>
          <div className="script-toolbar">
            <Button
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const grant = await api.choose();
                  if (!grant) return;
                  const next = new FolderSession(api, grant);
                  if (grant.entries.some((e) => e.path === "project.json")) {
                    onSession(next);
                    onPending(null);
                    const snapshot = await next.read();
                    next.layout = await folderLayout(snapshot.scene, snapshot.paths);
                    onPending(snapshot);
                  } else {
                    if (grant.entries.length)
                      throw Error(
                        "Select an empty directory; existing unrelated files will not be overwritten.",
                      );
                    await next.save(scene);
                    onSession(next);
                  }
                  setMessage("Project folder ready. Files remain on disk.");
                })
              }
            >
              Choose project folder…
            </Button>
            <Button
              disabled={!session || busy}
              onClick={() =>
                void perform(async () => {
                  await session!.save(scene);
                  setMessage("Project files saved; pending external edits were not overwritten.");
                })
              }
            >
              Save project files
            </Button>
            <Button
              disabled={!session || busy}
              onClick={() => void perform(() => api.reveal(session!.grant.id))}
            >
              Open folder
            </Button>
          </div>
          <details>
            <summary>Folder archives, repacking and recent folders</summary>
            <p>
              Raw PIF8 backups preserve invalid and unregistered files. Hidden files and
              node_modules are excluded. Save archives outside the working folder. Older PIF files
              use the existing Open project action.
            </p>
            <Button
              disabled={busy}
              onClick={() => void perform(async () => adoptGrant(await api.openFolderArchive()))}
            >
              Open project PIF…
            </Button>
            {recents.map((record) => (
              <Button
                key={record.id}
                disabled={busy}
                onClick={() => void perform(async () => adoptGrant(await api.reopen(record.id)))}
              >
                Open folder: {record.root}
              </Button>
            ))}
            {session && (
              <>
                <label>
                  Repack mode
                  <Select
                    aria-label="Repack mode"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as RepackSettings["mode"])}
                  >
                    <option value="manual">Manual</option>
                    <option value="interval">Interval</option>
                    <option value="per-action">After changes settle</option>
                  </Select>
                </label>
                <label>
                  Interval seconds
                  <Input
                    aria-label="Repack interval seconds"
                    type="number"
                    min={10}
                    max={86400}
                    value={interval}
                    onChange={(e) => setIntervalValue(Number(e.target.value))}
                  />
                </label>
                <label>
                  Repack shortcut
                  <Input
                    aria-label="Repack shortcut"
                    value={shortcut}
                    onChange={(e) => setShortcut(e.target.value)}
                  />
                </label>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      setBackup(
                        await api.configureRepack(session.grant.id, {
                          mode,
                          intervalSeconds: interval,
                          shortcut,
                        }),
                      );
                      onRepackShortcut(shortcut);
                      setMessage(
                        "Repack settings saved. Choose a backup destination to enable automatic repacking.",
                      );
                    })
                  }
                >
                  Save repack settings
                </Button>
                <Button
                  disabled={busy || backup?.busy}
                  onClick={() =>
                    void perform(async () => {
                      setBackup(await api.repack(session.grant.id));
                    })
                  }
                >
                  Repack raw folder now
                </Button>
                <Button
                  disabled={busy || backup?.busy}
                  onClick={() =>
                    void perform(async () => {
                      setBackup(await api.repack(session.grant.id, true));
                    })
                  }
                >
                  Choose PIF destination…
                </Button>
                <Button disabled={!backup?.busy} onClick={() => void api.cancelArchive()}>
                  Cancel archive operation
                </Button>
                <p role="status">
                  {backup?.busy
                    ? "Archive operation running…"
                    : (backup?.error ??
                      (backup?.lastSuccess
                        ? "Last backup: " + new Date(backup.lastSuccess).toLocaleString()
                        : "No backup completed this session"))}
                  {backup?.archive ? " · " + backup.archive : ""}
                </p>
              </>
            )}
          </details>
          <label>
            External editor
            <Select
              aria-label="External editor"
              value={editor}
              disabled={busy}
              onChange={(e) =>
                void perform(async () => {
                  const preference = await api.configureEditor(
                    e.target.value as ExternalEditorKind,
                  );
                  setEditor(preference.kind);
                })
              }
            >
              <option value="system">System file association</option>
              <option value="vscode">Visual Studio Code</option>
              <option value="vscodium">VSCodium</option>
              <option value="visual-studio">Visual Studio</option>
              <option value="text-editor">Other text editor</option>
            </Select>
          </label>
          <label>
            Find a file
            <Input
              aria-label="Filter project files"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <label>
            Project file
            <Select
              aria-label="Project source file"
              data-validated-hash={pending?.hashes[selected] ?? ""}
              value={files.includes(selected) ? selected : ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select a file…</option>
              {files.slice(0, 200).map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </Select>
          </label>
          <details>
            <summary>Register existing authored source</summary>
            <p>
              Register a selected TypeScript module, GLSL fragment, shader metadata JSON, or
              material JSON. Existing files stay in place. Uniform JSON is linked through shader
              metadata, not registered alone. Registration updates the disk catalog only: validation
              and Apply remain explicit; no code is executed.
            </p>
            <label>
              Module / new shader name
              <Input
                aria-label="Registered source name"
                value={registrationName}
                placeholder={selected.split("/").at(-1) ?? ""}
                onChange={(event) => setRegistrationName(event.target.value)}
              />
            </label>
            <Button
              disabled={
                !session ||
                busy ||
                !files.includes(selected) ||
                selected.endsWith(".d.ts") ||
                !/\.(ts|glsl|json)$/.test(selected)
              }
              onClick={() =>
                void perform(async () => {
                  const owned = session!;
                  onPending(null);
                  await api.registerSource(
                    owned.grant.id,
                    selected,
                    registrationName.trim() || selected.split("/").at(-1)!,
                  );
                  if (!mounted.current) return;
                  // The root watcher owns validation; a parallel read would supersede its
                  // semantic job and could present an older snapshot as the newest result.
                  setMessage(
                    "Source registered on disk. Review diagnostics, then Apply explicitly. Raw source was not overwritten.",
                  );
                })
              }
            >
              Register selected source
            </Button>
          </details>
          <div className="script-toolbar">
            <Button
              disabled={!session || !files.includes(selected) || busy}
              onClick={() => void perform(() => api.openExternal(session!.grant.id, selected))}
            >
              Open externally
            </Button>
            <Button
              disabled={!session || busy}
              onClick={() =>
                void perform(async () => {
                  setMessage(await api.installIdeKit(session!.grant.id));
                })
              }
            >
              Install / refresh IDE typings
            </Button>
            <Button disabled={!session || busy} onClick={onCreateScript}>
              New TypeScript file
            </Button>
            {onCreateShader && (
              <Button disabled={!session || busy} onClick={onCreateShader}>
                Create shader files for selection
              </Button>
            )}
            <Button disabled={!session || busy} onClick={() => void perform(onValidate)}>
              Validate disk changes
            </Button>
          </div>
          <p>
            TypeScript syntax and semantic diagnostics use the typed SDK. GLSL driver validation
            requires explicit shader trust and Apply. Opening an external editor does not grant code
            execution permission.
          </p>
          {pending && (
            <section aria-label="Disk validation results">
              <strong>
                {pending.diagnostics.length
                  ? "Resolve source errors before Apply"
                  : "Schema and TypeScript checked — pending explicit Apply"}
              </strong>
              {pending.diagnostics.map((d, i) => (
                <div key={i}>
                  <Button
                    onClick={() =>
                      void perform(() =>
                        api.openExternal(session!.grant.id, d.file, d.line ?? 1, d.column ?? 1),
                      )
                    }
                  >
                    {d.file}:{d.line ?? 1}:{d.column ?? 1}
                  </Button>
                  <pre role="alert">
                    {d.code ? `TS${d.code}: ` : ""}
                    {d.message}
                  </pre>
                </div>
              ))}
            </section>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
      <footer>
        <Button onClick={onClose}>Close</Button>
        {api && (
          <Button
            variant="primary"
            disabled={!pending || !!pending.diagnostics.length || busy}
            onClick={() =>
              void perform(async () => {
                await onApply(pending!);
                setMessage("Validated files applied. Scripts still require trust before Play.");
              })
            }
          >
            Apply validated changes
          </Button>
        )}
      </footer>
    </Dialog>
  );
}
