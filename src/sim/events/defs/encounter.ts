import { chronicle } from '../../chronicle/chronicle';
import { adjust, inConflict, rel, remember } from '../../social/relations';
import { quarrel, quarrelCause, reconcile, tension, warmth } from '../../social/social';
import { startChat } from '../../social/interactions';
import type { EventDef } from '../types';

const SOC = { homebody: 0.4, balanced: 1, outgoing: 1.7 } as const;

/** Кивнули и пошли дальше */
export const greet: EventDef = {
  id: 'greet',
  trigger: 'encounter',
  weight: (c) => (c.placeKind === 'elevator' || inConflict(c.sim, c.a!, c.b!) ? 0 : 2 + (c.hurry ? 6 : 0)),
  apply(c) {
    const { sim, a, b } = c;
    const first = rel(sim, a!, b!).familiarity < 12;
    adjust(sim, a!, b!, 0.5, first ? 8 : 1);
    remember(sim, a!, b!, 'greet');
    chronicle(sim, 'greet', [a!, b!], 1, { place: c.place ?? '' });
  },
};

/** Остановились поболтать */
export const chatEvent: EventDef = {
  id: 'chat',
  trigger: 'encounter',
  weight(c) {
    const { sim, a, b } = c;
    if (c.placeKind === 'elevator' || inConflict(sim, a!, b!)) return 0;
    const ra = sim.state.residents[a!];
    const rb = sim.state.residents[b!];
    const da = sim.defs.residentById.get(a!)!;
    const db = sim.defs.residentById.get(b!)!;
    const need = (200 - ra.needs.social - rb.needs.social) / 100;
    const w = (warmth(sim, a!, b!) + warmth(sim, b!, a!)) / 2;
    const base = (SOC[da.traits.sociability] + SOC[db.traits.sociability]) * (0.6 + need) * (0.3 + w);
    return base * (c.hurry ? 0.15 : c.placeKind === 'bench' || c.placeKind === 'common' ? 2.5 : 1.4);
  },
  apply(c) {
    const { sim, a, b } = c;
    const da = sim.defs.residentById.get(a!)!;
    const db = sim.defs.residentById.get(b!)!;
    const talky = (SOC[da.traits.sociability] + SOC[db.traits.sociability]) / 2;
    const minutes = Math.round(sim.rng.range(4, c.placeKind === 'bench' || c.placeKind === 'common' ? 40 : 18) * (0.6 + talky * 0.5));
    startChat(sim, a!, b!, c.place ?? 'в подъезде', c.placeKind ?? 'stairs', minutes);
    remember(sim, a!, b!, 'chat');
  },
};

/** Поссорившиеся делают вид, что не заметили */
export const avoid: EventDef = {
  id: 'avoid',
  trigger: 'encounter',
  weight: (c) => (inConflict(c.sim, c.a!, c.b!) && c.placeKind !== 'elevator' ? 5 : 0),
  apply(c) {
    chronicle(c.sim, 'avoid', [c.a!, c.b!], 2, { place: c.place ?? '' });
  },
};

/** Случайная встреча помогла помириться */
export const reconcileMeet: EventDef = {
  id: 'reconcile-meet',
  trigger: 'encounter',
  weight(c) {
    const { sim, a, b } = c;
    const r = rel(sim, a!, b!);
    if (!r.conflict || c.hurry) return 0;
    const ra = sim.state.residents[a!];
    const rb = sim.state.residents[b!];
    const days = (sim.time - r.conflict.since) / 86400;
    if (days < 0.6) return 0;
    return Math.max(0, (ra.needs.mood + rb.needs.mood - 100) / 25) * Math.min(3, days);
  },
  apply(c) {
    reconcile(c.sim, c.a!, c.b!);
    chronicle(c.sim, 'reconcile', [c.a!, c.b!], 3, { how: 'encounter', place: c.place ?? '' });
  },
};

/** Слово за слово — и поругались прямо на лестнице */
export const quarrelMeet: EventDef = {
  id: 'quarrel-meet',
  trigger: 'encounter',
  weight: (c) => (c.placeKind === 'elevator' ? 0 : tension(c.sim, c.a!, c.b!) * (c.hurry ? 3 : 6)),
  apply(c) {
    const cause = quarrelCause(c.sim, c.a!, c.b!);
    quarrel(c.sim, c.a!, c.b!, cause);
    chronicle(c.sim, 'chat', [c.a!, c.b!], 3, { place: c.place ?? '', quarrel: true, cause, minutes: 3 });
  },
};

/** Встреча у лифта / в лифте */
export const elevatorMeet: EventDef = {
  id: 'elevator',
  trigger: 'encounter',
  weight: (c) => (c.placeKind === 'elevator' ? 10 : 0),
  apply(c) {
    const { sim, a, b } = c;
    if (inConflict(sim, a!, b!)) {
      chronicle(sim, 'elevator.awkward', [a!, b!], 2);
      return;
    }
    adjust(sim, a!, b!, 1.5, 4);
    remember(sim, a!, b!, 'elevator');
    chronicle(sim, 'elevator', [a!, b!], 2);
  },
};

/** Консьерж на посту: кто из двоих сидит у окошка в холл */
function concierge(c: Parameters<NonNullable<EventDef['weight']>>[0]): { duty: string; other: string } | null {
  if (c.placeKind !== 'lobby' && c.placeKind !== 'entrance') return null;
  for (const [x, y] of [[c.a!, c.b!], [c.b!, c.a!]]) {
    const r = c.sim.state.residents[x];
    const d = c.sim.defs.residentById.get(x)!;
    if (d.occupation.kind === 'onsite' && r.level === 0 && (r.action?.id === 'work' || r.action?.id === 'night_watch') && r.action.phase === 'perform') return { duty: x, other: y };
  }
  return null;
}

/** Консьерж замечает проходящего: кивнёт, проворчит, придержит дверь, угостит ребёнка конфетой */
export const conciergeRemark: EventDef = {
  id: 'concierge-remark',
  trigger: 'encounter',
  weight: (c) => (concierge(c) ? 7 : 0),
  apply(c) {
    const { duty, other } = concierge(c)!;
    const sim = c.sim;
    const r = sim.state.residents[other];
    const od = sim.defs.residentById.get(other)!;
    const dd = sim.defs.residentById.get(duty)!;
    const h = sim.calendar().hourOfDay;
    const w = sim.weather;
    let flavor = 'nod';
    if (sim.age(od) < 14) flavor = dd.traits.tags.some((t) => /дет|конфет/i.test(t)) ? 'candy' : 'kid';
    else if (r.carrying === 'bags') flavor = 'bags';
    else if (h >= 22.5 || h < 5.5) flavor = 'late';
    else if ((w.kind === 'rain' || w.kind === 'snow') && r.action?.target.away !== true) flavor = 'wet';
    else if (w.temp < -5 && r.action?.target.away === true) flavor = 'cold';
    else if (od.traits.tags.some((t) => /уволит/i.test(t)) && h >= 16.5 && h < 20 && sim.rng.chance(0.35)) flavor = 'quit';
    else if (sim.rng.chance(0.3)) flavor = 'chat';
    adjust(sim, duty, other, 0.8, 3);
    remember(sim, duty, other, 'greet');
    const important = flavor === 'candy' || flavor === 'kid';
    if (important || sim.rng.chance(0.45)) chronicle(sim, 'concierge', [duty, other], important ? 2 : 1, { flavor });
  },
};
