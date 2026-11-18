import { addMoodlet, gain } from '../../needs';
import { isCommuter, worksFromHome } from '../../schedule';
import { gv, homeSlot, minutesToLeave, roomOfType, roomPoint, sleepTime } from '../helpers';
import type { ActionDef, AgentCtx } from '../types';

function workLabel(ctx: AgentCtx): string {
  const k = ctx.def.occupation.kind;
  if (k === 'student') return gv(ctx.def, 'поехал на пары', 'поехала на пары');
  if (k === 'school') return gv(ctx.def, 'поехал на учёбу', 'поехала на учёбу');
  if (k === 'shift') return gv(ctx.def, 'поехал на смену', 'поехала на смену');
  return gv(ctx.def, 'поехал на работу', 'поехала на работу');
}

/** Уйти на работу (уходит с экрана и возвращается вечером) */
export const goToWork: ActionDef = {
  id: 'go_to_work',
  icon: 'work',
  plan(ctx) {
    const { r, def } = ctx;
    const p = r.plan;
    if (!p || !p.workday || !isCommuter(def.occupation.kind) || r.today.worked) return null;
    if (p.leaveAt === null || p.workEndAt === null) return null;
    if (ctx.now < p.leaveAt - 8 * 60 || ctx.now > p.workEndAt - 60 * 60) return null;
    const commute = def.occupation.commuteMinutes * 60;
    const walk = def.occupation.commute === 'walk';
    return {
      score: 40,
      target: { level: 0, x: ctx.sim.defs.layout.yard.offscreenX, away: true },
      duration: Math.max(600, p.workEndAt + commute - ctx.now),
      label: walk ? workLabel(ctx).replace('поехала', 'пошла').replace('поехал', 'пошёл') : workLabel(ctx),
      via: walk ? 'walk' : 'bus',
      interruptible: false,
      data: { returnAt: p.workEndAt + commute, out: true },
    };
  },
  onArrive(ctx, a) {
    const k = ctx.def.occupation.kind;
    a.label = k === 'student' ? 'на парах' : k === 'school' ? 'на учёбе' : k === 'shift' ? 'на смене' : 'на работе';
    a.endsAt = Number(a.data.returnAt);
    ctx.sim.emit({ type: 'left-for-work', t: ctx.now, residentId: ctx.r.id });
    return true;
  },
  perform(ctx, _a, dt) {
    const { r } = ctx;
    gain(r, 'energy', -1.2, dt);
    gain(r, 'social', 4.5, dt);
    // обед на работе
    if (!r.today.lunch && r.plan && ctx.now >= r.plan.lunchAt) {
      r.today.lunch = true;
      r.needs.food = Math.min(100, r.needs.food + 50);
    }
  },
  shouldEnd(ctx, a) {
    return ctx.now >= Number(a.data.returnAt);
  },
  onEnd(ctx, _a, interrupted) {
    const { r, sim } = ctx;
    if (interrupted) return;
    r.today.worked = 1;
    const roll = sim.rng.next();
    if (roll < 0.15) addMoodlet(ctx, 'work', 'Тяжёлый день на работе', -8, 6);
    else if (roll > 0.85) addMoodlet(ctx, 'work', 'Удачный день на работе', 6, 6);
    sim.emit({ type: 'back-from-work', t: ctx.now, residentId: r.id });
  },
};

/** Работа из дома за столом */
export const workFromHome: ActionDef = {
  id: 'work',
  icon: 'work',
  plan(ctx) {
    const { r, def } = ctx;
    const p = r.plan;
    if (!worksFromHome(def.occupation.kind) || sleepTime(ctx)) return null;
    const freelance = def.occupation.kind === 'freelance' && !def.occupation.schedule;
    let need: number;
    let pressure: number;
    if (p?.workday && p.workStartAt !== null && p.workEndAt !== null) {
      if (ctx.now < p.workStartAt - 15 * 60 || ctx.now > p.workEndAt + 2 * 3600) return null;
      need = (p.workEndAt - p.workStartAt) / 60 - 60; // минус перерывы
      pressure = ctx.now > p.workStartAt + 30 * 60 ? 4 : 0;
    } else if (freelance) {
      if (ctx.cal.hourOfDay < 10 || ctx.cal.hourOfDay > 22) return null;
      need = 300;
      pressure = 0;
    } else return null;
    if (r.today.worked >= need) return null;
    // обеденный перерыв
    const lunchBreak = !r.today.lunch && p && ctx.now >= p.lunchAt - 15 * 60 && ctx.now < p.lunchAt + 90 * 60 && r.needs.food < 70;
    const spot = homeSlot(ctx, 'work', ['study', 'living', 'bedroom', 'studio']) ?? homeSlot(ctx, 'eat');
    const target = spot?.target ?? roomPoint(ctx, roomOfType(ctx.home, 'living', 'studio') ?? ctx.home.rooms[0]);
    return {
      score: lunchBreak ? 3 : 13 + pressure,
      target,
      duration: ctx.sim.rng.int(50, 110) * 60,
      label: spot?.slot && ctx.home.rooms[spot.slot.roomIndex].furniture.some((f) => f.uid === spot.slot.furnitureUid && f.def.draw === 'concierge_desk')
        ? 'сидит у окошка в холл'
        : spot?.slot && ctx.home.rooms[spot.slot.roomIndex].furniture.some((f) => f.uid === spot.slot.furnitureUid && f.def.draw === 'computer_desk')
          ? 'сидит за компьютером'
          : 'работает за столом',
    };
  },
  perform(ctx, _a, dt) {
    ctx.r.today.worked += dt / 60;
    // сидячая работа в доме (консьержка) утомляет меньше
    gain(ctx.r, 'energy', ctx.def.occupation.kind === 'onsite' ? 0.6 : -1.0, dt);
    gain(ctx.r, 'mood', -0.5, dt);
  },
  continueScore(ctx) {
    const p = ctx.r.plan;
    if (p && !ctx.r.today.lunch && ctx.now >= p.lunchAt - 15 * 60 && ctx.now < p.lunchAt + 90 * 60 && ctx.r.needs.food < 70) return 2;
    return 11;
  },
};

/** Подработка онлайн из дома (студент, который ещё и работает в компании) */
export const sideWork: ActionDef = {
  id: 'side_work',
  icon: 'work',
  plan(ctx) {
    const { r, def } = ctx;
    const sj = def.occupation.sideJob;
    if (!sj || sleepTime(ctx) || minutesToLeave(ctx) < 40) return null;
    if (!sj.days.includes(ctx.cal.weekday)) return null;
    const h = ctx.cal.hourOfDay;
    if (h < 9 || h >= 23) return null;
    const done = r.today.side ?? 0;
    const need = sj.hours * 60;
    if (done >= need) return null;
    const spot = homeSlot(ctx, 'work', ['study', 'living', 'bedroom', 'studio']);
    if (!spot) return null;
    const late = h >= 17 ? 3 : 0;
    return {
      score: 6.5 + late + Math.min(4, (need - done) / 60),
      target: spot.target,
      duration: ctx.sim.rng.int(45, 100) * 60,
      label: 'работает онлайн',
    };
  },
  perform(ctx, _a, dt) {
    ctx.r.today.side = (ctx.r.today.side ?? 0) + dt / 60;
    gain(ctx.r, 'energy', -0.8, dt);
    gain(ctx.r, 'mood', -0.3, dt);
  },
  continueScore: () => 8,
};
