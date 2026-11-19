import { chronicleAt } from '../../chronicle/chronicle';
import { gain } from '../../needs';
import { visitorPresent } from '../../visitors';
import { homeSlot, roomOfType, roomPoint, sleepTime } from '../helpers';
import type { ActionDef, AgentCtx } from '../types';

export function hasTag(ctx: AgentCtx, re: RegExp): boolean {
  return ctx.def.traits.tags.some((t) => re.test(t));
}
export const INSOMNIA = /бессонн|не спится|плохо спит/i;
export const NIGHTMARES = /кошмар/i;
/** Курит в окно (а не только у подъезда) */
export const WINDOW_SMOKER = /в окно/i;
/** «курит … на балконе» */
export const BALCONY_SMOKER = /курит.*на балкон/i;
const LONELY = /одинок/i;

/** Проснулся от кошмара: сидит в кровати, тяжело дышит (назначается сном) */
export const nightmare: ActionDef = {
  id: 'nightmare',
  plan(ctx) {
    const r = ctx.r;
    const at = r.recent.nightmareAt;
    if (at === undefined || ctx.now - at > 180 || (r.recent.nightmare ?? -1e9) >= at) return null;
    const bed = homeSlot(ctx, 'sleep');
    return {
      score: 60,
      target: bed?.target ?? { level: r.level, x: r.x },
      duration: ctx.sim.rng.int(3, 6) * 60,
      label: 'сидит в кровати — приснился кошмар',
      interruptible: false,
    };
  },
  onArrive(ctx, a) {
    // сел на кровати лицом к нам
    const slot = a.target.slot ? ctx.sim.slotIndex.get(a.target.slot) : undefined;
    ctx.r.pose = 'sit';
    ctx.r.front = true;
    ctx.r.y = ctx.sim.defs.layout.floorY(ctx.r.level) - (slot?.dy ?? 6);
    if (slot) ctx.r.x = slot.x - 4;
    ctx.r.bubble = { icon: 'gloom', until: ctx.now + 120 };
    const c = ctx.cal;
    const key = `nightmare:${ctx.r.id}:${c.dayIndex}`;
    if (!ctx.sim.state.flags[key] && ctx.sim.rng.chance(0.5)) {
      ctx.sim.state.flags[key] = ctx.now;
      chronicleAt(ctx.sim, ctx.now, 'nightmare', [ctx.r.id], 1, { hour: c.hour });
    }
    return true;
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'mood', -6, dt);
  },
};

/** Где курить в окно: у окна комнаты с пепельницей на подоконнике (или кухни) */
function smokeSpot(ctx: AgentCtx): { level: number; x: number } | null {
  const rooms = ctx.home.rooms.filter((r) => r.def.window);
  const room = rooms.find((r) => r.furniture.some((f) => f.def.draw === 'ashtray')) ?? rooms.find((r) => r.type === 'kitchen') ?? rooms[0];
  if (!room) return null;
  const ash = room.furniture.find((f) => f.def.draw === 'ashtray');
  return { level: ctx.home.level, x: ash ? Math.round(ash.x + ash.w / 2) : Math.round((room.x0 + room.x1) / 2) };
}

/** Курит в открытое окно: днём между делами, ночью — когда не спится или после кошмара */
export const smokeWindow: ActionDef = {
  id: 'smoke_window',
  icon: 'dots',
  plan(ctx) {
    if (!hasTag(ctx, WINDOW_SMOKER)) return null;
    const h = ctx.def.habits.find((x) => x.kind === 'smoking')?.strength ?? 0;
    if (h <= 0) return null;
    const r = ctx.r;
    const woke = (r.recent.insomnia !== undefined && ctx.now - r.recent.insomnia < 70 * 60) || (r.recent.nightmare !== undefined && ctx.now - r.recent.nightmare < 40 * 60);
    if (sleepTime(ctx) && !woke) return null;
    let spot = smokeSpot(ctx);
    if (!spot) return null;
    // «курит и на балконе»: если не льёт и не метёт — примерно через раз выходит на балкон
    const w = ctx.sim.weather;
    const nasty = (w.kind === 'rain' || w.kind === 'snow') && w.intensity > 0.6;
    const onBalcony = !!ctx.home.balcony && hasTag(ctx, BALCONY_SMOKER) && !nasty && w.temp > -15 && ctx.sim.rng.chance(0.5);
    if (onBalcony) spot = { level: ctx.home.level, x: ctx.home.balcony!.standX };
    const night = ctx.cal.hourOfDay >= 22 || ctx.cal.hourOfDay < 6;
    const since = ctx.now - Math.max(r.recent.smoke_window ?? -1e9, r.recent.smoke ?? -1e9);
    const crave = Math.min(1.8, since / (heavy(h) ? 2700 : 2 * 3600)); // давно не курил — тянет
    // после кошмара — сразу к окну (если с тех пор ещё не курил)
    const afterNightmare = r.recent.nightmare !== undefined && ctx.now - r.recent.nightmare < 15 * 60 && since > ctx.now - r.recent.nightmare;
    return {
      // днём, если погода не совсем дрянь, примерно через раз выходит к подъезду
      score: (1 + h * 4 + (night ? 2 : 0) + (woke ? 3 : 0)) * crave * (!night && ctx.sim.outdoorAppeal(ctx.def) > 0.2 ? 0.42 : 1) + (afterNightmare ? 14 : 0),
      target: spot,
      duration: ctx.sim.rng.int(5, 9) * 60,
      label: onBalcony ? 'курит на балконе' : 'курит в окно',
      data: { balcony: onBalcony },
    };
  },
  onArrive(ctx, a) {
    // на балконе — лицом наружу, к перилам
    ctx.r.facing = a.data.balcony ? (ctx.home.side === 'left' ? -1 : 1) : 1;
    const c = ctx.cal;
    if ((c.hourOfDay >= 23 || c.hourOfDay < 5) && !a.data.noted) {
      const key = `smokewin:${ctx.r.id}:${c.dayIndex}`;
      if (!ctx.sim.state.flags[key] && ctx.sim.rng.chance(0.35)) {
        ctx.sim.state.flags[key] = ctx.now;
        chronicleAt(ctx.sim, ctx.now, 'smoke.window', [ctx.r.id], 1, { hour: c.hour, balcony: !!a.data.balcony });
      }
    }
    return true;
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'mood', 10, dt);
  },
};

