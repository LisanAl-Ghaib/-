import { mealDue } from '../../ai/helpers';
import { chronicle } from '../../chronicle/chronicle';
import { addMoodlet, bump } from '../../needs';
import { adjust, rel } from '../../social/relations';
import { goodTalk, quarrel, quarrelCause, tension, warmth } from '../../social/social';
import type { EventDef } from '../types';

/** Обычный приятный разговор */
export const talk: EventDef = {
  id: 'talk',
  trigger: 'conversation',
  weight: (c) => 6 + 3 * warmth(c.sim, c.a!, c.b!),
  apply: (c) => goodTalk(c.sim, c.a!, c.b!, 25),
};

/** Разговор по душам */
export const deepTalk: EventDef = {
  id: 'deep-talk',
  trigger: 'conversation',
  weight: (c) => 0.8 + rel(c.sim, c.a!, c.b!).familiarity / 45,
  apply(c) {
    adjust(c.sim, c.a!, c.b!, 4, 6);
    c.interaction?.notes.push('deep');
    for (const x of [c.a!, c.b!]) bump(c.sim.state.residents[x], 'mood', 4);
  },
};

/** Перемыть косточки третьему соседу */
export const gossip: EventDef = {
  id: 'gossip',
  trigger: 'conversation',
  weight(c) {
    const others = c.sim.defs.residents.filter((d) => d.id !== c.a && d.id !== c.b);
    if (!others.length) return 0;
    const da = c.sim.defs.residentById.get(c.a!)!;
    return 1.2 + (da.traits.tags.some((t) => /знает|сплет|болтлив/i.test(t)) ? 3 : 0);
  },
  apply(c) {
    const { sim, a, b } = c;
    const others = sim.defs.residents.filter((d) => d.id !== a && d.id !== b);
    const about = sim.rng.weighted(others, (d) => rel(sim, a!, d.id).familiarity + 5)!;
    const opinion = rel(sim, a!, about.id).affinity;
    // слушатель перенимает чуть-чуть отношения рассказчика
    adjust(sim, b!, about.id, Math.sign(opinion) * sim.rng.range(1, 4), 3, false);
    adjust(sim, a!, b!, 1.5, 2);
    if (sim.rng.chance(0.35)) chronicle(sim, 'gossip', [a!, b!], 1, { about: about.id });
  },
};

/** Ссора посреди разговора */
export const convQuarrel: EventDef = {
  id: 'conversation-quarrel',
  trigger: 'conversation',
  weight: (c) => tension(c.sim, c.a!, c.b!) * 14,
  apply(c) {
    const cause = quarrelCause(c.sim, c.a!, c.b!);
    quarrel(c.sim, c.a!, c.b!, cause);
    if (c.interaction) {
      c.interaction.quarrel = true;
      c.interaction.notes.push(`cause=${cause}`);
    }
  },
};

/** Совместный ужин в гостях */
export const dinnerTogether: EventDef = {
  id: 'dinner-together',
  trigger: 'conversation',
  weight(c) {
    const it = c.interaction;
    if (!it || it.kind !== 'visit' || it.dinner || !it.aptId) return 0;
    const st = c.sim.aptState(it.aptId);
    const h = c.sim.calendar().hourOfDay;
    if (h < 12 || h > 21.5) return 0;
    const hungry = [c.a!, c.b!].some((x) => {
      const r = c.sim.state.residents[x];
      return r.needs.food < 60 || !!mealDue(c.sim.ctx(r));
    });
    return hungry ? (st.meals >= 2 ? 9 : st.groceries >= 1 ? 4 : 0) : 0;
  },
  apply(c) {
    const it = c.interaction!;
    const st = c.sim.aptState(it.aptId!);
    if (st.meals >= 2) st.meals -= 2;
    else st.groceries = Math.max(0, st.groceries - 1);
    it.dinner = true;
    st.dishes += 2;
    it.notes.push(`meal=${c.sim.calendar().hourOfDay >= 17 ? 'ужин' : 'обед'}`);
    for (const x of it.members) {
      const r = c.sim.state.residents[x];
      r.needs.food = Math.min(100, r.needs.food + 55);
      const h = c.sim.calendar().hourOfDay;
      if (h >= 17) r.today.dinner = true;
      else r.today.lunch = true;
      addMoodlet({ r, now: c.sim.time }, 'dinner-guest', 'Вкусно поели вместе', 6, 6);
    }
    adjust(c.sim, c.a!, c.b!, 4, 3);
  },
};

/** Хозяин берёт гитару */
export const playMusic: EventDef = {
  id: 'play-music',
  trigger: 'conversation',
  weight(c) {
    const it = c.interaction;
    if (!it?.host || it.notes.includes('music')) return 0;
    const hd = c.sim.defs.residentById.get(it.host)!;
    return hd.habits.some((h) => h.kind === 'music') ? 2.5 : 0;
  },
  apply(c) {
    c.interaction!.notes.push('music');
    for (const x of c.interaction!.members) bump(c.sim.state.residents[x], 'mood', 6);
    adjust(c.sim, c.a!, c.b!, 3, 2);
  },
};
