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
  const [entries] = useState(() => reconcileSubassets(incoming.report, previous));
  const [mapping, setMapping] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      entries.map((e) => [
        e.kind + ":" + e.key,
        previous?.subassets.some((old) => old.id === e.id) ? e.id : "",
      ]),
    ),
  );
  const ids = Object.values(mapping).filter(Boolean),
    duplicate = new Set(ids).size !== ids.length;
  const removed = previous?.subassets.filter((e) => !ids.includes(e.id)) || [];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review reimport"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "#000b",
        display: "grid",
        placeItems: "center",
      }}
    >
      <section
        style={{
          background: "#20262b",
          padding: 24,
          width: "min(700px,90vw)",
          maxHeight: "85vh",
          overflow: "auto",
        }}
      >
        <h2>Review reimport</h2>
        <p>
          Entity transforms and model ID stay unchanged. Explicitly map renamed or ambiguous
          materials/clips; nothing is matched by array order.
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
        {entries.map((e) => (
          <label key={e.kind + e.key} style={{ display: "block", margin: "12px 0" }}>
            {e.kind} · {e.key}
            <select
              aria-label={e.kind + " " + e.key}
              value={mapping[e.kind + ":" + e.key]}
              onChange={(event) =>
                setMapping({ ...mapping, [e.kind + ":" + e.key]: event.target.value })
              }
              style={{ display: "block", width: "100%" }}
            >
              <option value="">Create new identity</option>
              {previous?.subassets
                .filter((old) => old.kind === e.kind)
                .map((old) => (
                  <option key={old.id} value={old.id}>
                    Retain {old.key} · {old.id.slice(0, 8)}
                  </option>
                ))}
            </select>
          </label>
        ))}
        <p>
          {removed.length} previous identities will be removed:{" "}
          {removed.map((e) => e.kind + " " + e.key).join(", ") || "none"}.
        </p>
        {duplicate && <p role="alert">Each previous identity may be mapped only once.</p>}
        {incoming.report.warnings.map((warning, i) => (
          <p key={i}>{warning}</p>
        ))}
        <button onClick={() => finish(undefined)}>Cancel reimport</button>{" "}
        <button disabled={duplicate} onClick={() => finish(mapping)}>
          Apply reimport
        </button>
      </section>
    </div>
  );
}
