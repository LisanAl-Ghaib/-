import { inDailyWindow, minutesUntil } from '../../../core/time';
import { novelty, randomRoom, randomXInRoom } from '../helpers';
import type { ActionDef } from '../types';

const SLEEP_WINDOWS = {
  lark: { bed: 22 * 60, wake: 6 * 60 + 30 },
  neutral: { bed: 23 * 60 + 30, wake: 7 * 60 + 30 },
  owl: { bed: 25 * 60 + 30 - 1440, wake: 9 * 60 + 30 },
};

/** Этап 1: спит ночью по хронотипу */
export const sleep: ActionDef = {
  id: 'sleep',
  icon: 'zzz',
  plan(ctx) {
    const w = SLEEP_WINDOWS[ctx.def.traits.chronotype];
    if (!inDailyWindow(ctx.cal.minuteOfDay, w.bed, w.wake)) return null;
    const slot = ctx.sim.findSlot(ctx.home, 'sleep', ctx.r.id);
    if (!slot) return null;
    const dur = minutesUntil(ctx.cal.minuteOfDay, w.wake) * 60;
    return {
      score: 20,
      target: { level: ctx.home.level, x: slot.x, slot: slot.key },
      duration: dur,
      label: 'спит',
      interruptible: false,
    };
  },
};

/** Ходит по квартире: заглядывает в комнаты, присаживается, смотрит в окно */
export const wander: ActionDef = {
  id: 'wander',
  plan(ctx) {
    const { sim, home, r } = ctx;
    const cur = sim.defs.layout.roomAt(home, r.x);
    const room = randomRoom(ctx, home, cur.index);
    const seat = sim.rng.chance(0.5) ? sim.findSlot(home, 'sit', r.id, room.index) : undefined;
    const target = seat && seat.roomIndex === room.index
      ? { level: home.level, x: seat.x, slot: seat.key }
      : { level: home.level, x: randomXInRoom(ctx, room) };
    return {
      score: 2 * novelty(ctx, 'wander', 600),
      target,
      duration: sim.rng.int(10, 45) * 60,
      label: seat ? `сидит (${room.name})` : `ходит по квартире (${room.name})`,
    };
  },
};

/** Выходит во двор посидеть на лавочке или пройтись */
export const goYard: ActionDef = {
  id: 'go_yard',
  icon: 'leaf',
  plan(ctx) {
    const h = ctx.cal.hourOfDay;
    if (h < 8 || h > 21) return null;
    const Y = ctx.sim.defs.layout.yard;
    const x = ctx.sim.rng.chance(0.5)
      ? ctx.sim.rng.pick(Y.bench.seats)
      : Math.round(ctx.sim.rng.range(Y.x0 + 20, Y.busStop - 20));
    return {
      score: 1.2 * novelty(ctx, 'go_yard', 4 * 3600),
      target: { level: 0, x },
      duration: ctx.sim.rng.int(20, 60) * 60,
      label: 'гуляет во дворе',
    };
  },
};
