import { useEffect, useMemo, useRef, useState } from "react";
import type { UVInspection } from "../../runtime/src/material-slots";
import { Select } from "./ui";
export function UVPreview({ inspect }: { inspect: (channel: 0 | 1) => UVInspection }) {
  const [channel, setChannel] = useState<0 | 1>(0);
  const result = useMemo(() => {
    try {
      const snapshot = inspect(channel);
      return {
        snapshot,
        message: `${snapshot.triangles.length / 6} / ${snapshot.totalTriangles} triangles shown${snapshot.truncated ? " (bounded sample)" : ""}. Sampled UV bounds: ${snapshot.bounds.map((n) => n.toFixed(3)).join(", ")}. Square marks the 0–1 tile. No UV generation or unwrapping is performed.`,
      };
    } catch (error) {
      return { message: String(error), snapshot: undefined };
    }
  }, [inspect, channel]);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, 400, 400);
    if (result.snapshot) {
      const snapshot = result.snapshot,
        [minU, minV, maxU, maxV] = snapshot.bounds;
      const loU = Math.min(0, minU),
        loV = Math.min(0, minV),
        hiU = Math.max(1, maxU),
        hiV = Math.max(1, maxV),
        span = Math.max(hiU - loU, hiV - loV, 1e-6);
      const x = (u: number) => 12 + ((u - loU) / span) * 376,
        y = (v: number) => 388 - ((v - loV) / span) * 376;
      context.fillStyle = "#122019";
      context.fillRect(0, 0, 400, 400);
      context.strokeStyle = "#5a7868";
      context.lineWidth = 1;
      context.strokeRect(x(0), y(1), 376 / span, 376 / span);
      context.strokeStyle = "#b9d9be";
      context.lineWidth = 0.6;
      context.beginPath();
      for (let i = 0; i < snapshot.triangles.length; i += 6) {
        context.moveTo(x(snapshot.triangles[i]), y(snapshot.triangles[i + 1]));
        context.lineTo(x(snapshot.triangles[i + 2]), y(snapshot.triangles[i + 3]));
        context.lineTo(x(snapshot.triangles[i + 4]), y(snapshot.triangles[i + 5]));
        context.closePath();
      }
      context.stroke();
    }
  }, [result]);
  return (
    <section aria-label="UV layout inspection">
      <label>
        Inspect UV set
        <Select
          aria-label="Inspect UV set"
          value={channel}
          onChange={(event) => setChannel(Number(event.target.value) as 0 | 1)}
        >
          <option value="0">UV0</option>
          <option value="1">UV1</option>
        </Select>
      </label>
      <canvas
        ref={canvas}
        width={400}
        height={400}
        aria-label="UV triangle layout"
        style={{ width: "100%", maxWidth: 400, height: "auto" }}
      />
      <p role="status">{result.message}</p>
    </section>
  );
}
