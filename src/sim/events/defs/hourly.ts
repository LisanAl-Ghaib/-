import { chronicle } from '../../chronicle/chronicle';
import type { EventDef } from '../types';

/** Выздоровление */
export const recovery: EventDef = {
  id: 'recovery',
  trigger: 'hourly',
  chance: (c) => (Object.values(c.sim.state.residents).some((r) => r.sick && r.sick.until <= c.now) ? 1 : 0),
  apply(c) {
    for (const r of Object.values(c.sim.state.residents)) {
      if (!r.sick || r.sick.until > c.now) continue;
      r.sick = null;
      r.moodlets = r.moodlets.filter((m) => m.key !== 'sick');
      chronicle(c.sim, 'recovered', [r.id], 2);
    }
  },
};