/** Рыбка в аквариуме: покормить раз в день (одинокий — заодно поговорить с ней) */
export const feedFish: ActionDef = {
  id: 'feed_fish',
  icon: 'food',
  plan(ctx) {
    const { def, sim, home } = ctx;
    if (!def.pets.some((p) => p.species === 'fish') || sleepTime(ctx)) return null;
    const tank = home.slots.find((s) => s.use.includes('look') && home.rooms[s.roomIndex].furniture.some((f) => f.uid === s.furnitureUid && f.def.draw === 'aquarium'));
    if (!tank) return null;
    const h = ctx.cal.hourOfDay;
    if (!((h >= 6 && h < 10) || (h >= 18 && h < 23))) return null;
    const last = ctx.r.recent.feed_fish ?? -1e9;
    if (ctx.now - last < 14 * 3600) return null;
    const talk = hasTag(ctx, LONELY) && sim.rng.chance(0.4);
    return {
      score: 7,
      target: { level: home.level, x: tank.x, slot: tank.key },
      duration: (talk ? sim.rng.int(6, 12) : 3) * 60,
      label: talk ? 'разговаривает с рыбкой' : 'кормит рыбку',
      data: { talking: talk },
    };
  },
  onArrive(ctx, a) {
    if (!a.data.talking) return true;
    const key = `fishtalk:${ctx.r.id}`;
    if (ctx.now - (ctx.sim.state.flags[key] ?? -1e9) > 5 * 86400) {
      ctx.sim.state.flags[key] = ctx.now;
      chronicleAt(ctx.sim, ctx.now, 'fish.talk', [ctx.r.id], 1);
    }
    return true;
  },
  perform(ctx, a, dt) {
    gain(ctx.r, 'mood', a.data.talking ? 6 : 3, dt);
    if (a.data.talking) gain(ctx.r, 'social', 6, dt);
  },
};

/** Насыпать корм питомцам */
export const feedPets: ActionDef = {
  id: 'feed_pets',
  icon: 'food',
  plan(ctx) {
    const { def, sim, home } = ctx;
    if (!def.pets.some((p) => p.species !== 'fish') || sleepTime(ctx)) return null;
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
      label: onsite ? 'сидит у окошка — не спится' : ctx.home.rooms[spot.slot.roomIndex].type === 'kitchen' ? 'сидит на кухне — не спится' : 'сидит в темноте — не спится',
    };
  },
  onArrive(ctx) {
    const c = ctx.cal;
    if (c.hourOfDay < 0.5 || c.hourOfDay >= 4) return true;
    const key = `insomnia:${ctx.r.id}:${c.dayIndex}`;
    if (!ctx.sim.state.flags[key] && ctx.sim.rng.chance(0.5)) {
      ctx.sim.state.flags[key] = ctx.now;
      chronicleAt(ctx.sim, ctx.now, 'insomnia', [ctx.r.id], 1, { onsite: ctx.def.occupation.kind === 'onsite', dark: hasTag(ctx, /не включает свет/i) });
    }
    return true;
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'energy', 1, dt);
  },
};

/** Заядлый курильщик: тянет каждые ~45 минут */
function heavy(h: number): boolean {
  return h >= 0.9;
}
