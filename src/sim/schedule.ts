import { calendar, DAY, dayStartTime, parseHHMM } from '../core/time';
import type { AgentCtx } from './ai/types';
import type { DailyPlan } from './state';

/** «Логические сутки» начинаются в 04:00 — так сова, легшая в 2 ночи, ещё «во вчера». */
export const DAY_CUT = 4 * 3600;

export function logicalDay(epochMs: number, t: number): number {
  return Math.floor((t - dayStartTime(epochMs, 0) - DAY_CUT) / DAY);
}

export function logicalDayStart(epochMs: number, day: number): number {
  return dayStartTime(epochMs, day) + DAY_CUT;
}

const CHRONO = {
  lark: { wake: 6 * 60, bed: 22 * 60 },
  neutral: { wake: 7 * 60 + 15, bed: 23 * 60 + 15 },
  owl: { wake: 9 * 60 + 30, bed: 25 * 60 + 30 },
} as const;

const COMMUTERS = new Set(['office', 'shift', 'student', 'school']);
const HOME_WORKERS = new Set(['remote', 'freelance', 'onsite']);

export function isCommuter(kind: string): boolean {
  return COMMUTERS.has(kind);
}
export function worksFromHome(kind: string): boolean {
  return HOME_WORKERS.has(kind);
}

/** Распорядок дня: из работы, хронотипа и капли случайности. */
export function makePlan(ctx: AgentCtx, day: number): DailyPlan {
  const { def, sim, r } = ctx;
  const rng = sim.rng;
  const start = logicalDayStart(sim.defs.epochMs, day);
  // календарный день, к которому относятся эти сутки
  const weekday = calendar(sim.defs.epochMs, start + 8 * 3600).weekday;
  const occ = def.occupation;
  const sched = occ.schedule;
  const sick = !!(r.sick && r.sick.until > start + 6 * 3600);
  const workday = !!sched && sched.days.includes(weekday) && (isCommuter(occ.kind) || worksFromHome(occ.kind)) && !sick;
  const ch = CHRONO[def.traits.chronotype];
  const age = sim.age(def);
  const weekend = weekday >= 6;

  let wake = ch.wake + rng.gauss(0, 12) + (workday ? 0 : weekend ? 50 : 25) - (age >= 65 ? 30 : 0);
  let bed = ch.bed + rng.gauss(0, 18) + (weekday === 5 || weekday === 6 ? 40 : 0) - (age >= 70 ? 30 : 0);
  // бессонница: многие ночи ложится сильно позже
  if (def.traits.tags.some((t) => /бессонн|не спится|плохо спит/i.test(t)) && rng.chance(0.65)) bed += rng.range(60, 200);
  // «иногда играет ночами до четырёх утра» — а потом всё равно ложится
  const allNighter = def.traits.tags.some((t) => /ночами .*игра|играет .*ночами|до 4 утра|до четырёх/i.test(t)) && rng.chance(weekday === 5 || weekday === 6 ? 0.3 : 0.12);
  if (allNighter) bed = 28 * 60 + rng.int(-10, 20);

  let leave: number | null = null;
  let ws: number | null = null;
  let we: number | null = null;
  if (workday && sched) {
    ws = parseHHMM(sched.start);
    we = parseHHMM(sched.end);
    if (we <= ws) we += 1440;
    const commute = worksFromHome(occ.kind) ? 0 : occ.commuteMinutes;
    leave = ws - commute - 4;
    const prep = worksFromHome(occ.kind) ? 25 + rng.int(0, 15) : 55 + rng.int(0, 15);
    wake = Math.min(wake, leave - prep);
    if (wake < 4 * 60 + 30) wake = 4 * 60 + 30;
  }
  wake = Math.max(4 * 60 + 15, wake);
  const abs = (min: number) => start + Math.round((min - 240) * 60);
  const dinner = def.traits.chronotype === 'owl' ? 20 * 60 + 30 : def.traits.chronotype === 'lark' ? 18 * 60 + 30 : 19 * 60 + 15;
  return {
    day,
    wakeAt: abs(wake),
    bedAt: abs(bed < 240 ? bed + 1440 : bed),
    workday,
    leaveAt: leave !== null ? abs(leave) : null,
    workStartAt: ws !== null ? abs(ws) : null,
    workEndAt: we !== null ? abs(we) : null,
    breakfastAt: abs(wake + 20 + rng.int(0, 15)),
    lunchAt: abs(13 * 60 + rng.gauss(0, 20)),
    dinnerAt: abs(dinner + rng.gauss(0, 20)),
    allNighter: allNighter || undefined,
  };
}

/** Обновляет распорядок при смене логических суток. true — начались новые сутки */
export function ensurePlan(ctx: AgentCtx): boolean {
  const day = logicalDay(ctx.sim.defs.epochMs, ctx.now);
  const r = ctx.r;
  if (r.plan?.day === day) return false;
  r.plan = makePlan(ctx, day);
  r.today = { day, breakfast: false, lunch: false, dinner: false, worked: 0, washed: false };
  return true;
}
