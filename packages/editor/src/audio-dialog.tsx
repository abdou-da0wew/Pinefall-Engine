import { Panel } from "./ui";
import { Button, Input, Select, Textarea } from "./ui";
import { blobs } from "../../assets/src/blobs";
import { assetMemory } from "../../assets/src/budget";
import { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  audioBuses,
  defaultCue,
  emptyAudio,
  parseAudio,
  waveBytes,
  type AudioDefinition,
} from "../../audio/src/definition";
import { inspectWave } from "../../audio/src/wav";
import type { Engine } from "../../runtime/src/engine";
import type { Entity, SceneDocument } from "../../runtime/src/schema";
function CueEditor({
  audio,
  disabled,
  apply,
}: {
  audio: AudioDefinition;
  disabled: boolean;
  apply: (audio: AudioDefinition) => void;
}) {
  const [draft, setDraft] = useState(
      JSON.stringify({ cues: audio.cues, buses: audio.buses }, null, 2),
    ),
    [error, setError] = useState("");
  return (
    <Panel>
      <h3>Cues and bus definitions</h3>
      <p>
        Use retained asset IDs below. Marker bindings live on an entity’s <code>audioCues</code>{" "}
        map. No code is evaluated here.
      </p>
      <Textarea
        aria-label="Audio cue definitions"
        rows={12}
        spellCheck={false}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
      />
      <Button
        disabled={disabled}
        onClick={() => {
          try {
            const value = JSON.parse(draft);
            if (!value || Object.keys(value).some((k) => !["cues", "buses"].includes(k)))
              throw Error("Only cues and buses belong in this editor");
            apply(parseAudio({ ...audio, ...value }));
            setError("");
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        Apply audio definitions
      </Button>
      {error && <p role="alert">{error}</p>}
    </Panel>
  );
}
function MarkerBindings({
  entity,
  audio,
  disabled,
  commit,
}: {
  entity: Entity;
  audio: AudioDefinition;
  disabled: boolean;
  commit: (change: (scene: SceneDocument) => void) => void;
}) {
  const [clip, setClip] = useState(Object.keys(entity.animator!.clips)[0]);
  return (
    <details>
      <summary>Animation marker bindings</summary>
      <p>Bindings apply to every clip using the same marker ID.</p>
      <Select
        aria-label="Audio marker clip"
        value={clip}
        onChange={(event) => setClip(event.target.value)}
      >
        {Object.keys(entity.animator!.clips).map((id) => (
          <option key={id}>{id}</option>
        ))}
      </Select>
      {(entity.animator!.clips[clip]?.markers ?? []).map((marker) => (
        <label key={marker.id}>
          {marker.id} · {marker.time}s
          <Select
            aria-label={"Audio cue for marker " + marker.id}
            value={entity.audioCues?.[marker.id] ?? ""}
            disabled={disabled}
            onChange={(event) => {
              const cue = event.target.value;
              commit((scene) => {
                const target = scene.entities.find((e) => e.id === entity.id)!;
                target.audioCues = { ...target.audioCues };
                if (cue) target.audioCues[marker.id] = cue;
                else delete target.audioCues[marker.id];
              });
            }}
          >
            <option value="">No sound</option>
            {audio.cues.map((cue) => (
              <option key={cue.id}>{cue.id}</option>
            ))}
          </Select>
        </label>
      ))}
    </details>
  );
}
export function AudioDialog({
  scene,
  engine,
  disabled,
  loading,
  commit,
  onClose,
}: {
  scene: SceneDocument;
  engine: Engine;
  disabled: boolean;
  loading: boolean;
  commit: (change: (scene: SceneDocument) => void) => void;
  onClose: () => void;
}) {
  const modal = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("Selection never autoplays. Unlock, then explicitly preview."),
    [selected, setSelected] = useState(scene.audio?.assets[0]?.id ?? "");
  const [streaming, setStreaming] = useState(false);
  const [remove, setRemove] = useState<string>();
  const audio = scene.audio ?? emptyAudio();
  const [emitter, setEmitter] = useState(scene.entities.find((e) => e.animator)?.id ?? "");
  const actor = scene.entities.find((e) => e.id === emitter && e.animator),
    source = audio.assets.find((a) => a.id === selected);
  const info = useMemo(() => {
    try {
      return source ? inspectWave(waveBytes(source.data), source.mode === "stream") : undefined;
    } catch {
      return undefined;
    }
  }, [source]);
  useEffect(() => {
    const dialog = modal.current!,
      previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      engine.audio.stopPreviews();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [engine]);
  const close = () => {
    engine.audio.stopPreviews();
    for (const bus of audioBuses) engine.audio.setBusGain(bus, audio.buses[bus]);
    onClose();
  };
  const apply = (value: AudioDefinition) =>
    commit((s) => {
      s.audio = value;
      s.version = 3;
    });
  return createPortal(
    <dialog
      ref={modal}
      className="audio-dialog"
      aria-label="Audio studio"
      onKeyDown={(e) => e.stopPropagation()}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <div>
          <small>PROJECT AUDIO</small>
          <h2>Audio studio</h2>
        </div>
        <Button onClick={close}>Close audio studio</Button>
      </header>
      <p>
        Buffered PCM16 WAV · 16 assets · 8 MB encoded-source budget · 32 MiB decoded PCM · 24 voices
        + 4 release tails. Streaming WAV: up to 240 seconds within the source limit; two concurrent
        streams.
      </p>
      <label>
        <Input
          type="checkbox"
          checked={streaming}
          onChange={(e) => setStreaming(e.target.checked)}
        />{" "}
        Import as streaming music (tracks over 30 seconds stream automatically)
      </label>
      <div className="audio-actions">
        <label>
          Import WAV
          <Input
            aria-label="Import WAV"
            type="file"
            accept=".wav"
            disabled={disabled || busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setBusy(true);
              let reservation: ReturnType<typeof assetMemory.reserve> | undefined;
              try {
                if (file.size > 4_000_000) throw Error("WAV input exceeds 4 MB");
                reservation = assetMemory.reserve(file.size * 3, "audio-import");
                const bytes = new Uint8Array(await file.arrayBuffer()),
                  info = inspectWave(bytes, true),
                  stream = streaming || info.duration > 30,
                  next = structuredClone(audio),
                  id = crypto.randomUUID();
                const data = await blobs.put(bytes),
                  existing = next.assets.find(
                    (a) => a.data === data && (a.mode === "stream") === stream,
                  );
                if (existing) {
                  setSelected(existing.id);
                  setStatus("Selected existing audio asset; no duplicate decoded buffer.");
                  return;
                }
                next.assets.push({
                  id,
                  name: file.name,
                  data,
                  ...(stream ? { mode: "stream" as const } : {}),
                });
                next.cues.push({
                  ...defaultCue("cue-" + id.slice(0, 8), id),
                  ...(stream ? { bus: "music" as const } : {}),
                });
                apply(parseAudio(next));
                setSelected(id);
                setStatus(
                  `Imported ${info.duration.toFixed(2)} seconds, ${info.channels} channel(s), ${info.sampleRate} Hz.`,
                );
              } catch (e) {
                setStatus(String(e));
              } finally {
                reservation?.release();
                setBusy(false);
              }
            }}
          />
        </label>
        <Button
          disabled={busy || loading}
          onClick={async () => {
            setBusy(true);
            try {
              setStatus(
                (await engine.audio.unlock())
                  ? "Audio ready. Choose Preview to hear the selected asset."
                  : "Audio blocked: retry from a trusted user gesture.",
              );
            } catch (e) {
              setStatus(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Unlock audio
        </Button>
        <Button
          disabled={!selected || busy || loading}
          onClick={() => {
            const result = engine.audio.preview(selected);
            setStatus("handle" in result ? result.status : result.reason);
          }}
        >
          Preview selected audio
        </Button>
        <Button onClick={() => engine.audio.stopPreviews()}>Stop all previews</Button>
      </div>
      <Button disabled={!selected || disabled || busy} onClick={() => setRemove(selected)}>
        Remove selected asset…
      </Button>
      {remove && (
        <Panel role="alert">
          <p>
            Remove this asset, its cues, and their entity marker bindings? Undo can restore the
            authored project.
          </p>
          <Button
            disabled={disabled || busy}
            onClick={() => {
              commit((s) => {
                if (!s.audio) return;
                const cues = new Set(
                  s.audio.cues.filter((c) => c.asset === remove).map((c) => c.id),
                );
                s.audio.assets = s.audio.assets.filter((a) => a.id !== remove);
                s.audio.cues = s.audio.cues.filter((c) => !cues.has(c.id));
                for (const e of s.entities)
                  if (e.audioCues)
                    for (const [marker, cue] of Object.entries(e.audioCues))
                      if (cues.has(cue)) delete e.audioCues[marker];
              });
              setRemove(undefined);
              setSelected("");
            }}
          >
            Confirm remove audio
          </Button>
          <Button onClick={() => setRemove(undefined)}>Keep asset</Button>
        </Panel>
      )}
      <p role="status">
        {status} · Device: {engine.audio.stats.state}
      </p>
      <div className="audio-columns">
        <Panel>
          <h3>Assets</h3>
          <Select
            aria-label="Audio asset"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose an asset</option>
            {audio.assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <ul>
            {audio.assets.map((a) => (
              <li key={a.id}>
                <strong>{a.name}</strong>
                <code>{a.id}</code>
              </li>
            ))}
          </ul>
          {info && (
            <p>
              {info.duration.toFixed(3)} seconds · {info.channels} channel(s) · {info.sampleRate} Hz
              ·{" "}
              {source?.mode === "stream"
                ? "Media-element stream (no full PCM cache)"
                : `${(info.pcmBytes / 1048576).toFixed(2)} MiB decoded`}
            </p>
          )}
          <h3>Bus mixer</h3>
          <p>
            Live audition changes only. Apply authored bus gains in the definition editor to save
            them.
          </p>
          {audioBuses.map((bus) => (
            <label key={bus}>
              {bus}
              <Input
                aria-label={"Audio bus " + bus}
                type="range"
                min="-80"
                max="6"
                step="1"
                key={bus + audio.buses[bus]}
                defaultValue={audio.buses[bus]}
                onChange={(e) => {
                  try {
                    engine.audio.setBusGain(bus, Number(e.target.value));
                  } catch (error) {
                    setStatus(String(error));
                  }
                }}
              />
            </label>
          ))}
          <Button
            onClick={() => {
              for (const bus of audioBuses) engine.audio.setBusGain(bus, -80);
              setStatus("All audition buses muted.");
            }}
          >
            Mute all buses
          </Button>
          <p>
            Game pause holds game voices at their logical cursor; the UI bus stays responsive.
            Closing this studio stops previews.
          </p>
        </Panel>
        <Panel>
          <label>
            Emitter
            <Select
              aria-label="Audio marker entity"
              value={emitter}
              onChange={(e) => setEmitter(e.target.value)}
            >
              <option value="">Select animated entity</option>
              {scene.entities
                .filter((e) => e.animator)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </Select>
          </label>
          {actor && (
            <MarkerBindings
              key={actor.id}
              entity={actor}
              audio={audio}
              disabled={disabled || busy}
              commit={commit}
            />
          )}
          <CueEditor
            key={JSON.stringify({ cues: audio.cues, buses: audio.buses })}
            audio={audio}
            disabled={disabled || busy}
            apply={apply}
          />
        </Panel>
      </div>
    </dialog>,
    document.body,
  );
}
