import { addMoodlet, gain } from '../../needs';
import { hasTag, INSOMNIA } from './personal';
import { gv, homeSlot, minutesToLeave, roomOfType, roomPoint, sleepTime, urgency } from '../helpers';
import type { ActionDef } from '../types';

/** Ночной сон в своей кровати. Будильник — по распорядку. */
export const sleep: ActionDef = {
  id: 'sleep',
  icon: 'zzz',
  plan(ctx) {
    const { r } = ctx;
    const night = sleepTime(ctx);
    const exhausted = r.needs.energy < 10;
    // проснулась среди ночи от бессонницы — не сразу уснёт снова
    if (r.recent.insomnia !== undefined && ctx.now - r.recent.insomnia < 45 * 60 && !exhausted) return null;
    const sick = !!(r.sick && r.sick.until > ctx.now) && r.needs.energy < 50;
    if (!night && !exhausted && !sick) return null;
    const bed = homeSlot(ctx, 'sleep', ['bedroom', 'studio', 'living']) ?? homeSlot(ctx, 'nap');
    if (!bed) return null;
    const p = r.plan!;
    const late = Math.max(0, (ctx.now - p.bedAt) / 3600);
    return {
      score: night ? 18 + late * 4 : sick ? 10 : 9,
      target: bed.target,
      duration: 12 * 3600,
      label: sick && !night ? 'лежит в постели' : 'спит',
      interruptible: false,
    };
  },
  perform(ctx, a, dt) {
    const sick = ctx.r.sick && ctx.r.sick.until > ctx.now;
    gain(ctx.r, 'energy', sick ? 8 : 12.5, dt);
    // бессонница: примерно каждую вторую ночь просыпается и долго не может уснуть
    if (sleepTime(ctx) && !a.data.wokeOnce && hasTag(ctx, INSOMNIA) && ctx.now - a.performStart > 90 * 60 && ctx.sim.rng.chance(dt / (5 * 3600))) {
      a.data.wokeOnce = true;
      a.data.insomnia = true;
    }
  },
  shouldEnd(ctx, a) {
    const { r } = ctx;
    if (a.data.insomnia) return true;
    if (!r.plan) return r.needs.energy >= 95;
    if (sleepTime(ctx)) {
      a.data.night = true; // ночной сон — до будильника/утра
      return false;
    }
    // лёг днём от усталости — встанет, когда немного отдохнёт
    if (!a.data.night) return r.needs.energy >= 60;
    if (r.plan.workday && minutesToLeave(ctx) < 75) return true; // будильник
    if (r.needs.energy >= 72) return true;
    return ctx.now >= r.plan.wakeAt + 2.5 * 3600;
  },
  onEnd(ctx, a) {
    if (a.data.insomnia) {
      ctx.r.recent.insomnia = ctx.now;
      return;
    }
    ctx.r.wokeAt = ctx.now;
    // встал — кровать осталась незаправленной
    const st = ctx.sim.aptState(ctx.home.id);
    const slot = a.target.slot;
    if (slot && ctx.sim.slotIndex.get(slot)?.pose === 'lie' && !st.unmade.includes(slot)) st.unmade.push(slot);
    if (ctx.r.needs.energy < 45) addMoodlet(ctx, 'not-slept', gv(ctx.def, 'Не выспался', 'Не выспалась'), -7, 8);
  },
};

/** Дневной сон на диване или кровати */
export const nap: ActionDef = {
  id: 'nap',
  icon: 'zzz',
  plan(ctx) {
    const { r, def } = ctx;
    if (sleepTime(ctx) || r.needs.energy > 40 || minutesToLeave(ctx) < 90) return null;
    const spot = homeSlot(ctx, 'nap') ?? homeSlot(ctx, 'sleep');
    if (!spot) return null;
    const lazy = def.traits.activity === 'lazy' ? 1.5 : 1;
    return {
      score: urgency(r.needs.energy, 45) * 0.7 * lazy,
      target: spot.target,
      duration: ctx.sim.rng.int(25, 70) * 60,
      label: 'дремлет',
    };
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'energy', 14, dt);
  },
};

/** Утро: умыться, собраться */
export const wash: ActionDef = {
  id: 'wash',
  icon: 'wash',
  plan(ctx) {
    const { r } = ctx;
    if (r.today.washed || ctx.now - r.wokeAt > 90 * 60 || sleepTime(ctx)) return null;
    const spot = homeSlot(ctx, 'wash', ['bathroom', 'hall', 'kitchen']);
    const hall = roomOfType(ctx.home, 'hall', 'bathroom') ?? ctx.home.rooms[0];
    const bath = spot?.slot.pose === 'lie';
    return {
      score: 9,
      target: spot?.target ?? roomPoint(ctx, hall),
      duration: ctx.sim.rng.int(bath ? 20 : 8, bath ? 35 : 18) * 60,
      label: bath ? 'принимает ванну' : spot ? 'умывается' : gv(ctx.def, 'собирается', 'собирается'),
      interruptible: false,
    };
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'mood', 4, dt);
    gain(ctx.r, 'energy', 6, dt);
  },
  onEnd(ctx) {
    ctx.r.today.washed = true;
  },
};
