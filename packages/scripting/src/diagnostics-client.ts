import type { ScriptAsset } from "../../runtime/src/schema";
import { assetMemory, type Reservation } from "../../assets/src/budget";
export interface SourceDiagnostic {
  file: string;
  line?: number;
  column?: number;
  severity: "error";
  code?: number;
  message: string;
}
/** Incremental TypeScript language service, lazily isolated in a terminable worker. */
export class SourceDiagnostics {
  private worker?: Worker;
  private reservation?: Reservation;
  private sequence = 0;
  private cancel?: () => void;
  check(
    scripts: ScriptAsset[],
    paths: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<SourceDiagnostic[]> {
    this.cancel?.();
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (!scripts.length) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      let settled = false;
      const id = ++this.sequence;
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.cancel = undefined;
        settled = true;
      };
      const stop = (error: unknown) => {
        if (settled) return;
        cleanup();
        this.worker?.terminate();
        this.worker = undefined;
        this.reservation?.release();
        this.reservation = undefined;
        reject(error);
      };
      const abort = () => stop(signal?.reason ?? Error("Type checking superseded"));
      const timer = setTimeout(
        () => stop(Error("Type checking exceeded its 20-second budget")),
        20000,
      );
      this.cancel = abort;
      signal?.addEventListener("abort", abort, { once: true });
      try {
        if (!this.worker) {
          this.reservation = assetMemory.reserve(128 * 1024 * 1024, "typescript-language-service");
          this.worker = new Worker(new URL("./diagnostics.worker.ts", import.meta.url), {
            type: "module",
          });
        }
        this.worker.onerror = (event) => stop(Error(event.message));
        this.worker.onmessageerror = () => stop(Error("Type checker response invalid"));
        this.worker.onmessage = (event) => {
          if (settled || event.data.id !== id) return;
          if (event.data.error) {
            stop(Error(event.data.error));
            return;
          }
          cleanup();
          resolve(event.data.diagnostics as SourceDiagnostic[]);
        };
        this.worker.postMessage({ id, scripts, paths });
      } catch (error) {
        stop(error);
      }
    });
  }
  dispose() {
    this.cancel?.();
    this.worker?.terminate();
    this.worker = undefined;
    this.reservation?.release();
    this.reservation = undefined;
  }
}
