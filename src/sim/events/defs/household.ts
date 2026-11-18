import { chronicle } from '../../chronicle/chronicle';
import { bump } from '../../needs';
import { rel } from '../../social/relations';
import { goodTalk, quarrel, quarrelCause, reconcile, tension } from '../../social/social';
import type { EventDef } from '../types';

/** Семья дома: болтают, ссорятся, мирятся */
export const familyChat: EventDef = {
  id: 'family-chat',
  trigger: 'household',
  weight: (c) => (rel(c.sim, c.a!, c.b!).conflict ? 0.5 : 4),
  apply(c) {
    goodTalk(c.sim, c.a!, c.b!, 15);
    for (const x of [c.a!, c.b!]) bump(c.sim.state.residents[x], 'social', 12);
  },
};

export const familyQuarrel: EventDef = {
  id: 'family-quarrel',
  trigger: 'household',
  weight: (c) => (rel(c.sim, c.a!, c.b!).conflict ? 0 : tension(c.sim, c.a!, c.b!) * 6),
  apply(c) {
    const cause = quarrelCause(c.sim, c.a!, c.b!);
    quarrel(c.sim, c.a!, c.b!, cause);
    chronicle(c.sim, 'quarrel', [c.a!, c.b!], 3, { cause, place: 'дома' });
  },
};

export const familyReconcile: EventDef = {
  id: 'family-reconcile',
  trigger: 'household',
  weight(c) {
    const r = rel(c.sim, c.a!, c.b!);
    if (!r.conflict || c.sim.time - r.conflict.since < 2 * 3600) return 0;
    const ra = c.sim.state.residents[c.a!];
    const rb = c.sim.state.residents[c.b!];
    return 1 + Math.max(0, (ra.needs.mood + rb.needs.mood - 70) / 30);
  },
  apply(c) {
    reconcile(c.sim, c.a!, c.b!);
    chronicle(c.sim, 'reconcile', [c.a!, c.b!], 3, { how: 'family', hour: c.sim.calendar().hour });
  },
};
