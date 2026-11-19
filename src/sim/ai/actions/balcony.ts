import { chronicle } from '../../chronicle/chronicle';
import { gain } from '../../needs';
import { daytime, fitDuration, gv, habit, minutesToLeave, novelty, sleepTime } from '../helpers';
import type { ActionDef, AgentCtx } from '../types';

/**
 * Выйти на балкон (он есть у каждой квартиры выше первого этажа): подышать, постоять
 * с чашкой, посмотреть во двор, полить цветы, развесить бельё. В дождь и в мороз — ненадолго.
 * Соседи на балконах разных этажей иногда переговариваются (см. encounters.ts).
 */
type Kind = 'air' | 'tea' | 'look' | 'plants' | 'laundry' | 'book';

const LABELS: Record<Kind, (ctx: AgentCtx) => string> = {
  air: (c) => gv(c.def, 'вышел на балкон подышать', 'вышла на балкон подышать'),
  tea: () => 'пьёт чай на балконе',
  look: () => 'смотрит с балкона во двор',
  plants: () => 'поливает цветы на балконе',
  laundry: () => 'развешивает бельё на балконе',
  book: () => 'читает на балконе',
};

export const balcony: ActionDef = {
  id: 'balcony',
  icon: 'leaf',
  plan(ctx) {
    const { sim, r, def } = ctx;
    const b = ctx.home.balcony;
    if (!b || sleepTime(ctx) || !daytime(ctx, 7, 23) || minutesToLeave(ctx) < 20) return null;
    const w = sim.weather;
    const appeal = sim.outdoorAppeal(def);
    // ливень или метель — разве что на минутку
    const nasty = (w.kind === 'rain' || w.kind === 'snow') && w.intensity > 0.6;
    if (nasty && !sim.rng.chance(0.15)) return null;
    const cold = w.temp < -3;
    const items = ctx.home.def?.balcony.items ?? [];
    const tags = def.traits.tags;
    const kinds: { k: Kind; w: number }[] = [
      { k: 'air', w: 2 },
      { k: 'look', w: 1.5 + (tags.some((t) => /окн|смотрит/i.test(t)) ? 2 : 0) },
      { k: 'tea', w: tags.some((t) => /чай|кофе/i.test(t)) ? 2.5 : 0.6 },
      { k: 'plants', w: items.includes('plants') ? 1 + habit(ctx, 'plants') * 3 : 0 },
      { k: 'laundry', w: items.includes('laundry') && !cold && w.kind !== 'rain' ? 1.2 : 0 },
      { k: 'book', w: !cold && w.temp > 12 ? habit(ctx, 'reading') * 2.5 : 0 },
    ];
    const kind = sim.rng.weighted(kinds, (x) => x.w)!.k;
    // в тёплый вечер — с удовольствием, в мороз — редко и коротко
    const warm = w.temp > 15 ? 2.5 : w.temp > 5 ? 1.4 : cold ? 0 : 0.6;
    const evening = ctx.cal.hourOfDay >= 18 ? 0.8 : 0;
    const score = (2.2 + warm + evening + appeal * 1.5 + (100 - r.needs.mood) / 35) * novelty(ctx, 'balcony', 5 * 3600);
    const minutes = cold || nasty ? sim.rng.int(3, 7) : kind === 'book' ? sim.rng.int(20, 45) : sim.rng.int(6, 20);
    return {
      score: Math.max(0.1, score),
      target: { level: ctx.home.level, x: b.standX },
      duration: fitDuration(ctx, minutes * 60),
      label: LABELS[kind](ctx),
      data: { scene: kind },
    };
  },
  onArrive(ctx) {
    // лицом наружу, к перилам
    ctx.r.facing = ctx.home.side === 'left' ? -1 : 1;
    const key = `balcony:${ctx.r.id}:${ctx.cal.dayIndex}`;
    if (!ctx.sim.state.flags[key] && ctx.sim.rng.chance(0.18)) {
      ctx.sim.state.flags[key] = ctx.now;
      chronicle(ctx.sim, 'balcony', [ctx.r.id], 1, { scene: String(ctx.r.action?.data.scene ?? 'air'), temp: Math.round(ctx.sim.weather.temp), kind: ctx.sim.weather.kind });
    }
    return true;
  },
  perform(ctx, a, dt) {
    gain(ctx.r, 'mood', 5, dt);
    gain(ctx.r, 'energy', 2, dt);
    if (a.data.scene === 'book') gain(ctx.r, 'mood', 3, dt);
  },
  // разговор с соседом с балкона — не уходит, пока не договорят
  shouldEnd(ctx, a) {
    return ctx.now >= a.endsAt && ctx.r.interaction === null;
  },
};
