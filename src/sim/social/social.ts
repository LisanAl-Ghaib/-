import { clamp } from '../../core/math';
import { addMoodlet, bump } from '../needs';
import { nameCase } from '../chronicle/russian';
import type { Simulation } from '../simulation';
import { adjust, clearConflict, isFamily, rel, remember, setConflict } from './relations';

const TEMPER = { calm: -0.5, even: 0, hot: 1 } as const;

/** Насколько «искрит» между двумя (0..1): плохое настроение, характер, неприязнь, усталость */
export function tension(sim: Simulation, a: string, b: string): number {
  const ra = sim.state.residents[a];
  const rb = sim.state.residents[b];
  const da = sim.defs.residentById.get(a)!;
  const db = sim.defs.residentById.get(b)!;
  let t = 0.03;
  for (const [r, d] of [[ra, da], [rb, db]] as const) {
    if (r.needs.mood < 40) t += (40 - r.needs.mood) / 160;
    if (r.needs.energy < 25) t += 0.06;
    if (r.needs.food < 20) t += 0.05;
    t += TEMPER[d.traits.temper] * 0.06;
  }
  const aff = (rel(sim, a, b).affinity + rel(sim, b, a).affinity) / 2;
  if (aff < 0) t += -aff / 250;
  else t -= aff / 900;
  if (rel(sim, a, b).conflict) t += 0.12;
  // «ни с кем не в ссоре», «никакой грубости»: с таким не поругаешься
  if ([da, db].some((d) => d.traits.tags.some((x) => /ни с кем не в ссоре|никакой грубости/i.test(x)))) return 0;
  return clamp(t, 0, 0.8);
}

const NEIGHBOR_CAUSES = [
  'из-за шума по вечерам',
  'из-за того, кто должен мыть подъезд',
  'из-за сплетен',
  'из-за долга в пятьсот рублей',
  'из-за политики',
  'из-за велосипеда в коридоре',
  'из-за протечки с верхнего этажа',
  'из-за музыки за стенкой',
  'из-за пустяка, а потом уже из принципа',
  'из-за старой обиды',
];
const FAMILY_CAUSES = [
  'из-за немытой посуды',
  'из-за денег',
  'из-за того, кто выносит мусор',
  'из-за пульта от телевизора',
  'из-за того, что кто-то опять опоздал',
  'из-за планов на выходные',
  'из-за родственников',
  'из-за разбросанных носков',
];

export function quarrelCause(sim: Simulation, a: string, b: string): string {
  return sim.rng.pick(isFamily(rel(sim, a, b)) ? FAMILY_CAUSES : NEIGHBOR_CAUSES);
}

/** Ссора: отношения, настроение, конфликт, значки над головой */
export function quarrel(sim: Simulation, a: string, b: string, cause: string): void {
  const sev = sim.rng.range(0.4, 1);
  for (const [x, y] of [[a, b], [b, a]]) {
    const dx = sim.defs.residentById.get(x)!;
    const hot = dx.traits.temper === 'hot' ? 1.3 : dx.traits.temper === 'calm' ? 0.7 : 1;
    adjust(sim, x, y, -Math.round((8 + 12 * sev) * hot), 2, false);
    const r = sim.state.residents[x];
    addMoodlet({ r, now: sim.time }, `quarrel:${y}`, `${dx.gender === 'f' ? 'Поссорилась' : 'Поссорился'} с ${nameCase(sim.defs.residentById.get(y)!, 'ins')}`, -Math.round(8 + 8 * sev), 30, -8);
    r.bubble = { icon: 'anger', until: sim.time + 20 * 60 };
  }
  setConflict(sim, a, b, cause, sev);
  remember(sim, a, b, 'quarrel');
}

/** Примирение */
export function reconcile(sim: Simulation, a: string, b: string): void {
  clearConflict(sim, a, b);
  for (const [x, y] of [[a, b], [b, a]]) {
    const r = sim.state.residents[x];
    r.intents = r.intents.filter((i) => !(i.target === y && i.kind === 'apologize'));
  }
  adjust(sim, a, b, 10, 3);
  for (const [x, y] of [[a, b], [b, a]]) {
    const r = sim.state.residents[x];
    r.moodlets = r.moodlets.filter((m) => m.key !== `quarrel:${y}`);
    const dx = sim.defs.residentById.get(x)!;
    addMoodlet({ r, now: sim.time }, `peace:${y}`, `${dx.gender === 'f' ? 'Помирилась' : 'Помирился'} с ${nameCase(sim.defs.residentById.get(y)!, 'ins')}`, 8, 12, 6);
    r.bubble = { icon: 'heart', until: sim.time + 20 * 60 };
  }
  remember(sim, a, b, 'reconcile');
}

/** Приятный разговор */
export function goodTalk(sim: Simulation, a: string, b: string, minutes: number): void {
  const k = minutes / 30;
  adjust(sim, a, b, sim.rng.range(1, 3.5) * k, 3 * k);
  for (const x of [a, b]) bump(sim.state.residents[x], 'mood', 2 * k);
  remember(sim, a, b, 'talk');
}

/** Насколько a хочет общаться с b прямо сейчас (для выбора, к кому идти) */
export function warmth(sim: Simulation, a: string, b: string): number {
  const r = rel(sim, a, b);
  if (r.conflict) return 0;
  return Math.max(0, r.affinity + 25) / 50 * (r.familiarity / 100 + 0.35);
}

export const GIFTS = ['коробку конфет', 'цветы', 'торт', 'банку домашнего варенья', 'книгу', 'шарф собственной вязки', 'бутылку вина', 'открытку'];
export const CARE_GIFTS = ['горячего бульона', 'малинового варенья', 'лекарства из аптеки', 'апельсины', 'мёд и лимон'];
export const APOLOGY_GIFTS = ['цветами', 'тортом', 'шоколадкой', 'бутылкой вина', 'пирогом'];
