import { RootMotion } from "../../animation/src/root-motion";
import { RootPathPreview } from "./root-path-preview";
import { useEffect, useState } from "react";
import * as T from "three";
import type { Entity, Asset, SceneDocument } from "../../runtime/src/schema";
import type { Engine } from "../../runtime/src/engine";
import { parseAnimator, type AnimatorDefinition } from "../../animation/src/definition";
import { bindAnimationClips } from "../../animation/src/bindings";
interface Props {
  entity: Entity;
  asset: Asset;
  engine: Engine | null;
  disabled: boolean;
  commit: (change: (scene: SceneDocument) => void) => void;
}
function Draft({
  definition,
  asset,
  root,
  onApply,
  disabled,
}: {
  definition: AnimatorDefinition;
  asset: Asset;
  root?: T.Object3D;
  onApply: (value: AnimatorDefinition) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(JSON.stringify(definition, null, 2)),
    [error, setError] = useState("");
  let parsed: AnimatorDefinition | undefined;
  try {
    parsed = parseAnimator(JSON.parse(draft));
  } catch {
    /* Retain an invalid draft without touching the accepted graph. */
  }
  const first = parsed?.clips && Object.keys(parsed.clips)[0];
  return (
    <div>
      <p className="hint">
        Clip IDs refer to retained subassets. Trims sample original tracks without rewriting cubic
        tangents. State/transition JSON is declarative, never executable code.
      </p>
      {first && parsed?.clips[first] && (
        <div>
          <label>
            Source clip
            <select
              aria-label="Animation bound clip"
              value={parsed.clips[first].subasset}
              disabled={disabled}
              onChange={(event) => {
                const next = structuredClone(parsed!);
                next.clips[first].subasset = event.target.value;
                setDraft(JSON.stringify(next, null, 2));
              }}
            >
              {asset
                .import!.subassets.filter((s) => s.kind === "clip")
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.key}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Trim start
            <input
              aria-label="Animation trim start"
              type="number"
              step="0.01"
              value={parsed.clips[first].start}
              disabled={disabled}
              onChange={(event) => {
                const next = structuredClone(parsed!);
                next.clips[first].start = Number(event.target.value);
                setDraft(JSON.stringify(next, null, 2));
              }}
            />
          </label>
          <label>
            Trim end
            <input
              aria-label="Animation trim end"
              type="number"
              step="0.01"
              value={parsed.clips[first].end}
              disabled={disabled}
              onChange={(event) => {
                const next = structuredClone(parsed!);
                next.clips[first].end = Number(event.target.value);
                setDraft(JSON.stringify(next, null, 2));
              }}
            />
          </label>
        </div>
      )}
      <textarea
        aria-label="Animator definition"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        rows={12}
        spellCheck={false}
        style={{ width: "100%", fontFamily: "monospace" }}
      />
      <button
        disabled={disabled || !root}
        onClick={() => {
          try {
            const value = parseAnimator(JSON.parse(draft));
            const bound = bindAnimationClips(value, asset.import!, root!.animations, root);
            if (value.rootMotion) new RootMotion(root!, value, bound);
            onApply(value);
            setError("");
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        Apply animator
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function AnimationPanel({ entity, asset, engine, disabled, commit }: Props) {
  const [pathOpen, setPathOpen] = useState(false);
  const [clip, setClip] = useState(
      asset.import?.subassets.find((s) => s.kind === "clip")?.id || "",
    ),
    [preview, setPreview] = useState(false),
    [skeleton, setSkeleton] = useState(false),
    [fade, setFade] = useState(0.2),
    [, refresh] = useState(0),
    [error, setError] = useState("");
  const player = engine?.animators.get(entity.id),
    root = engine?.objects.get(entity.id)?.children.find((node) => node.animations.length > 0);
  useEffect(() => {
    if (!skeleton || !root || !engine) return;
    const helper = new T.SkeletonHelper(root);
    let owner: T.Object3D = root;
    while (owner.parent && owner.parent !== engine.scene) owner = owner.parent;
    (owner.parent === engine.scene ? owner : engine.scene).add(helper);
    return () => {
      helper.removeFromParent();
      helper.geometry.dispose();
      for (const m of Array.isArray(helper.material) ? helper.material : [helper.material])
        m.dispose();
    };
  }, [skeleton, root, engine]);
  useEffect(() => {
    if (!preview || !player || !engine || engine.playing) return;
    let frame = 0,
      last = performance.now(),
      accumulator = 0,
      ticks = 0;
    const step = (now: number) => {
      if (engine.playing) return;
      accumulator = Math.min(0.1, accumulator + (now - last) / 1000);
      last = now;
      try {
        while (accumulator >= 1 / 60) {
          const result = player.advance(1 / 60);
          if (result.overflow) throw Error("Preview marker budget exceeded");
          accumulator -= 1 / 60;
        }
        if (++ticks % 6 === 0) refresh((n) => n + 1);
        frame = requestAnimationFrame(step);
      } catch (e) {
        setError(String(e));
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [preview, player, engine]);
  const choices = asset.import?.subassets.filter((s) => s.kind === "clip") || [];
  if (!choices.length) return null;
  const apply = (definition: AnimatorDefinition) =>
    commit((scene) => {
      const target = scene.entities.find((e) => e.id === entity.id);
      if (!target) throw Error("Animation target removed");
      target.animator = definition;
      scene.version = 3;
    });
  const snapshot = player?.graph.snapshot;
  return (
    <section className="animation-inspector" aria-label="Animation inspector">
      <h3>Animation</h3>
      {!entity.animator && (
        <>
          <select
            aria-label="Animation source clip"
            value={clip}
            disabled={disabled}
            onChange={(event) => setClip(event.target.value)}
          >
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.key.startsWith("name:") ? c.key.slice(5) : c.key}
              </option>
            ))}
          </select>
        </>
      )}
      {!entity.animator && (
        <button
          disabled={disabled || !root}
          onClick={() => {
            try {
              const item = choices.find((c) => c.id === clip)!;
              const source = item.key.startsWith("name:")
                ? root!.animations.find((c) => c.name === item.key.slice(5))
                : root!.animations[Number(/^ambiguous:(\d+):/.exec(item.key)?.[1])];
              if (!source) throw Error("Missing source clip");
              apply({
                version: 1,
                initial: "default",
                parameters: {},
                clips: { main: { subasset: clip, start: 0, end: source.duration } },
                states: { default: { clip: "main", loop: true, speed: 1 } },
                transitions: [],
              });
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Add animator
        </button>
      )}
      {entity.animator && (
        <>
          <Draft
            key={JSON.stringify(entity.animator)}
            definition={entity.animator}
            asset={asset}
            root={root}
            onApply={apply}
            disabled={disabled}
          />
          <button
            disabled={disabled}
            onClick={() =>
              commit((scene) => {
                delete scene.entities.find((e) => e.id === entity.id)!.animator;
              })
            }
          >
            Remove animator
          </button>
          <label>
            <input
              type="checkbox"
              checked={skeleton}
              onChange={(event) => setSkeleton(event.target.checked)}
            />
            Skeleton overlay
          </label>
          <button
            disabled={!player || engine?.playing}
            onClick={() => setPreview((value) => !value)}
          >
            {preview ? "Pause preview" : "Play preview"}
          </button>
          <label>
            Preview speed
            <input
              aria-label="Animation preview speed"
              type="number"
              min="-8"
              max="8"
              step="0.25"
              value={snapshot?.speed ?? 1}
              disabled={!player || engine?.playing}
              onChange={(event) => {
                try {
                  player?.graph.setPlaybackSpeed(Number(event.target.value));
                  refresh((n) => n + 1);
                } catch (e) {
                  setError(String(e));
                }
              }}
            />
          </label>
          <label>
            Preview position
            <input
              aria-label="Animation preview position"
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={snapshot?.normalized || 0}
              disabled={!player || engine?.playing}
              onChange={(event) => {
                setPreview(false);
                player?.seek(Number(event.target.value));
                refresh((n) => n + 1);
              }}
            />
          </label>
          <small>
            {snapshot?.state} · {snapshot?.time.toFixed(3)} s ·{" "}
            {((snapshot?.normalized || 0) * 100).toFixed(1)}% · fade{" "}
            {((snapshot?.fade || 0) * 100).toFixed(0)}%
          </small>
          <label>
            Fade seconds
            <input
              aria-label="Animation fade seconds"
              type="number"
              min="0"
              max="10"
              step="0.05"
              value={fade}
              onChange={(event) => setFade(Number(event.target.value))}
            />
          </label>
          <div>
            {Object.keys(entity.animator.states).map((state) => (
              <button
                key={state}
                disabled={!player}
                onClick={() => {
                  try {
                    player!.graph.play(state, fade);
                    player!.sample();
                    refresh((n) => n + 1);
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Preview state {state}
              </button>
            ))}
          </div>
          {Object.entries(snapshot?.parameters || {}).map(([name, value]) => (
            <label key={name}>
              {name}
              <input
                aria-label={"Animation parameter " + name}
                type={typeof value === "boolean" ? "checkbox" : "number"}
                checked={typeof value === "boolean" ? value : undefined}
                value={typeof value === "number" ? value : undefined}
                onChange={(event) => {
                  try {
                    player?.graph.setParameter(
                      name,
                      typeof value === "boolean"
                        ? event.target.checked
                        : Number(event.target.value),
                    );
                    refresh((n) => n + 1);
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              />
            </label>
          ))}
          <p className="hint">
            Preview markers are not delivered to gameplay listeners. Play resets authored parameters
            and activation state.
          </p>
        </>
      )}
      {player?.rootMotion && (
        <>
          <button onClick={() => setPathOpen(true)}>Inspect root path</button>
          {pathOpen && (
            <RootPathPreview
              key={player.root.uuid}
              player={player}
              onClose={() => setPathOpen(false)}
            />
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
