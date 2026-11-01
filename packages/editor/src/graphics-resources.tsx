import { useEffect, useRef, useState } from "react";
import type { GraphicsImage } from "../../runtime/src/image-definition";
import { importGraphicsImage } from "../../assets/src/graphics-images";
import { packChannels, type PackChannel } from "../../assets/src/channel-pack";
import { Button, Dialog, Input, Select } from "./ui";
export function GraphicsResources({
  images,
  onAdd,
  onClose,
}: {
  images: GraphicsImage[];
  onAdd: (image: GraphicsImage) => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [width, setWidth] = useState(256),
    [height, setHeight] = useState(256),
    [resample, setResample] = useState<"reject" | "nearest">("reject");
  const [channels, setChannels] = useState<PackChannel[]>(
    [0, 1, 2, 3].map((channel) => ({
      channel: channel as 0 | 1 | 2 | 3,
      invert: false,
      constant: 255,
    })),
  );
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  async function run(job: (signal: AbortSignal) => Promise<GraphicsImage>) {
    if (busy) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setMessage("");
    try {
      const image = await job(controller.signal);
      controller.signal.throwIfAborted();
      await onAdd(image);
      setMessage(
        "Image stored in the project. Bind it to a material or HDR environment explicitly.",
      );
    } catch (error) {
      if (!controller.signal.aborted) setMessage(String(error));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <Dialog
      title="Graphics image resources"
      description="Bounded PNG/JPEG textures and Radiance HDR environments. Source images are retained separately from material bindings."
      onClose={onClose}
    >
      <label>
        Import image / HDR
        <Input
          aria-label="Import graphics image"
          type="file"
          accept=".png,.jpg,.jpeg,.hdr"
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void run(() => importGraphicsImage(file));
          }}
        />
      </label>
      <p>
        16 MiB per source, 2048 pixels per edge, 32 images / 128 MiB encoded catalog. Header
        dimensions are checked before worker decoding. HDR environments use 2:1 Radiance panoramas
        with -Y +X orientation. Import does not silently replace material maps.
      </p>
      <ul>
        {images.map((image) => (
          <li key={image.id}>
            {image.name} — {image.width} × {image.height} {image.format.toUpperCase()}
          </li>
        ))}
      </ul>
      <details>
        <summary>Channel packing (raw linear data)</summary>
        <p>
          Canonical ORM uses R=occlusion, G=roughness, B=metalness, A=255. Alpha maps read G;
          displacement reads R. Sources remain in the catalog. PNG packing preserves exact
          straight-alpha bytes (8-bit RGB/RGBA, non-interlaced); JPEG uses decoded channels.
          Inversion is 255 − source.
        </p>
        <label>
          Output width
          <Input
            aria-label="Packed width"
            type="number"
            min={1}
            max={2048}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <label>
          Output height
          <Input
            aria-label="Packed height"
            type="number"
            min={1}
            max={2048}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
          />
        </label>
        <label>
          Dimension policy
          <Select
            aria-label="Packing dimension policy"
            value={resample}
            onChange={(e) => setResample(e.target.value as typeof resample)}
          >
            <option value="reject">Require exact dimensions</option>
            <option value="nearest">Explicit nearest resampling</option>
          </Select>
        </label>
        {channels.map((channel, index) => (
          <fieldset key={["red", "green", "blue", "alpha"][index]}>
            <legend>
              {["Red / AO", "Green / roughness / alpha", "Blue / metalness", "Alpha"][index]}
            </legend>
            <label>
              Source
              <Select
                aria-label={"Pack source " + index}
                value={channel.image ?? ""}
                onChange={(e) =>
                  setChannels(
                    channels.map((c, i) =>
                      i === index ? { ...c, image: e.target.value || undefined } : c,
                    ),
                  )
                }
              >
                <option value="">Constant</option>
                {images
                  .filter((image) => image.format !== "hdr")
                  .map((image) => (
                    <option key={image.id} value={image.id}>
                      {image.name}
                    </option>
                  ))}
              </Select>
            </label>
            <label>
              Channel
              <Select
                aria-label={"Pack channel " + index}
                value={channel.channel}
                onChange={(e) =>
                  setChannels(
                    channels.map((c, i) =>
                      i === index
                        ? { ...c, channel: Number(e.target.value) as PackChannel["channel"] }
                        : c,
                    ),
                  )
                }
              >
                {["R", "G", "B", "A"].map((label, i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Constant byte
              <Input
                aria-label={"Pack constant " + index}
                type="number"
                min={0}
                max={255}
                value={channel.constant}
                onChange={(e) =>
                  setChannels(
                    channels.map((c, i) =>
                      i === index ? { ...c, constant: Number(e.target.value) } : c,
                    ),
                  )
                }
              />
            </label>
            <label>
              Invert
              <Input
                type="checkbox"
                checked={channel.invert}
                onChange={(e) =>
                  setChannels(
                    channels.map((c, i) => (i === index ? { ...c, invert: e.target.checked } : c)),
                  )
                }
              />
            </label>
          </fieldset>
        ))}
        <Button
          disabled={busy}
          onClick={() =>
            void run((signal) => packChannels(images, channels, width, height, resample, signal))
          }
        >
          Pack channels to PNG
        </Button>
      </details>
      {message && <p role="status">{message}</p>}
      <footer>
        <Button onClick={onClose}>Close</Button>
      </footer>
    </Dialog>
  );
}
