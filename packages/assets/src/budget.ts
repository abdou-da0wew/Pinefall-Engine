/** Conservative accounted allocations, not an OS heap/GPU-memory limiter. Shared by host asset services. */
export class MemoryBudget {
  private usedBytes = 0;
  private peakBytes = 0;
  private owners = new Map<number, { kind: string; bytes: number }>();
  private next = 0;
  constructor(readonly limit = 1536 * 1024 * 1024) {}
  get snapshot() {
    return {
      used: this.usedBytes,
      peak: this.peakBytes,
      limit: this.limit,
      reservations: this.owners.size,
    };
  }
  reserve(bytes: number, kind: string) {
    const id = ++this.next;
    let released = false;
    const resize = (next: number) => {
      if (released) throw Error("Reservation already released");
      if (!Number.isSafeInteger(next) || next < 0) throw Error("Invalid memory reservation");
      const old = this.owners.get(id)?.bytes || 0;
      if (this.usedBytes - old + next > this.limit)
        throw Error(
          `Asset memory admission exhausted (${kind}: requested ${Math.ceil(next / 1048576)} MiB; accounted ${Math.ceil(this.usedBytes / 1048576)} MiB); keep the current project and unload unused resources before retrying`,
        );
      this.usedBytes += next - old;
      this.peakBytes = Math.max(this.peakBytes, this.usedBytes);
      this.owners.set(id, { kind, bytes: next });
    };
    resize(bytes);
    return {
      resize,
      release: () => {
        if (released) return;
        released = true;
        this.usedBytes -= this.owners.get(id)?.bytes || 0;
        this.owners.delete(id);
      },
    };
  }
}
export const assetMemory = new MemoryBudget();
export type Reservation = ReturnType<MemoryBudget["reserve"]>;
