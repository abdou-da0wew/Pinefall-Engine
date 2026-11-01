import { encodeChannelPNG, decodeChannelPNG } from "./png-channels";
import { inspectGraphicsImage } from "./graphics-images";
export interface PackChannel {
  image?: string;
  channel: 0 | 1 | 2 | 3;
  invert: boolean;
  constant: number;
}
export interface PackRequest {
  width: number;
  height: number;
  resample: "reject" | "nearest";
  channels: PackChannel[];
  images: Array<{ id: string; bytes: Uint8Array }>;
}
self.onmessage = async (event: MessageEvent<PackRequest>) => {
  try {
    const request = event.data;
    if (
      [request.width, request.height].some((n) => !Number.isInteger(n) || n < 1 || n > 2048) ||
      request.channels.length !== 4 ||
      request.images.length > 4 ||
      !["reject", "nearest"].includes(request.resample)
    )
      throw Error("Invalid channel packing budget/policy");
    const sources = new Map<
      string,
      { width: number; height: number; pixels: Uint8ClampedArray | Uint8Array }
    >();
    for (const image of request.images) {
      const info = inspectGraphicsImage(image.bytes);
      if (info.format === "hdr") throw Error("Channel packing accepts LDR images only");
      if (
        request.resample === "reject" &&
        (info.width !== request.width || info.height !== request.height)
      )
        throw Error(
          "Packing dimensions differ; explicitly choose nearest resampling or matching images",
        );
      if (info.format === "png") {
        sources.set(image.id, await decodeChannelPNG(image.bytes));
        continue;
      }
      const bitmap = await createImageBitmap(new Blob([image.bytes as BlobPart]), {
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
      });
      try {
        const canvas = new OffscreenCanvas(info.width, info.height),
          context = canvas.getContext("2d");
        if (!context) throw Error("Packing canvas unavailable");
        context.drawImage(bitmap, 0, 0);
        sources.set(image.id, {
          ...info,
          pixels: context.getImageData(0, 0, info.width, info.height).data,
        });
      } finally {
        bitmap.close();
      }
    }
    for (const channel of request.channels)
      if (
        ![0, 1, 2, 3].includes(channel.channel) ||
        typeof channel.invert !== "boolean" ||
        !Number.isInteger(channel.constant) ||
        channel.constant < 0 ||
        channel.constant > 255 ||
        (channel.image && !sources.has(channel.image))
      )
        throw Error("Invalid source channel");
    const pixels = new Uint8ClampedArray(request.width * request.height * 4);
    for (let y = 0; y < request.height; y++)
      for (let x = 0; x < request.width; x++)
        for (let c = 0; c < 4; c++) {
          const channel = request.channels[c],
            source = channel.image ? sources.get(channel.image) : undefined;
          const value = source
            ? source.pixels[
                (Math.min(source.height - 1, Math.floor((y * source.height) / request.height)) *
                  source.width +
                  Math.min(source.width - 1, Math.floor((x * source.width) / request.width))) *
                  4 +
                  channel.channel
              ]
            : channel.constant;
          pixels[(y * request.width + x) * 4 + c] = channel.invert ? 255 - value : value;
        }
    const bytes = await encodeChannelPNG(request.width, request.height, pixels);
    self.postMessage({ bytes }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
