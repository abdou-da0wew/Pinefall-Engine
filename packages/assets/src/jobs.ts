import { assetMemory } from "./budget";
export interface JobUpdate {
  id: string;
  stage: string;
  elapsedMs: number;
}
interface Pending {
  run: () => Promise<void>;
  reject: (e: Error) => void;
  signal?: AbortSignal;
  abort: () => void;
}
/** FIFO admission. Cancellation removes queued work, active work owns a disposable worker. */
export class JobQueue {
  private pending: Pending[] = [];
  private active = false;
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Cancelled", "AbortError"));
        return;
      }
      if (this.pending.length >= 32) {
        reject(Error("Import queue is full"));
        return;
      }
      const entry: Pending = {
        signal,
        reject,
        abort: () => {
          this.pending = this.pending.filter((x) => x !== entry);
          reject(new DOMException("Cancelled", "AbortError"));
        },
        run: async () => {
          try {
            signal?.throwIfAborted();
            resolve(await task());
          } catch (e) {
            reject(e);
          }
        },
      };
      signal?.addEventListener("abort", entry.abort, { once: true });
      this.pending.push(entry);
      this.next();
    });
  }
  private next() {
    if (this.active) return;
    const p = this.pending.shift();
    if (!p) return;
    p.signal?.removeEventListener("abort", p.abort);
    this.active = true;
    void p.run().finally(() => {
      this.active = false;
      this.next();
    });
  }
}
export const modelQueue = new JobQueue();
export function workerJob<T>(
  createWorker: () => Worker,
  payload: unknown,
  signal?: AbortSignal,
  onStage?: (update: JobUpdate) => void,
  reservationBytes = 128 * 1024 * 1024,
  transfer: Transferable[] = [],
): Promise<T> {
  const id = crypto.randomUUID(),
    start = performance.now();
  onStage?.({ id, stage: "queued", elapsedMs: 0 });
  return modelQueue.run(
    () =>
      new Promise<T>((resolve, reject) => {
        signal?.throwIfAborted();
        const reservation = assetMemory.reserve(reservationBytes, "import-worker");
        let worker: Worker;
        try {
          worker = createWorker();
        } catch (error) {
          reservation.release();
          throw error;
        }
        let settled = false;
        const cleanup = () => {
          worker.terminate();
          reservation.release();
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
        };
        const finish = (error?: unknown, result?: T) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (error) reject(error);
          else resolve(result!);
        };
        const abort = () => finish(new DOMException("Import cancelled", "AbortError"));
        const timer = setTimeout(
          () => finish(Error("Import worker timed out after 600 seconds")),
          600_000,
        );
        signal?.addEventListener("abort", abort, { once: true });
        worker.onmessage = (e) => {
          if (e.data.stage) {
            try {
              onStage?.({ id, stage: e.data.stage, elapsedMs: performance.now() - start });
            } catch (error) {
              finish(error);
            }
          } else if (e.data.error) finish(Error(e.data.error));
          else finish(undefined, e.data);
        };
        worker.onerror = (e) => finish(Error(e.message || "Import worker failed"));
        worker.onmessageerror = () => finish(Error("Import worker message could not be decoded"));
        try {
          worker.postMessage(payload, transfer);
        } catch (e) {
          finish(e);
        }
      }),
    signal,
  );
}
