import createLZMA from "node-liblzma/wasm/liblzma.js";
import { initModule } from "node-liblzma/wasm";
import { XZ_WASM_BASE64 } from "./xz-binary";
export { xzAsync } from "node-liblzma/wasm";
// The dependency's inline artifact is mismatched in 5.1.3. Use its matching pinned binary.
export function ensureInlineInit() {
  return initModule(() =>
    createLZMA({
      wasmBinary: Uint8Array.from(atob(XZ_WASM_BASE64), (c) => c.charCodeAt(0)).buffer,
    }),
  );
}
