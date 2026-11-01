import { Button, Input, useConfirm } from "./ui";
import { useState, useEffect, useRef } from "react";
import type { SceneDocument } from "../../runtime/src/schema";
import { Icon } from "./icons";
import { parentOf, descendants, moveNodes, deleteNodes, duplicateNodes } from "./hierarchy-model";
interface Props {
  scene: SceneDocument;
  selected: string | null;
  onSelect: (id: string | null) => void;
  commit: (fn: (s: SceneDocument) => void) => void;
  disabled: boolean;
  focus: (id: string) => void;
  add: () => void;
  notify: (message: string) => void;
}
export function Hierarchy({
  scene,
  selected,
  onSelect,
  commit,
  disabled,
  focus,
  add,
  notify,
}: Props) {
  const confirm = useConfirm();
  const storageKey = "pinefall.tree.v1:" + scene.name;
  function savedTree() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      return {};
    }
  }
  const anchor = useRef<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
      const saved = savedTree().collapsed;
      return new Set(
        Array.isArray(saved) ? saved.filter((s) => typeof s === "string").slice(0, 600) : [],
      );
    }),
    [selection, setSelection] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [dragOver, setDragOver] = useState<string | null>(null),
    [renaming, setRenaming] = useState<string | null>(null),
    [rootCollapsed, setRootCollapsed] = useState(() => savedTree().root === true);
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ collapsed: [...collapsed], root: rootCollapsed }),
      );
    } catch {}
  }, [storageKey, collapsed, rootCollapsed]);
  const nodes = [
    ...(scene.collections || []).map((c) => ({ ...c, folder: true })),
    ...scene.entities.map((e) => ({ ...e, folder: false })),
  ];
  const selectedIds = selection.includes(selected || "")
    ? selection.filter((id) => nodes.some((n) => n.id === id))
    : selected
      ? [selected]
      : [];
  const matches = new Set<string>();
  for (const n of nodes)
    if (n.name.toLowerCase().includes(search.toLowerCase())) {
      matches.add(n.id);
      let p = parentOf(scene, n.id);
      while (p) {
        matches.add(p);
        p = parentOf(scene, p);
      }
    }
  const rows: Array<{ id: string; depth: number }> = [];
  function walk(parent: string | undefined, depth: number) {
    for (const n of nodes.filter((n) => parentOf(scene, n.id) === parent)) {
      if (search && !matches.has(n.id)) continue;
      rows.push({ id: n.id, depth });
      if (search || !collapsed.has(n.id)) walk(n.id, depth + 1);
    }
  }
  if (!rootCollapsed || search) walk(undefined, 0);
  const choose = (id: string, multi = false, range = false) => {
    let ids = [id];
    if (range && (anchor.current || selected)) {
      const a = rows.findIndex((r) => r.id === (anchor.current || selected)),
        b = rows.findIndex((r) => r.id === id);
      if (a >= 0) ids = rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.id);
    } else if (multi)
      ids = selectedIds.includes(id) ? selectedIds.filter((v) => v !== id) : [...selectedIds, id];
    if (!range) anchor.current = id;
    setSelection(ids);
    onSelect(ids.at(-1) || null);
  };
  function toggle(id: string) {
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function move(ids: string[], target: string | null) {
    if (disabled) return;
    try {
      const test = structuredClone(scene);
      moveNodes(test, ids, target);
      commit((s) => moveNodes(s, ids, target));
      if (target)
        setCollapsed((old) => {
          const n = new Set(old);
          n.delete(target);
          return n;
        });
      setRootCollapsed(false);
      notify(
        target ? "Moved selection; world transforms preserved" : "Moved selection to scene root",
      );
    } catch (e) {
      notify(String(e));
    }
    setDragOver(null);
  }
  function group() {
    const id = crypto.randomUUID();
    commit((s) => {
      s.collections ??= [];
      s.collections.push({ id, name: "New collection" });
      moveNodes(s, selectedIds, id);
    });
    setSelection([id]);
    onSelect(id);
    setRenaming(id);
    setRootCollapsed(false);
  }
  async function remove() {
    if (!selectedIds.length) return;
    const count = descendants(scene, selectedIds).size;
    if (
      count > 1 &&
      !(await confirm(`Delete ${count} items, including descendants? Undo can restore them.`))
    )
      return;
    commit((s) => deleteNodes(s, selectedIds));
    setSelection([]);
    onSelect(null);
  }
  function duplicate() {
    let ids: string[] = [];
    commit((s) => {
      ids = duplicateNodes(s, selectedIds);
    });
    setSelection(ids);
    onSelect(ids.at(-1) || null);
  }
  function drop(event: React.DragEvent, target: string | null) {
    event.preventDefault();
    event.stopPropagation();
    try {
      const ids: unknown = JSON.parse(
        event.dataTransfer.getData("application/x-pinefall-entities"),
      );
      if (
        Array.isArray(ids) &&
        ids.every((id) => typeof id === "string" && nodes.some((n) => n.id === id))
      )
        move(ids, target);
    } catch {
      notify("Drop scene objects from the hierarchy.");
    }
  }
  return (
    <aside className="hierarchy">
      <div className="panel-title">
        <span>
          <Icon name="tree" /> SCENE HIERARCHY
        </span>
        <span>{scene.entities.length}</span>
      </div>
      <Input
        className="search"
        aria-label="Search entities"
        placeholder="Find objects and collections…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setRootCollapsed(false);
        }}
      />
      <div className="tree-tools">
        <Button
          title="New collection / group selection (Ctrl+G)"
          aria-label="New collection"
          disabled={disabled}
          onClick={group}
        >
          <Icon name="folder" />
          <Icon name="plus" size={11} />
        </Button>
        <Button
          title="Expand all"
          aria-label="Expand all"
          onClick={() => {
            setCollapsed(new Set());
            setRootCollapsed(false);
          }}
        >
          <Icon name="maximize" />
        </Button>
        <Button
          title="Collapse all"
          aria-label="Collapse all"
          onClick={() => setCollapsed(new Set(nodes.map((n) => n.id)))}
        >
          <Icon name="minimize" />
        </Button>
        <span>{selectedIds.length} selected</span>
      </div>
      <div
        className={"scene-root " + (dragOver === "root" ? "drop-target" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver("root");
        }}
        onDrop={(e) => drop(e, null)}
      >
        <Button
          aria-label={rootCollapsed ? "Expand scene" : "Collapse scene"}
          onClick={() => setRootCollapsed(!rootCollapsed)}
        >
          <Icon name={rootCollapsed ? "right" : "down"} />
        </Button>
        <Icon name="stack" />
        <span>{scene.name}</span>
        <Button
          aria-label="Move selection to root"
          title="Move selection to root"
          disabled={disabled || !selectedIds.length}
          onClick={() => move(selectedIds, null)}
        >
          <Icon name="unlink" />
        </Button>
      </div>
      <div
        className="entity-list"
        role="tree"
        aria-label="Scene objects"
        aria-multiselectable="true"
        onKeyDown={(event) => {
          if (event.target instanceof HTMLInputElement) return;
          const i = rows.findIndex((r) => r.id === selected);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const next =
              rows[
                Math.max(0, Math.min(rows.length - 1, i + (event.key === "ArrowDown" ? 1 : -1)))
              ];
            if (next) {
              choose(next.id, false, event.shiftKey);
              document.getElementById("tree-" + next.id)?.focus();
            }
          } else if (event.key === "ArrowRight" && selected) {
            event.preventDefault();
            setCollapsed((old) => {
              const n = new Set(old);
              n.delete(selected);
              return n;
            });
          } else if (event.key === "ArrowLeft" && selected) {
            event.preventDefault();
            if (nodes.some((n) => parentOf(scene, n.id) === selected) && !collapsed.has(selected))
              toggle(selected);
            else {
              const p = parentOf(scene, selected);
              if (p) {
                choose(p);
                document.getElementById("tree-" + p)?.focus();
              }
            }
          } else if (event.key === "Enter" && selected) {
            event.preventDefault();
            const n = nodes.find((n) => n.id === selected);
            if (n?.folder) toggle(selected);
            else focus(selected);
          } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
            event.preventDefault();
            const ids = rows.map((r) => r.id);
            setSelection(ids);
            onSelect(ids.at(-1) || null);
          } else if (!disabled && event.key === "F2" && selected) {
            event.preventDefault();
            setRenaming(selected);
          } else if (!disabled && event.key === "Delete") {
            event.preventDefault();
            remove();
          } else if (
            !disabled &&
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "g"
          ) {
            event.preventDefault();
            group();
          } else if (
            !disabled &&
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "d"
          ) {
            event.preventDefault();
            duplicate();
          } else if (event.key.toLowerCase() === "f" && selected) {
            event.preventDefault();
            focus(selected);
          }
        }}
      >
        {rows.map(({ id, depth }) => {
          const node = nodes.find((n) => n.id === id)!,
            e = scene.entities.find((e) => e.id === id),
            hasChildren = nodes.some((n) => parentOf(scene, n.id) === id),
            open = search || !collapsed.has(id);
          return (
            <div
              title={node.name}
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={selectedIds.includes(id)}
              aria-expanded={hasChildren ? !!open : undefined}
              tabIndex={selected === id || (!selected && rows[0]?.id === id) ? 0 : -1}
              id={"tree-" + id}
              key={id}
              className={
                "entity-row " +
                (selectedIds.includes(id) ? "selected " : "") +
                (dragOver === id ? "drop-target" : "")
              }
              style={{ paddingLeft: 8 + depth * 16, opacity: e?.enabled === false ? 0.48 : 1 }}
              draggable={!disabled && !renaming}
              onDragStart={(event) => {
                const ids = selectedIds.includes(id) ? selectedIds : [id];
                event.dataTransfer.setData("application/x-pinefall-entities", JSON.stringify(ids));
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDragOver(null)}
              onDragOver={(event) => {
                if (disabled) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOver(id);
              }}
              onDrop={(event) => drop(event, id)}
              onClick={(event) => choose(id, event.ctrlKey || event.metaKey, event.shiftKey)}
              onDoubleClick={() => (node.folder ? toggle(id) : focus(id))}
            >
              <Button
                className="tree-caret"
                tabIndex={-1}
                aria-label={(open ? "Collapse " : "Expand ") + node.name}
                style={{ visibility: hasChildren ? "visible" : "hidden" }}
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(id);
                }}
              >
                <Icon name={open ? "down" : "right"} size={12} />
              </Button>
              <Icon
                name={
                  node.folder
                    ? open
                      ? "folderOpen"
                      : "folder"
                    : e?.light
                      ? "light"
                      : e?.tag === "player"
                        ? "player"
                        : e?.physics?.sensor
                          ? "sensor"
                          : "cube"
                }
                size={14}
              />
              {renaming === id ? (
                <Input
                  autoFocus
                  aria-label="Rename item"
                  defaultValue={node.name}
                  maxLength={100}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (name)
                      commit((s) => {
                        const n =
                          s.entities.find((e) => e.id === id) ||
                          s.collections?.find((c) => c.id === id);
                        if (n) n.name = name;
                      });
                    setRenaming(null);
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <span className="tree-name">{node.name}</span>
              )}
              {hasChildren && (
                <small className="tree-count">
                  {nodes.filter((n) => parentOf(scene, n.id) === id).length}
                </small>
              )}
              {!disabled && (
                <Button
                  className="tree-hover"
                  title="Rename (F2)"
                  aria-label={"Rename " + node.name}
                  onClick={(event) => {
                    event.stopPropagation();
                    setRenaming(id);
                  }}
                >
                  <Icon name="rename" size={12} />
                </Button>
              )}
              {e && (
                <Button
                  className="tree-hover"
                  disabled={disabled}
                  aria-label={(e.enabled ? "Hide " : "Show ") + node.name}
                  onClick={(event) => {
                    event.stopPropagation();
                    commit((s) => {
                      const target = s.entities.find((e) => e.id === id);
                      if (target) target.enabled = !target.enabled;
                    });
                  }}
                >
                  <Icon name={e.enabled ? "eye" : "eyeOff"} size={13} />
                </Button>
              )}
            </div>
          );
        })}
        {!rows.length && (
          <div className="tree-empty">
            {search ? "No matching objects" : "Expand the scene to see its objects."}
          </div>
        )}
      </div>
      <div className="hierarchy-footer">
        <Button disabled={disabled} onClick={add}>
          <Icon name="plus" /> Object
        </Button>
        <Button
          aria-label="Duplicate selection"
          title="Duplicate subtree (Ctrl+D)"
          disabled={disabled || !selectedIds.length}
          onClick={duplicate}
        >
          <Icon name="copy" />
        </Button>
        <Button
          aria-label="Delete selection"
          title="Delete selection and descendants"
          disabled={disabled || !selectedIds.length}
          onClick={remove}
        >
          <Icon name="trash" />
        </Button>
      </div>
      <p className="tree-hint">Drag to nest · Ctrl/⌘ multi-select · F to frame</p>
    </aside>
  );
}
