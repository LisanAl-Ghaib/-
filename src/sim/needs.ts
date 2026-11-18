import { clamp } from '../core/math';
import type { AgentCtx } from './ai/types';
import type { Needs, ResidentState } from './state';

/** Изменить потребность на perHour за dt секунд */
export function gain(r: ResidentState, need: keyof Needs, perHour: number, dt: number): void {
  r.needs[need] = clamp(r.needs[need] + (perHour * dt) / 3600, 0, 100);
}

export function bump(r: ResidentState, need: keyof Needs, delta: number): void {
  r.needs[need] = clamp(r.needs[need] + delta, 0, 100);
}

/** Временные причины настроения («поссорился с соседом», «вкусный ужин»…) */
/** Стоики: неприятности задевают их вдвое слабее (заполняет Simulation по тегам) */
export const STOICS = new Set<string>();

export function addMoodlet(ctx: AgentCtx | { r: ResidentState; now: number }, key: string, label: string, value: number, hours: number, instant = 0): void {
  const { r, now } = ctx;
  if (STOICS.has(r.id)) {
    if (value < 0) value = Math.round(value / 2);
    if (instant < 0) instant = Math.round(instant / 2);
  }
  r.moodlets = r.moodlets.filter((m) => m.key !== key);
  r.moodlets.push({ key, label, value, until: now + hours * 3600 });
  if (instant) bump(r, 'mood', instant);
}

export function moodletSum(r: ResidentState): number {
  let s = 0;
  for (const m of r.moodlets) s += m.value;
  return s;
}

const SOCIAL_RATE = { homebody: 0.55, balanced: 1, outgoing: 1.6 } as const;
const OUTLOOK_BASE = { gloomy: 48, neutral: 60, cheerful: 70 } as const;

/** Базовое «проживание» времени: усталость, голод, скука, настроение */
export function updateNeeds(ctx: AgentCtx, dt: number): void {
  const { r, def, now, sim } = ctx;
  const a = r.action;
  const sleeping = a?.phase === 'perform' && (a.id === 'sleep' || a.id === 'nap');
  const age = sim.age(def);
  const sick = r.sick && r.sick.until > now;

  // бодрость
  // ночь за игрой «на азарте» — усталость не берёт до самого утра
  const hooked = r.plan?.allNighter && a?.phase === 'perform' && a.id === 'gaming';
  if (!sleeping && !hooked) gain(r, 'energy', -(4.6 + (age > 65 ? 0.6 : 0) + (sick ? 2 : 0)), dt);
  // сытость
  gain(r, 'food', sleeping ? -1.8 : -4.8, dt);
  // общение
  if (!sleeping) gain(r, 'social', -2.4 * SOCIAL_RATE[def.traits.sociability], dt);
  // туалет: за кадром (на работе, в магазине) — сходит там; после чая и еды — скорее
  if (r.away) {
    if (r.needs.bladder < 80) gain(r, 'bladder', 30, dt);
  } else {
    const drink = a?.phase === 'perform' && a.id === 'tea' ? 18 : a?.phase === 'perform' && a.id === 'eat' ? 8 : 0;
    gain(r, 'bladder', -((sleeping ? 2.6 : 10) + drink + (age > 65 ? 1.5 : 0)), dt);
  }

  // настроение тянется к «цели» — характер + потребности + причины
  const n = r.needs;
  let target = OUTLOOK_BASE[def.traits.outlook] + moodletSum(r);
  if (n.energy < 30) target -= (30 - n.energy) * 0.7;
  if (n.food < 30) target -= (30 - n.food) * 0.8;
  if (n.social < 25) target -= (25 - n.social) * 0.6;
  if (sick) target -= 12;
  target = clamp(target, 3, 97);
  const speed = 5; // пунктов в час
  const d = target - n.mood;
  bump(r, 'mood', Math.sign(d) * Math.min(Math.abs(d), (speed * dt) / 3600));

  // устаревшие причины настроения
  if (r.moodlets.length && r.moodlets.some((m) => m.until <= now)) r.moodlets = r.moodlets.filter((m) => m.until > now);
}
