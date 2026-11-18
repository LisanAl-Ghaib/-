import type { ChronicleEntry } from '../state';
import type { Simulation } from '../simulation';
import { TemplateNarrator, type Narrator } from './narrator';

export const CHRONICLE_LIMIT = 800;

let narrator: Narrator = new TemplateNarrator();

/** Подменить нарратор (например, на LLM) */
export function setNarrator(n: Narrator): void {
  narrator = n;
}

/** Записать событие в хронику дома */
export function chronicle(
  sim: Simulation,
  kind: string,
  actors: string[],
  importance: 1 | 2 | 3,
  data: ChronicleEntry['data'] = {},
  t = sim.time,
): ChronicleEntry {
  const s = sim.state;
  const base = { id: s.nextId++, t, kind, actors, importance, data };
  let text: string;
  try {
    text = narrator.describe(base, {
      defs: sim.defs,
      floorOf: (id) => sim.defs.layout.aptById.get(sim.defs.residentById.get(id)?.apartment ?? '')?.level ?? 0,
    });
  } catch (e) {
    text = `${kind}: ${actors.join(', ')}`;
    console.warn('[narrator]', e);
  }
  const entry: ChronicleEntry = { ...base, text };
  s.chronicle.push(entry);
  if (s.chronicle.length > CHRONICLE_LIMIT) s.chronicle.splice(0, s.chronicle.length - CHRONICLE_LIMIT);
  sim.emit({ type: 'chronicle', entry });
  return entry;
}
