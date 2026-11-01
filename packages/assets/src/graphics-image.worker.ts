import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { HalfFloatType, DataUtils } from "three";
import { inspectGraphicsImage } from "./graphics-images";
self.onmessage = async (
  event: MessageEvent<{ bytes: Uint8Array; environmentResolution: number }>,
) => {
  try {
    const { bytes } = event.data,
      info = inspectGraphicsImage(bytes);
    if (info.format === "hdr") {
      const decoded = new HDRLoader().setDataType(HalfFloatType).parse(bytes.buffer as ArrayBuffer);
      if (decoded.width !== info.width || decoded.height !== info.height)
        throw Error("HDR dimensions changed during decode");
      const width = Math.max(64, Math.min(info.width, event.data.environmentResolution * 4)),
        height = Math.max(32, Math.min(info.height, event.data.environmentResolution * 2));
      if (!(decoded.data instanceof Uint16Array)) throw Error("Expected half-float HDR data");
      let data = decoded.data;
      if (width !== info.width || height !== info.height) {
        data = new Uint16Array(width * height * 4);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++)
            for (let channel = 0; channel < 4; channel++) {
              let total = 0,
                count = 0;
              for (
                let sy = Math.floor((y * info.height) / height);
                sy <
                Math.max(
                  Math.floor((y * info.height) / height) + 1,
                  Math.floor(((y + 1) * info.height) / height),
                );
                sy++
              )
                for (
                  let sx = Math.floor((x * info.width) / width);
                  sx <
                  Math.max(
                    Math.floor((x * info.width) / width) + 1,
                    Math.floor(((x + 1) * info.width) / width),
                  );
                  sx++
                ) {
                  total += DataUtils.fromHalfFloat(
                    decoded.data[(sy * info.width + sx) * 4 + channel],
                  );
                  count++;
                }
              data[(y * width + x) * 4 + channel] = DataUtils.toHalfFloat(total / count);
            }
      }
      self.postMessage({ ...info, width, height, data }, [data.buffer as ArrayBuffer]);
    } else {
      const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), {
        imageOrientation: "flipY",
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
      });
      if (bitmap.width !== info.width || bitmap.height !== info.height) {
        bitmap.close();
        throw Error("Decoded image dimensions mismatch");
      }
      (
        self as unknown as { postMessage(message: unknown, transfer: ImageBitmap[]): void }
      ).postMessage({ ...info, bitmap }, [bitmap]);
    }
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
