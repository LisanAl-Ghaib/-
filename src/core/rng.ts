/**
 * Детерминированный генератор случайных чисел (sfc32).
 * Состояние — 4 uint32, хранится в WorldState и сохраняется вместе с миром.
 * Вся симуляция обязана использовать только его.
 */
export type RngState = [number, number, number, number];

export function seedState(seed: number | string): RngState {
  // xmur3-подобное хеширование строки/числа в 4 слова
  const str = String(seed);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const next = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
  const s: RngState = [next(), next(), next(), next()];
  // прогрев
  const r = new Rng(s);
  for (let i = 0; i < 15; i++) r.next();
  return r.state;
}

export class Rng {
  state: RngState;

  constructor(state: RngState) {
    this.state = state;
  }

  static fromSeed(seed: number | string): Rng {
    return new Rng(seedState(seed));
  }

  /** [0, 1) */
  next(): number {
    const s = this.state;
    let a = s[0] >>> 0, b = s[1] >>> 0, c = s[2] >>> 0, d = s[3] >>> 0;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    s[0] = a; s[1] = b; s[2] = c; s[3] = d;
    return t / 4294967296;
  }

  /** [min, max) */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** целое в [min, max] включительно */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: empty array');
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** выбор по весам; веса <= 0 игнорируются */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const it of items) {
      const w = Math.max(0, weight(it));
      if (r < w) return it;
      r -= w;
    }
    return items[items.length - 1];
  }

  /** приблизительно нормальное распределение (сумма трёх равномерных) */
  gauss(mean: number, sd: number): number {
    const u = (this.next() + this.next() + this.next() - 1.5) * 2; // ~[-3,3], sd≈1
    return mean + u * sd;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** Небольшой хеш строки → uint32 (для стабильных «случайных» деталей рендера). */
export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
