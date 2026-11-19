import { circleWindow } from '../circle';
import type { HabitKind, ResidentDef, RoomType } from '../../data/schemas';
import type { ApartmentModel, RoomModel, SlotInstance } from '../../world/layout';
import type { Target } from '../../world/navigation';
import type { ApartmentState } from '../state';
import type { AgentCtx } from './types';

export function randomXInRoom(ctx: AgentCtx, room: RoomModel): number {
  return Math.round(ctx.sim.rng.range(room.x0 + 5, room.x1 - 5));
}

export function randomRoom(ctx: AgentCtx, apt: ApartmentModel, exceptIndex?: number): RoomModel {
  const rooms = apt.rooms.filter((r) => r.index !== exceptIndex && r.type !== 'bathroom');
  return ctx.sim.rng.pick(rooms.length ? rooms : apt.rooms);
}

export function roomOfType(apt: ApartmentModel, ...types: RoomType[]): RoomModel | undefined {
  for (const t of types) {
    const r = apt.rooms.find((x) => x.type === t);
    if (r) return r;
  }
  return undefined;
}

export function isHome(ctx: AgentCtx): boolean {
  const { r, home } = ctx;
  return !r.away && r.level === home.level && r.x >= home.x0 && r.x < home.x1;
}

/** Сколько секунд прошло с последнего выполнения действия (Infinity — никогда) */
export function since(ctx: AgentCtx, actionId: string): number {
  const t = ctx.r.recent[actionId];
  return t === undefined ? Infinity : ctx.now - t;
}

/** Множитель «надоело»: только что делал — меньше хочется */
export function novelty(ctx: AgentCtx, actionId: string, cooldown: number): number {
  const s = since(ctx, actionId);
  if (s === Infinity) return 1;
  return Math.min(1, 0.2 + (0.8 * s) / cooldown);
}

/** Срочность потребности: 0 при 70+, 10 при нуле */
export function urgency(value: number, threshold = 70): number {
  if (value >= threshold) return 0;
  return Math.pow((threshold - value) / threshold, 1.5) * 10;
}

/** Окончание глагола по роду: gv(def, 'ушёл', 'ушла') */
export function gv(def: ResidentDef, m: string, f: string): string {
  return def.gender === 'f' ? f : m;
}

export function habit(ctx: AgentCtx, kind: HabitKind): number {
  return ctx.def.habits.find((h) => h.kind === kind)?.strength ?? 0;
}

export function aptState(ctx: AgentCtx): ApartmentState {
  return ctx.sim.aptState(ctx.home.id);
}

export function householdIds(ctx: AgentCtx): string[] {
  return ctx.sim.defs.residents.filter((d) => d.apartment === ctx.home.id).map((d) => d.id);
}

/** Цель — свободный слот мебели нужного типа дома (предпочтительно в комнате нужного типа) */
export function homeSlot(ctx: AgentCtx, use: string, prefer?: RoomType[]): { target: Target; slot: SlotInstance } | null {
  const { sim, home, r } = ctx;
  let slot: SlotInstance | undefined;
  if (prefer) {
    for (const t of prefer) {
      const room = home.rooms.find((x) => x.type === t);
      if (!room) continue;
      slot = sim.findSlot(home, use, r.id, room.index);
      if (slot && slot.roomIndex === room.index) break;
      slot = undefined;
    }
  }
  slot ??= sim.findSlot(home, use, r.id);
  if (!slot) return null;
  return { target: { level: home.level, x: slot.x, slot: slot.key }, slot };
}

export function roomPoint(ctx: AgentCtx, room: RoomModel): Target {
  return { level: ctx.home.level, x: randomXInRoom(ctx, room) };
}

export type Meal = 'breakfast' | 'lunch' | 'dinner';

/** Какая еда «по расписанию» сейчас уместна */
export function mealDue(ctx: AgentCtx, lead = 0): Meal | null {
  const p = ctx.r.plan;
  const t = ctx.r.today;
  if (!p) return null;
  const n = ctx.now + lead;
  if (!t.breakfast && n >= p.breakfastAt - 20 * 60 && n < p.breakfastAt + 2.5 * 3600) return 'breakfast';
  if (!t.lunch && n >= p.lunchAt - 30 * 60 && n < p.lunchAt + 2.5 * 3600) return 'lunch';
  if (!t.dinner && n >= p.dinnerAt - 45 * 60 && n < p.dinnerAt + 3.5 * 3600) return 'dinner';
  return null;
}

export const MEAL_WORD: Record<Meal, { cook: string; eat: string }> = {
  breakfast: { cook: 'готовит завтрак', eat: 'завтракает' },
  lunch: { cook: 'готовит обед', eat: 'обедает' },
  dinner: { cook: 'готовит ужин', eat: 'ужинает' },
};

/** Ночь по распорядку жильца? */
export function sleepTime(ctx: AgentCtx): boolean {
  const p = ctx.r.plan;
  if (!p) return false;
  return ctx.now >= p.bedAt || ctx.now < p.wakeAt;
}

/** Минут до отбоя */
export function minutesToBed(ctx: AgentCtx): number {
  const p = ctx.r.plan;
  return p ? (p.bedAt - ctx.now) / 60 : 999;
}

/** Не пора ли уже собираться на работу (чтобы не затевать долгое) */
export function minutesToLeave(ctx: AgentCtx): number {
  const p = ctx.r.plan;
  // свой кружок дома («по субботам шахматы с детьми») — к этому часу надо быть дома
  const w = ctx.def.circle ? circleWindow(ctx.sim, ctx.def.id) : null;
  const circle = w && ctx.now < w.end ? Math.max(0, (w.start - 15 * 60 - ctx.now) / 60) : 9999;
  if (!p || !p.workday || p.leaveAt === null || ctx.r.today.worked) return circle;
  return Math.min(circle, (p.leaveAt - ctx.now) / 60);
}

/** Длительность, обрезанная так, чтобы успеть к выходу на работу/ко сну */
export function fitDuration(ctx: AgentCtx, seconds: number): number {
  const lim = Math.min(minutesToLeave(ctx), Math.max(10, minutesToBed(ctx))) * 60 - 5 * 60;
  return Math.max(5 * 60, Math.min(seconds, lim > 0 ? lim : seconds));
}

export function daytime(ctx: AgentCtx, from = 7, to = 22): boolean {
  const h = ctx.cal.hourOfDay;
  return h >= from && h < to;
}
