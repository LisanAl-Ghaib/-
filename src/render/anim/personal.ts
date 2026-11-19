import type { Mannerism, ResidentDef } from '../../data/schemas';
import type { Beat, Micro, PropKind } from './types';

/**
 * ЛИЧНЫЙ СЛОЙ анимаций — поверх общей библиотеки (library.ts).
 *
 * Правило: личное только ДОБАВЛЯЕТ. Можно:
 *  • добавить свои такты к сцене (той же позы и тех же ракурсов, что у базы);
 *  • заменить вещь в руках на похожую (спицы → пяльцы);
 *  • сдвинуть темп (0.75…1.3) и частоту мелких движений;
 *  • добавить свои мелкие движения (поправить очки, шаль, потереть бороду).
 * Нельзя: убрать базовые такты, поменять позу или ракурс сцены, заменить сценарий.
 * Движок (animation.ts) это гарантирует: чужие позы и ракурсы из добавок отбрасываются.
 *
 * Откуда берутся манеры: явно — `mannerisms` в data/residents/<id>.json,
 * и сами — из уже описанного (очки, шаль, борода, «гиперактивный», «вышивает»…).
 */
export interface Personal {
  /** темп быстрых движений (печатает, мешает, бьёт по струнам) */
  tempo: number;
  /** насколько часто мелкие движения: из 12 окон сколько заняты */
  fidget: number;
  /** вещь → похожая вещь */
  swaps: Partial<Record<PropKind, PropKind>>;
  /** добавочные такты: ключ — id занятия, `id@место` или `*sit` / `*stand` (ко всем сценам позы) */
  extra: Record<string, Beat[]>;
  /** добавочные мелкие движения */
  micro: Micro[];
  /** откуда что взялось (для атласа и проверки) */
  mannerisms: Mannerism[];
}

/** Похожие вещи: заменять можно только внутри пары (то же место в руке) */
export const SWAPPABLE: Partial<Record<PropKind, PropKind[]>> = {
  knitting: ['hoop'],
  cup: [],
};

const CUP = { kind: 'cup', at: 'mouth' } as const;
const PHONE = { kind: 'phone', at: 'hands' } as const;

/** Что делает каждая манера (только добавки) */
const APPLY: Record<Mannerism, (p: Personal) => void> = {
  fidgety: (p) => {
    p.tempo *= 1.25;
    p.fidget += 2;
    p.micro.push('shift', 'look');
  },
  unhurried: (p) => {
    p.tempo *= 0.8;
    p.fidget -= 1;
    add(p, '*sit', { g: 'slouch' });
  },
  adjusts_glasses: (p) => p.micro.push('glasses'),
  adjusts_shawl: (p) => p.micro.push('shawl'),
  strokes_beard: (p) => {
    p.micro.push('beard');
    add(p, 'computer', { g: 'handUp' });
    add(p, 'chess', { g: 'handUp' });
  },
  embroiders: (p) => {
    p.swaps.knitting = 'hoop';
  },
  coffee_lover: (p) => {
    for (const id of ['read', 'work', 'computer', 'side_work']) add(p, id, { g: 'handUp', prop: CUP });
  },
  phone_in_hand: (p) => {
    for (const id of ['idle', 'watch_tv', 'bench']) add(p, id, { g: 'hands', prop: PHONE });
  },
  cross_legged: (p) => add(p, '*sit', { g: 'cross', w: 2 }),
};

function add(p: Personal, key: string, b: Beat) {
  (p.extra[key] ??= []).push(b);
}

/** Манеры, которые видны из уже описанного жильца */
export function autoMannerisms(def: ResidentDef): Mannerism[] {
  const out: Mannerism[] = [];
  const acc = new Set<string>(def.appearance.accessories);
  if (def.traits.activity === 'active') out.push('fidgety');
  if (def.traits.activity === 'lazy') out.push('unhurried');
  if (acc.has('glasses') || acc.has('glasses_big')) out.push('adjusts_glasses');
  if (acc.has('shawl')) out.push('adjusts_shawl');
  if (acc.has('beard')) out.push('strokes_beard');
  if (def.habits.some((h) => h.kind === 'crafts' && /выши/i.test(h.note))) out.push('embroiders');
  if (def.traits.tags.some((t) => /кофе/i.test(t))) out.push('coffee_lover');
  return out;
}

const cache = new WeakMap<ResidentDef, Personal>();

/** Личный слой жильца (считается один раз) */
export function personalOf(def: ResidentDef): Personal {
  let p = cache.get(def);
  if (p) return p;
  const all = [...new Set<Mannerism>([...autoMannerisms(def), ...(def.mannerisms ?? [])])];
  p = { tempo: 1, fidget: 4, swaps: {}, extra: {}, micro: [], mannerisms: all };
  for (const m of all) APPLY[m](p);
  p.tempo = Math.min(1.3, Math.max(0.75, p.tempo));
  p.fidget = Math.min(7, Math.max(2, p.fidget));
  // замены — только на похожие вещи
  for (const [from, to] of Object.entries(p.swaps) as [PropKind, PropKind][]) if (!SWAPPABLE[from]?.includes(to)) delete p.swaps[from];
  cache.set(def, p);
  return p;
}
