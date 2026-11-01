import { ensureInlineInit } from "./xz";
import {
  getModule,
  WasmLzmaStream,
  encoderInit,
  decoderInit,
  code,
  end,
  copyToWasm,
  copyFromWasm,
  LZMA_FINISH,
  LZMA_RUN,
  LZMA_OK,
  LZMA_STREAM_END,
} from "node-liblzma/wasm";
/** Pull-based codec: at most one 64 KiB output chunk is produced per consumer advance. */
export async function* xzChunks(
  input: AsyncIterable<Uint8Array>,
  compress: boolean,
  signal?: AbortSignal,
): AsyncGenerator<Uint8Array> {
  await ensureInlineInit();
  const module = getModule(),
    stream = new WasmLzmaStream(module);
  const output = module._malloc(65536);
  let finished = false;
  try {
    if (!output) throw Error("Codec allocation failed");
    if (compress) encoderInit(stream, 6, 4);
    else decoderInit(stream, 256 * 1024 * 1024);
    async function* process(bytes: Uint8Array, finish: boolean) {
      const pointer = bytes.length ? copyToWasm(module, bytes) : 0;
      try {
        stream.setInput(pointer, bytes.length);
        do {
          signal?.throwIfAborted();
          stream.setOutput(output, 65536);
          const result = code(stream, finish ? LZMA_FINISH : LZMA_RUN);
          const count = 65536 - stream.availOut;
          if (result !== LZMA_OK && result !== LZMA_STREAM_END)
            throw Error("XZ stream failure: " + result);
          if (count) yield copyFromWasm(module, output, count);
          if (result === LZMA_STREAM_END) {
            finished = true;
            if (stream.availIn) throw Error("Trailing compressed data");
            break;
          }
          if (!finish && !stream.availIn && stream.availOut) break;
          if (!count && !stream.availIn && finish) throw Error("Truncated XZ stream");
        } while (true);
      } finally {
        if (pointer) module._free(pointer);
      }
    }
    for await (const chunk of input) {
      if (finished && chunk.length) throw Error("Trailing compressed data");
      for (let offset = 0; offset < chunk.length; offset += 65536) {
        if (finished) throw Error("Trailing compressed data");
        yield* process(chunk.subarray(offset, offset + 65536), false);
      }
    }
    if (!finished) yield* process(new Uint8Array(), true);
    if (!finished) throw Error("Truncated XZ stream");
  } finally {
    end(stream);
    stream.free();
    if (output) module._free(output);
  }
}
