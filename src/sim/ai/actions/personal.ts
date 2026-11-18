import { chronicleAt } from '../../chronicle/chronicle';
import { gain } from '../../needs';
import { visitorPresent } from '../../visitors';
import { homeSlot, roomOfType, roomPoint, sleepTime } from '../helpers';
import type { ActionDef, AgentCtx } from '../types';

export function hasTag(ctx: AgentCtx, re: RegExp): boolean {
  return ctx.def.traits.tags.some((t) => re.test(t));
}
export const INSOMNIA = /бессонн|не спится|плохо спит/i;

/** Насыпать корм питомцам */
export const feedPets: ActionDef = {
  id: 'feed_pets',
  icon: 'food',
  plan(ctx) {
    const { def, sim, home } = ctx;
    if (!def.pets.length || sleepTime(ctx)) return null;
    const left = sim.state.petFood[home.id] ?? 0;
    if (left > 0.3) return null;
    const h = ctx.cal.hourOfDay;
    const mealtime = (h >= 6 && h < 10) || (h >= 17 && h < 22);
    const begging = Object.values(sim.state.pets).some((p) => p.aptId === home.id && p.mode === 'watch' && p.food < 40);
    if (!mealtime && !begging) return null;
    const bowl = homeSlot(ctx, 'pets');
    const room = roomOfType(home, 'kitchen', 'hall') ?? home.rooms[0];
    const cats = def.pets.every((p) => p.species === 'cat');
    return {
      score: begging ? 9 : 6,
      target: bowl?.target ?? roomPoint(ctx, room),
      duration: 3 * 60,
      label: cats ? 'насыпает корм кошкам' : 'кормит собаку',
    };
  },
  onEnd(ctx, _a, interrupted) {
    if (!interrupted) ctx.sim.state.petFood[ctx.home.id] = 1 + ctx.def.pets.length * 0.6;
  },
};

/** Принимает родных, приехавших в гости (назначается гостем) */
export const familyVisit: ActionDef = {
  id: 'family_visit',
  icon: 'talk',
  plan: () => null,
  perform(ctx, _a, dt) {
    gain(ctx.r, 'social', 30, dt);
    gain(ctx.r, 'mood', 6, dt);
  },
  shouldEnd(ctx, a) {
    return !visitorPresent(ctx.sim, String(a.data.visitor));
  },
};

/** Не спится: сидит ночью у окошка (или на кухне) */
export const nightWatch: ActionDef = {
  id: 'night_watch',
  icon: 'dots',
  plan(ctx) {
    if (!hasTag(ctx, INSOMNIA)) return null;
    const h = ctx.cal.hourOfDay;
    if (!(h >= 21.5 || h < 5)) return null;
    const woke = ctx.r.recent.insomnia !== undefined && ctx.now - ctx.r.recent.insomnia < 60 * 60;
    if (sleepTime(ctx) && !woke) return null;
    const onsite = ctx.def.occupation.kind === 'onsite';
    const spot = (onsite ? homeSlot(ctx, 'work') : null) ?? homeSlot(ctx, 'eat', ['kitchen']) ?? homeSlot(ctx, 'sit');
    if (!spot) return null;
    return {
      score: woke ? 12 : 6.5,
      target: spot.target,
      duration: ctx.sim.rng.int(30, 90) * 60,
      label: onsite ? 'сидит у окошка — не спится' : 'сидит на кухне — не спится',
    };
  },
  onArrive(ctx) {
    const c = ctx.cal;
    if (c.hourOfDay < 0.5 || c.hourOfDay >= 4) return true;
    const key = `insomnia:${ctx.r.id}:${c.dayIndex}`;
    if (!ctx.sim.state.flags[key] && ctx.sim.rng.chance(0.5)) {
      ctx.sim.state.flags[key] = ctx.now;
      chronicleAt(ctx.sim, ctx.now, 'insomnia', [ctx.r.id], 1, { onsite: ctx.def.occupation.kind === 'onsite' });
    }
    return true;
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'energy', 1, dt);
  },
};
