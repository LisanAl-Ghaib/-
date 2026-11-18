import { aptState, daytime, gv, homeSlot, minutesToLeave, novelty, roomOfType, roomPoint, sleepTime } from '../helpers';
import type { ActionDef, AgentCtx } from '../types';

/** Насколько жилец аккуратен (по свободным чертам характера) */
function tidiness(ctx: AgentCtx): number {
  const tags = ctx.def.traits.tags.join(' ');
  if (/аккурат|педант|чистопл|порядок/i.test(tags)) return 1;
  if (/неряш|бардак|рассеян|хаос/i.test(tags)) return -0.6;
  return 0;
}

/** Помыть посуду, когда её накопилось */
export const washDishes: ActionDef = {
  id: 'wash_dishes',
  icon: 'wash',
  plan(ctx) {
    const st = aptState(ctx);
    const tidy = tidiness(ctx);
    if (sleepTime(ctx) || st.dishes < (tidy > 0 ? 1 : 2) || minutesToLeave(ctx) < 20) return null;
    const sink = homeSlot(ctx, 'wash', ['kitchen', 'studio']);
    if (!sink || ctx.home.rooms[sink.slot.roomIndex].type === 'bathroom') return null;
    return {
      score: (0.8 + st.dishes * 0.9 + tidy * 2) * novelty(ctx, 'wash_dishes', 2 * 3600),
      target: sink.target,
      duration: Math.min(25, 4 + st.dishes * 2) * 60,
      label: 'моет посуду',
    };
  },
  onEnd(ctx, a, interrupted) {
    if (interrupted && ctx.now - a.performStart < 3 * 60) return;
    aptState(ctx).dishes = 0;
  },
};

/** Заправить кровать */
export const makeBed: ActionDef = {
  id: 'make_bed',
  icon: 'dots',
  plan(ctx) {
    const st = aptState(ctx);
    if (sleepTime(ctx) || !st.unmade.length || minutesToLeave(ctx) < 15) return null;
    const key = st.unmade.find((k) => ctx.sim.isSlotFree(k, ctx.r.id));
    const slot = key ? ctx.sim.slotIndex.get(key) : undefined;
    if (!slot) return null;
    const morning = ctx.cal.hourOfDay < 12 ? 2.5 : 0;
    return {
      score: (1.2 + morning + tidiness(ctx) * 2.2) * novelty(ctx, 'make_bed', 3600),
      target: { level: ctx.home.level, x: slot.x + 6 },
      duration: ctx.sim.rng.int(2, 4) * 60,
      label: 'заправляет кровать',
      data: { slot: slot.key },
    };
  },
  onEnd(ctx, a, interrupted) {
    if (interrupted) return;
    const st = aptState(ctx);
    st.unmade = st.unmade.filter((k) => k !== a.data.slot);
  },
};

/** Разобрать пакеты из магазина */
export const unpack: ActionDef = {
  id: 'unpack',
  icon: 'bag',
  plan(ctx) {
    const st = aptState(ctx);
    if (!st.bags || sleepTime(ctx)) return null;
    const room = roomOfType(ctx.home, 'kitchen', 'hall', 'studio') ?? ctx.home.rooms[0];
    const fridge = homeSlot(ctx, 'fridge');
    return {
      score: 5,
      target: fridge?.target ?? roomPoint(ctx, room),
      duration: ctx.sim.rng.int(5, 10) * 60,
      label: 'разбирает пакеты',
    };
  },
  onEnd(ctx) {
    const st = aptState(ctx);
    st.bags = 0;
    st.trash += 0.4;
  },
};

/** Вынести мусор к бакам во дворе */
export const takeOutTrash: ActionDef = {
  id: 'take_out_trash',
  icon: 'dots',
  plan(ctx) {
    const st = aptState(ctx);
    if (st.trash < 1.5 || sleepTime(ctx) || !daytime(ctx, 7, 22) || minutesToLeave(ctx) < 30) return null;
    const L = ctx.sim.defs.layout;
    return {
      score: (0.6 + st.trash * 1.1 + tidiness(ctx)) * novelty(ctx, 'take_out_trash', 6 * 3600),
      target: { level: 0, x: L.yard.bins + 4 },
      duration: 40,
      label: gv(ctx.def, 'выносит мусор', 'выносит мусор'),
      data: { out: true },
    };
  },
  onStart(ctx) {
    ctx.r.carrying = 'trash';
  },
  onArrive(ctx) {
    ctx.r.carrying = null;
    aptState(ctx).trash = 0;
    return true;
  },
  onEnd(ctx) {
    if (ctx.r.carrying === 'trash') ctx.r.carrying = null;
  },
};
