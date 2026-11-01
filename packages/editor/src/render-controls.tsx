import { ColorPicker } from "./color-picker";
import { useState } from "react";
import { Button, Input, Select, Panel, Dialog, Switch } from "./ui";
import {
  DEFAULT_POST,
  DEFAULT_SCATTERING,
  DEFAULT_SURFACE,
  type PostSettings,
  type Surface,
} from "../../runtime/src/graphics-definition";
import type { RenderSettings } from "../../runtime/src/schema";
import type { GraphicsSnapshot } from "../../runtime/src/graphics-api";
export function PreviewRendering({
  settings,
  post,
  snapshot,
  onSettings,
  onPost,
  onAuthor,
  onReset,
  onDesktop,
  canAuthor,
}: {
  settings: RenderSettings;
  post: PostSettings;
  snapshot?: GraphicsSnapshot;
  onSettings: (p: Partial<RenderSettings>) => void;
  onPost: (p: PostSettings) => void;
  onAuthor: () => void;
  onReset: () => void;
  onDesktop: () => void;
  canAuthor: boolean;
}) {
  return (
    <>
      <Panel>
        <h3>Preview settings — this device</h3>
        <label>
          Resolution scale
          <Input
            aria-label="Preview resolution scale"
            type="range"
            min="0.25"
            max="1"
            step="0.05"
            value={settings.renderScale ?? 1}
            onChange={(e) => onSettings({ renderScale: Number(e.target.value) })}
          />
        </label>
        <label className="row-field">
          Allow shadow maps
          <Switch
            aria-label="Allow preview shadows"
            checked={settings.shadows ?? settings.preset === "high"}
            onChange={(e) => onSettings({ shadows: e.target.checked })}
          />
        </label>
        <Button className="wide-button" onClick={onDesktop}>
          GPU / CPU & compositor settings…
        </Button>
        <p className="hint">
          Backend changes require a desktop restart. Preview quality does not rewrite the saved
          project.
        </p>
      </Panel>
      <Panel>
        <h3>Post-processing preview</h3>
        {(["enabled", "bloom", "fxaa"] as const).map((key) => (
          <label className="row-field" key={key}>
            {key === "enabled"
              ? "Enable post FX"
              : key === "bloom"
                ? "Bloom (multi-resolution)"
                : "FXAA"}
            <Switch
              aria-label={"Preview " + key}
              checked={post[key]}
              onChange={(e) => onPost({ ...post, [key]: e.target.checked })}
            />
          </label>
        ))}
        <label>
          Tone mapping
          <Select
            aria-label="Preview tone mapping"
            value={post.toneMapping}
            onChange={(e) =>
              onPost({ ...post, toneMapping: e.target.value as PostSettings["toneMapping"] })
            }
          >
            {["aces", "neutral", "reinhard", "none"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        {(
          [
            ["threshold", "Bloom threshold (linear)", 0, 10, 0.05],
            ["strength", "Bloom strength", 0, 3, 0.05],
            ["radius", "Bloom radius", 0, 1, 0.05],
            ["exposure", "Exposure", 0.05, 8, 0.05],
            ["contrast", "Contrast", 0, 2, 0.05],
            ["saturation", "Saturation", 0, 2, 0.05],
            ["vignette", "Vignette", 0, 1, 0.05],
            ["grain", "Film grain", 0, 0.2, 0.005],
            ["chromaticAberration", "Chromatic aberration", 0, 0.01, 0.0005],
          ] as const
        ).map(([key, label, min, max, step]) => (
          <label key={key}>
            {label} <b>{post[key].toFixed(key === "chromaticAberration" ? 4 : 2)}</b>
            <Input
              aria-label={"Preview " + label}
              type="range"
              min={min}
              max={max}
              step={step}
              value={post[key]}
              onChange={(e) => onPost({ ...post, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <details>
          <summary>Depth-aware scattering</summary>
          <label className="row-field">
            Enable height scattering
            <Switch
              aria-label="Preview depth scattering"
              checked={!!post.scattering}
              onChange={(e) =>
                onPost({
                  ...post,
                  scattering: e.target.checked ? { ...DEFAULT_SCATTERING } : undefined,
                })
              }
            />
          </label>
          {post.scattering && (
            <>
              <label>
                Ray steps
                <Select
                  aria-label="Scattering ray steps"
                  value={post.scattering.steps}
                  onChange={(e) =>
                    onPost({
                      ...post,
                      scattering: {
                        ...post.scattering!,
                        steps: Number(e.target.value) as 8 | 16 | 32,
                      },
                    })
                  }
                >
                  {[8, 16, 32].map((steps) => (
                    <option key={steps}>{steps}</option>
                  ))}
                </Select>
              </label>
              {(
                [
                  ["density", 0, 0.5, 0.005],
                  ["heightFalloff", 0, 2, 0.05],
                  ["baseHeight", -100, 100, 1],
                  ["maxDistance", 1, 200, 1],
                  ["intensity", 0, 8, 0.1],
                  ["anisotropy", -0.8, 0.8, 0.05],
                ] as const
              ).map(([key, min, max, step]) => (
                <label key={key}>
                  {key} <b>{post.scattering![key]}</b>
                  <Input
                    aria-label={"Scattering " + key}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={post.scattering![key]}
                    onChange={(e) =>
                      onPost({
                        ...post,
                        scattering: { ...post.scattering!, [key]: Number(e.target.value) },
                      })
                    }
                  />
                </label>
              ))}
              <ColorPicker
                label="Scattering color"
                value={post.scattering.color}
                onChange={(color) =>
                  onPost({ ...post, scattering: { ...post.scattering!, color } })
                }
              />
            </>
          )}
          <p className="hint">
            Half-resolution Beer–Lambert integration stops at opaque scene depth. Transparent
            surfaces do not terminate rays. No shadow-map sampling or temporal history; thin
            geometry may show half-resolution limitations. This is separate from the fake cone
            beams.
          </p>
        </details>
        <Button onClick={onReset}>Use authored post settings</Button>
        <Button disabled={!canAuthor} onClick={onAuthor}>
          Apply preview post to project
        </Button>
        <p className="hint">
          Bloom spreads bright pixels; it does not illuminate nearby objects. Exposure works with or
          without the post chain. Game UI stays outside the effects.
        </p>
        {snapshot && (
          <>
            <small>
              {snapshot.hdr ? "HDR-capable targets" : "LDR fallback"} · Post targets{" "}
              {(snapshot.postTargetBytes / 1048576).toFixed(1)} MiB · Shadows{" "}
              {(snapshot.shadowTargetBytes / 1048576).toFixed(1)} MiB / {snapshot.shadowViews}{" "}
              views. Accounted estimates, not measured VRAM.
            </small>
            {snapshot.reasons.map((reason) => (
              <p className="hint" key={reason}>
                {reason}
              </p>
            ))}
          </>
        )}
      </Panel>
      <Panel>
        <h3>Fake beam preview</h3>
        <label className="row-field">
          Translucent cone beams
          <Switch
            aria-label="Fake beam preview"
            checked={settings.volumetrics}
            onChange={(e) => onSettings({ volumetrics: e.target.checked })}
          />
        </label>
        <label>
          Beam opacity
          <Input
            aria-label="Beam opacity"
            type="range"
            min="0.01"
            max="0.25"
            step="0.01"
            value={settings.beamOpacity}
            onChange={(e) => onSettings({ beamOpacity: Number(e.target.value) })}
          />
        </label>
        <small>Not depth-aware volumetric scattering. Plan 03 G5 remains experimental work.</small>
      </Panel>
    </>
  );
}
export function previewPost(settings: RenderSettings, authored?: PostSettings): PostSettings {
  return (
    settings.previewPost ??
    authored ?? {
      ...DEFAULT_POST,
      enabled: settings.post,
      bloom: settings.glow,
      threshold: settings.threshold,
      strength: settings.strength,
      exposure: settings.exposure,
    }
  );
}
export function SurfaceDialog({
  initial,
  onApply,
  onClose,
}: {
  initial?: Surface;
  onApply: (surface: Surface, reusable: boolean) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState<Surface>(initial ?? { ...DEFAULT_SURFACE });
  return (
    <Dialog
      title="Material surface"
      description="PBR / unlit instance authoring. These controls replace all material slots on the selected entity; imported texture maps are not preserved by this scalar override."
      onClose={onClose}
    >
      <label>
        Shading family
        <Select
          aria-label="Surface family"
          value={value.family}
          onChange={(e) => setValue({ ...value, family: e.target.value as Surface["family"] })}
        >
          <option value="pbr">PBR standard</option>
          <option value="unlit">Unlit</option>
        </Select>
      </label>
      {(["color", "emissive"] as const).map((key) => (
        <label className="row-field" key={key}>
          {key === "color" ? "Base colour" : "Emissive colour"}
          <ColorPicker
            label={"Surface " + key}
            disabled={key === "emissive" && value.family === "unlit"}
            value={value[key]}
            onChange={(color) => setValue({ ...value, [key]: color })}
          />
        </label>
      ))}
      {(
        [
          ["roughness", 0, 1, 0.05],
          ["metalness", 0, 1, 0.05],
          ["emissiveIntensity", 0, 100, 0.1],
          ["opacity", 0, 1, 0.05],
          ["alphaCutoff", 0, 1, 0.05],
        ] as const
      ).map(([key, min, max, step]) => (
        <label key={key}>
          {
            {
              roughness: "Roughness",
              metalness: "Metalness",
              emissiveIntensity: "Emissive intensity",
              opacity: "Opacity",
              alphaCutoff: "Alpha cutoff",
            }[key]
          }
          <Input
            aria-label={"Surface " + key}
            type="number"
            min={min}
            max={max}
            step={step}
            value={value[key]}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= min && n <= max) setValue({ ...value, [key]: n });
            }}
          />
        </label>
      ))}
      <label>
        Alpha mode
        <Select
          aria-label="Surface alpha mode"
          value={value.alphaMode}
          onChange={(e) =>
            setValue({ ...value, alphaMode: e.target.value as Surface["alphaMode"] })
          }
        >
          {["opaque", "mask", "blend"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
      </label>
      <label className="row-field">
        Double-sided
        <Switch
          aria-label="Surface double-sided"
          checked={value.doubleSided}
          onChange={(e) => setValue({ ...value, doubleSided: e.target.checked })}
        />
      </label>
      <p className="hint">
        Emissive is visible radiance, not a light. Blended surfaces have sorting limits and do not
        cast opaque shadows by default. Texture/UV authoring is not included in this scalar surface
        editor yet.
      </p>
      <footer>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => onApply(value, true)}>Save reusable material</Button>
        <Button variant="primary" onClick={() => onApply(value, false)}>
          Apply instance override
        </Button>
      </footer>
    </Dialog>
  );
}
