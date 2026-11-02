export const WEAPONS = [
  {
    name: "WARDEN / 9mm",
    capacity: 15,
    reserve: 120,
    damage: 34,
    interval: 0.22,
    reload: 1.45,
    pellets: 1,
    spread: 0.008,
  },
  {
    name: "RELIQUARY / 12g",
    capacity: 6,
    reserve: 36,
    damage: 27,
    interval: 0.85,
    reload: 2.4,
    pellets: 6,
    spread: 0.065,
  },
] as const;
export function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export class Combat {
  health = 100;
  stamina = 100;
  wave = 0;
  kills = 0;
  score = 0;
  weapon = 0;
  magazines: number[] = WEAPONS.map((w) => w.capacity);
  reserves: number[] = WEAPONS.map((w) => w.reserve);
  cooldown = 0;
  reloading = 0;
  dead = false;
  tick(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading > 0) {
      this.reloading = Math.max(0, this.reloading - dt);
      if (this.reloading === 0) {
        const i = this.weapon,
          n = Math.min(WEAPONS[i].capacity - this.magazines[i], this.reserves[i]);
        this.magazines[i] += n;
        this.reserves[i] -= n;
      }
    }
  }
  switchTo(i: number) {
    if (this.dead || i < 0 || i > 1 || i === this.weapon) return false;
    this.weapon = i;
    this.reloading = 0;
    this.cooldown = Math.max(this.cooldown, 0.3);
    return true;
  }
  reload() {
    const i = this.weapon;
    if (
      this.dead ||
      this.reloading ||
      !this.reserves[i] ||
      this.magazines[i] === WEAPONS[i].capacity
    )
      return false;
    this.reloading = WEAPONS[i].reload;
    return true;
  }
  fire() {
    if (this.dead || this.reloading || this.cooldown > 0 || this.magazines[this.weapon] <= 0)
      return false;
    this.magazines[this.weapon]--;
    this.cooldown = WEAPONS[this.weapon].interval;
    return true;
  }
  damage(n: number) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - n);
    this.dead = this.health === 0;
  }
  supply() {
    if (this.dead) return;
    this.health = Math.min(100, this.health + 35);
    this.reserves[0] = Math.min(180, this.reserves[0] + 45);
    this.reserves[1] = Math.min(60, this.reserves[1] + 12);
  }
}
/** One shared four-neighbour distance field, rebuilt at most twice a second. No per-actor A*. */
export class FlowField {
  readonly size = 80;
  readonly cell = 2;
  readonly half = 80;
  blocked = new Uint8Array(6400);
  distance = new Int16Array(6400);
  private queue = new Int16Array(6400);
  index(x: number, z: number) {
    const a = Math.floor((x + this.half) / this.cell),
      b = Math.floor((z + this.half) / this.cell);
    return a < 0 || b < 0 || a >= this.size || b >= this.size ? -1 : b * this.size + a;
  }
  obstacle(x: number, z: number, w: number, d: number) {
    for (let b = 0; b < this.size; b++)
      for (let a = 0; a < this.size; a++) {
        const px = a * 2 - 79,
          pz = b * 2 - 79;
        if (Math.abs(px - x) <= w / 2 + 0.7 && Math.abs(pz - z) <= d / 2 + 0.7)
          this.blocked[b * this.size + a] = 1;
      }
  }
  rebuild(x: number, z: number) {
    this.distance.fill(-1);
    const target = this.index(x, z);
    if (target < 0) return;
    let read = 0,
      write = 1;
    this.queue[0] = target;
    this.distance[target] = 0;
    while (read < write) {
      const i = this.queue[read++];
      for (const n of this.neighbours(i)) {
        if (this.blocked[n] || this.distance[n] >= 0) continue;
        this.distance[n] = this.distance[i] + 1;
        this.queue[write++] = n;
      }
    }
  }
  private neighbours(i: number) {
    const a = i % this.size,
      b = Math.floor(i / this.size);
    const out: number[] = [];
    if (a > 0) out.push(i - 1);
    if (a < this.size - 1) out.push(i + 1);
    if (b > 0) out.push(i - this.size);
    if (b < this.size - 1) out.push(i + this.size);
    return out;
  }
  direction(x: number, z: number, tx: number, tz: number): [number, number] {
    const i = this.index(x, z);
    if (i < 0) return [0, 0];
    let best = i;
    for (const n of this.neighbours(i))
      if (
        !this.blocked[n] &&
        this.distance[n] >= 0 &&
        (this.distance[best] < 0 || this.distance[n] < this.distance[best])
      )
        best = n;
    if (best === i && this.distance[i] > 1) return [0, 0];
    const dx = this.distance[i] <= 1 ? tx - x : (best % this.size) * 2 - 79 - x,
      dz = this.distance[i] <= 1 ? tz - z : Math.floor(best / this.size) * 2 - 79 - z,
      len = Math.hypot(dx, dz) || 1;
    return [dx / len, dz / len];
  }
}
