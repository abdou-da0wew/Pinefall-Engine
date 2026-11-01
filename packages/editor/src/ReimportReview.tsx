import { Panel, Dialog } from "./ui";
import { Button, Input, Select } from "./ui";
import { useState } from "react";
import type { AssetImport } from "../../assets/src/record";
import { reconcileSubassets } from "../../assets/src/record";
export function ReimportReview({
  previous,
  incoming,
  affected,
  finish,
}: {
  previous?: AssetImport;
  incoming: AssetImport;
  affected: number;
  finish: (mapping: Record<string, string> | undefined) => void;
}) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [entries] = useState(() => reconcileSubassets(incoming.report, previous));
  const [mapping, setMapping] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      entries.map((e) => [
        e.kind + ":" + e.key,
        previous?.subassets.some((old) => old.id === e.id) ? e.id : "",
      ]),
    ),
  );
  const candidates = (kind: string, key: string) => {
    const selected = mapping[kind + ":" + key],
      old = previous?.subassets || [];
    return [
      ...old.filter((s) => s.id === selected),
      ...old
        .filter(
          (s) =>
            s.kind === kind &&
            s.id !== selected &&
            (s.key + " " + s.id).toLowerCase().includes(search.toLowerCase()),
        )
        .slice(0, 49),
    ];
  };
  const ids = Object.values(mapping).filter(Boolean),
    duplicate = new Set(ids).size !== ids.length;
  const removed = previous?.subassets.filter((e) => !ids.includes(e.id)) || [];
  return (
    <Dialog
      title="Review reimport"
      className="pf-reimport-dialog"
      onClose={() => finish(undefined)}
    >
      <Panel
        style={{
          background: "#20262b",
          padding: 24,
          width: "100%",
          maxHeight: "85vh",
          overflow: "auto",
        }}
      >
        <p>
          Entity transforms and model ID stay unchanged. Explicitly map renamed or ambiguous nodes,
          meshes, skeletons, materials and clips; nothing is matched by array order.
        </p>
        <p>
          Nodes: {previous?.report.nodes ?? "—"} → {incoming.report.nodes} · Vertices:{" "}
          {previous?.report.vertices ?? "—"} → {incoming.report.vertices}
        </p>
        <p>{affected} placed model consumers have changed cooked output.</p>
        <p>
          Artifact: {previous?.artifactHash === incoming.artifactHash ? "unchanged" : "changed"} ·
          Source files: {incoming.sources.length}
        </p>
        <p>
          Identities {page * 8 + 1}–{Math.min(page * 8 + 8, entries.length)} of {entries.length}.
          Choices on other pages are retained.
        </p>
        <Button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous identities
        </Button>
        <Button disabled={(page + 1) * 8 >= entries.length} onClick={() => setPage((p) => p + 1)}>
          Next identities
        </Button>
        <label>
          Find previous identity{" "}
          <Input
            aria-label="Find previous identity"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <small>
          Each list shows the selected identity and up to 49 search matches. Search by name or full
          ID.
        </small>
        {entries.slice(page * 8, page * 8 + 8).map((e) => (
          <label key={e.kind + e.key} style={{ display: "block", margin: "12px 0" }}>
            {e.kind} · {e.key}
            <Select
              aria-label={e.kind + " " + e.key}
              value={mapping[e.kind + ":" + e.key]}
              onChange={(event) =>
                setMapping({ ...mapping, [e.kind + ":" + e.key]: event.target.value })
              }
              style={{ display: "block", width: "100%" }}
            >
              <option value="">Create new identity</option>
              {candidates(e.kind, e.key).map((old) => (
                <option key={old.id} value={old.id}>
                  Retain {old.key} · {old.id.slice(0, 8)}
                </option>
              ))}
            </Select>
          </label>
        ))}
        <p>
          {removed.length} previous identities will be removed:{" "}
          {removed
            .slice(0, 25)
            .map((e) => e.kind + " " + e.key)
            .join(", ") || "none"}
          {removed.length > 25 ? " (additional removals omitted from this summary)" : ""}.
        </p>
        {duplicate && <p role="alert">Each previous identity may be mapped only once.</p>}
        {[...new Set(incoming.report.warnings)].map((warning) => (
          <p key={warning}>{warning}</p>
        ))}
        <Button onClick={() => finish(undefined)}>Cancel reimport</Button>{" "}
        <Button disabled={duplicate} onClick={() => finish(mapping)}>
          Apply reimport
        </Button>
      </Panel>
    </Dialog>
  );
}
