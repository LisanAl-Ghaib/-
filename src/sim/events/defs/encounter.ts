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
    return base * (c.hurry ? 0.15 : c.placeKind === 'bench' ? 2.5 : 1.4);
  },
  apply(c) {
    const { sim, a, b } = c;
    const da = sim.defs.residentById.get(a!)!;
    const db = sim.defs.residentById.get(b!)!;
    const talky = (SOC[da.traits.sociability] + SOC[db.traits.sociability]) / 2;
    const minutes = Math.round(sim.rng.range(4, c.placeKind === 'bench' ? 40 : 18) * (0.6 + talky * 0.5));
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
