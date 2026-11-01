import type { GraphicsImage } from "../../runtime/src/image-definition";
import type { PackChannel } from "./channel-pack.worker";
import { graphicsImageBytes, importGraphicsImage } from "./graphics-images";
import { assetMemory } from "./budget";
export type { PackChannel };
export async function packChannels(
  images: GraphicsImage[],
  channels: PackChannel[],
  width: number,
  height: number,
  resample: "reject" | "nearest",
  signal: AbortSignal,
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 2048 ||
    height > 2048 ||
    channels.length !== 4
  )
    throw Error("Channel packing dimensions/budget");
  const ids = new Set(channels.flatMap((channel) => (channel.image ? [channel.image] : [])));
  const sources = [];
  let budget = width * height * 12 + 16 * 1024 * 1024;
  for (const id of ids) {
    const image = images.find((image) => image.id === id);
    if (!image || image.format === "hdr") throw Error("Missing LDR channel source");
    budget += image.width * image.height * 8 + 32 * 1024 * 1024;
    sources.push(image);
  }
  const reservation = assetMemory.reserve(budget, "channel-packing");
  try {
    const inventory: Array<{ id: string; bytes: Uint8Array<ArrayBuffer> }> = [];
    for (const source of sources) {
      signal.throwIfAborted();
      inventory.push({ id: source.id, bytes: (await graphicsImageBytes(source)).slice() });
    }
    signal.throwIfAborted();
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const worker = new Worker(new URL("./channel-pack.worker.ts", import.meta.url), {
        type: "module",
      });
      const cleanup = () => {
        worker.terminate();
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        cleanup();
        reject(signal.reason ?? Error("Channel packing cancelled"));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(Error("Channel packing exceeded 30 seconds"));
      }, 30000);
      signal.addEventListener("abort", abort, { once: true });
      worker.onerror = (event) => {
        cleanup();
        reject(Error(event.message));
      };
      worker.onmessage = (event) => {
        cleanup();
        if (event.data.error) reject(Error(event.data.error));
        else resolve(event.data.bytes);
      };
      if (signal.aborted) {
        abort();
        return;
      }
      worker.postMessage(
        { width, height, resample, channels, images: inventory },
        inventory.map((image) => image.bytes.buffer),
      );
    });
    signal.throwIfAborted();
    return await importGraphicsImage(
      new File([bytes as BlobPart], "Packed channels.png", { type: "image/png" }),
    );
  } finally {
    reservation.release();
  }
}
