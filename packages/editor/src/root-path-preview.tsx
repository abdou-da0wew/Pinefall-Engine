import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AnimationGraphPlayer } from "../../animation/src/graph-player";
/** On-demand inspection only: never seeks, changes the live pose or emits gameplay markers. */
export function RootPathPreview({
  player,
  onClose,
}: {
  player: AnimationGraphPlayer;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [clip, setClip] = useState(player.graph.definition.states[player.graph.state].clip);
  useEffect(() => {
    const modal = dialog.current!,
      previous = document.activeElement;
    modal.showModal();
    return () => {
      modal.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  const points = player.rootMotion!.path(clip),
    xs = points.map((p) => p.x),
    zs = points.map((p) => p.z),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs),
    span = Math.max(maxX - minX, maxZ - minZ, 0.1);
  const project = (p: { x: number; z: number }) => [
    30 + ((p.x - (minX + maxX) / 2) / span + 0.5) * 340,
    30 + (0.5 - (p.z - (minZ + maxZ) / 2) / span) * 340,
  ];
  const first = project(points[0]),
    last = project(points.at(-1)!);
  return createPortal(
    <dialog
      ref={dialog}
      className="root-path-dialog"
      aria-label="Root motion path"
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>Root motion path</h2>
        <button onClick={onClose} aria-label="Close root motion path">
          Close
        </button>
      </header>
      <label>
        Clip recipe{" "}
        <select
          aria-label="Root path clip"
          value={clip}
          onChange={(event) => setClip(event.target.value)}
        >
          {Object.keys(player.graph.definition.clips).map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
      </label>
      <svg viewBox="0 0 400 400" role="img" aria-label="Unobstructed horizontal root trajectory">
        <rect x="1" y="1" width="398" height="398" fill="#101b16" stroke="#40553d" />
        <path
          d={points.map((p, i) => `${i ? "L" : "M"}${project(p).join(" ")}`).join(" ")}
          fill="none"
          stroke="#bad29a"
          strokeWidth="3"
        />
        <circle cx={first[0]} cy={first[1]} r="6" fill="#78b99b" />
        <circle cx={last[0]} cy={last[1]} r="4" fill="#e2bd83" />
        <text x="12" y="22" fill="#c7d4bc" fontSize="12">
          +Z ↑ · +X →
        </text>
      </svg>
      <p>
        Green: start. Amber: end. Span {span.toFixed(3)} model metres. Yaw{" "}
        {((points[0].yaw * 180) / Math.PI).toFixed(1)}° →{" "}
        {((points.at(-1)!.yaw * 180) / Math.PI).toFixed(1)}°.
      </p>
      <p>
        This is the desired, unobstructed clip path—not the collision-corrected distance. Controller
        gravity owns vertical movement; the animation retains vertical bob. Inspection does not move
        the character or fire markers.
      </p>
    </dialog>,
    document.body,
  );
}
